import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { PricingService } from '../_shared/services/PricingService.ts';
import { AvailabilityService } from '../_shared/services/AvailabilityService.ts';
import { PaymentService } from '../_shared/services/PaymentService.ts';
import { WalletService } from '../_shared/services/WalletService.ts';
import { BookingService } from '../_shared/services/BookingService.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type ConsultationType = 'chat' | 'voice' | 'video';

const asConsultationType = (value: unknown): ConsultationType | null => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'chat' || normalized === 'voice' || normalized === 'video') return normalized;
  return null;
};

const normalizeTimeInput = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (/^\d{2}:\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{2}:\d{2}:\d{2}$/.test(trimmed)) return trimmed.slice(0, 5);
  return null;
};

const roundMoney = (value: number) => Number((Math.round(value * 100) / 100).toFixed(2));
const toTimeKey = (value: unknown) => String(value || '').trim().slice(0, 5);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      throw new Error('Supabase env vars are not configured');
    }

    const authHeader = req.headers.get('Authorization') || '';
    const authedClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await authedClient.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload = await req.json();
    const {
      appointmentId,
      proposedDate,
      proposedTime,
      proposedDuration,
      proposedConsultationType,
    } = payload;

    if (!appointmentId) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: appointmentId' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey);

    // Fetch appointment details
    const { data: appointment, error: appointmentError } = await serviceClient
      .from('appointments')
      .select('*')
      .eq('id', appointmentId)
      .eq('patient_id', user.id)
      .maybeSingle();

    if (appointmentError || !appointment) {
      return new Response(JSON.stringify({ error: 'Appointment not found or not authorized' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch patient profile for email
    const { data: profile, error: profileError } = await serviceClient
      .from('profiles')
      .select('email')
      .eq('user_id', user.id)
      .maybeSingle();

    if (profileError) {
      console.warn('[reschedule-payment-initiate] profile lookup failed:', profileError.message);
    }

    const paymentService = new PaymentService(serviceClient);
    const pricingService = new PricingService(serviceClient);
    const availabilityService = new AvailabilityService(serviceClient);
    const walletService = new WalletService(serviceClient);
    const bookingService = new BookingService(
      serviceClient,
      pricingService,
      availabilityService,
      paymentService,
      walletService,
    );

    const metadataProposedDate = typeof proposedDate === 'string' && proposedDate.trim().length > 0
      ? proposedDate.trim()
      : (appointment.reschedule_proposed_date || null);
    const metadataProposedTime = normalizeTimeInput(proposedTime) || normalizeTimeInput(appointment.reschedule_proposed_time);
    const metadataProposedDurationRaw = Number(
      proposedDuration ?? appointment.reschedule_proposed_duration_minutes ?? appointment.duration_minutes ?? 30,
    );
    const metadataProposedDuration = Math.max(5, Math.round(Number.isFinite(metadataProposedDurationRaw) ? metadataProposedDurationRaw : 30));
    const currentDuration = Math.max(5, Math.round(Number(appointment.duration_minutes || 30)));

    let metadataProposedConsultationType = asConsultationType(proposedConsultationType)
      || asConsultationType(appointment.reschedule_proposed_consultation_type)
      || asConsultationType((appointment.price_breakdown as Record<string, unknown> | null)?.consultation_type);

    if (!metadataProposedConsultationType && appointment.consultation_type_id) {
      const { data: consultationTypeRow, error: consultationTypeError } = await serviceClient
        .from('consultation_types')
        .select('name')
        .eq('id', appointment.consultation_type_id)
        .maybeSingle();
      if (consultationTypeError) {
        console.warn('[reschedule-payment-initiate] consultation type lookup failed:', consultationTypeError.message);
      } else {
        metadataProposedConsultationType = asConsultationType(consultationTypeRow?.name);
      }
    }

    if (!metadataProposedDate || !metadataProposedTime) {
      return new Response(JSON.stringify({ error: 'Missing proposedDate or proposedTime for reschedule payment' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!appointment.doctor_id) {
      return new Response(JSON.stringify({ error: 'Appointment is missing doctor information' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const appointmentStatus = String(appointment.status || '').trim().toLowerCase();
    if (!['pending_approval', 'confirmed', 'no_show'].includes(appointmentStatus)) {
      return new Response(JSON.stringify({ error: `Cannot reschedule appointment in status ${appointment.status}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const requestStatus = String(appointment.reschedule_request_status || 'none').trim().toLowerCase();
    if (requestStatus === 'pending') {
      return new Response(JSON.stringify({ error: 'A reschedule request is already pending for this appointment.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (metadataProposedDuration < currentDuration) {
      return new Response(JSON.stringify({ error: 'Only duration upgrades are allowed for reschedule.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const proposedDateTime = new Date(`${metadataProposedDate}T${metadataProposedTime}:00`);
    if (Number.isNaN(proposedDateTime.getTime()) || proposedDateTime.getTime() <= Date.now()) {
      return new Response(JSON.stringify({ error: 'Proposed reschedule date/time must be in the future.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const proposedTimeKey = toTimeKey(metadataProposedTime);
    const { data: sameDayAppointments, error: sameDayError } = await serviceClient
      .from('appointments')
      .select('id, status, time, slot_locked_until, reschedule_request_status, reschedule_proposed_date, reschedule_proposed_time')
      .eq('doctor_id', appointment.doctor_id)
      .eq('date', metadataProposedDate);

    if (sameDayError) {
      throw new Error(`Failed to validate slot availability: ${sameDayError.message}`);
    }

    const nowIso = Date.now();
    const slotConflict = (sameDayAppointments || []).some((row: {
      id?: string;
      status?: string | null;
      time?: string | null;
      slot_locked_until?: string | null;
      reschedule_request_status?: string | null;
      reschedule_proposed_date?: string | null;
      reschedule_proposed_time?: string | null;
    }) => {
      if (row.id === appointmentId) return false;

      const status = String(row.status || '').trim().toLowerCase();
      const statusTimeMatches = toTimeKey(row.time) === proposedTimeKey;
      if (!statusTimeMatches) {
        const hasPendingRescheduleAtSlot =
          String(row.reschedule_request_status || '').trim().toLowerCase() === 'pending' &&
          String(row.reschedule_proposed_date || '') === metadataProposedDate &&
          toTimeKey(row.reschedule_proposed_time) === proposedTimeKey;
        return hasPendingRescheduleAtSlot;
      }

      if (['pending_approval', 'confirmed', 'in_progress', 'completed'].includes(status)) return true;
      if (status === 'pending_payment' && row.slot_locked_until) {
        const lockTs = new Date(row.slot_locked_until).getTime();
        return Number.isFinite(lockTs) && lockTs > nowIso;
      }
      return false;
    });

    if (slotConflict) {
      return new Response(JSON.stringify({ error: 'Selected doctor slot is not available.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const preview = await bookingService.previewPrice({
      doctorId: appointment.doctor_id,
      duration: metadataProposedDuration,
      consultationType: metadataProposedConsultationType || 'video',
    });
    const proposedPrice = roundMoney(Number(preview.finalPrice || 0));

    const { data: paymentRows, error: paymentRowsError } = await serviceClient
      .from('payments')
      .select('amount,status')
      .eq('appointment_id', appointmentId);

    if (paymentRowsError) {
      throw new Error(`Failed to load existing payments: ${paymentRowsError.message}`);
    }

    const successfulStatuses = new Set(['completed', 'success', 'paid', 'succeeded']);
    let alreadyPaid = (paymentRows || []).reduce((sum: number, row: { amount?: number | null; status?: string | null }) => {
      const status = String(row.status || '').trim().toLowerCase();
      if (!successfulStatuses.has(status)) return sum;
      return sum + Number(row.amount || 0);
    }, 0);

    const currentFinalPrice = roundMoney(Number(appointment.final_price || 0));
    if (alreadyPaid <= 0 && currentFinalPrice > 0) {
      alreadyPaid = currentFinalPrice;
    }
    alreadyPaid = roundMoney(alreadyPaid);

    const upgradeAmount = roundMoney(Math.max(0, proposedPrice - alreadyPaid));
    if (upgradeAmount <= 0) {
      return new Response(JSON.stringify({
        error: 'No upgrade payment is required for this reschedule.',
        upgradeAmount,
        proposedPrice,
        alreadyPaid,
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const result = await paymentService.createPaymentIntent({
      appointmentId,
      patientId: user.id,
      doctorId: appointment.doctor_id,
      email: profile?.email || user.email || '',
      amount: upgradeAmount,
      metadata: {
        type: 'reschedule_upgrade',
        proposed_price: proposedPrice,
        original_price: currentFinalPrice,
        already_paid: alreadyPaid,
        computed_upgrade_amount: upgradeAmount,
        proposed_date: metadataProposedDate,
        proposed_time: metadataProposedTime,
        proposed_duration: metadataProposedDuration,
        proposed_consultation_type: metadataProposedConsultationType || 'video',
        pricing_profile_id: preview.pricingProfileId,
      },
    });

    return new Response(JSON.stringify({
      ...result,
      upgradeAmount,
      proposedPrice,
      alreadyPaid,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('[reschedule-payment-initiate] error', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown payment initiation error',
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
