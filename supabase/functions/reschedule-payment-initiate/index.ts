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
type ReschedulePaystackMethod = 'paystack' | 'hybrid';

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
const asReschedulePaystackMethod = (value: unknown): ReschedulePaystackMethod =>
  String(value || '').trim().toLowerCase() === 'hybrid' ? 'hybrid' : 'paystack';
const RESCHEDULE_PENDING_INTENT_MAX_AGE_MS = 30 * 60 * 1000;

type ReschedulePendingPaystackRow = {
  amount?: number | null;
  provider_reference?: string | null;
  payment_reference?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
  patient_id?: string | null;
  appointment_id?: string | null;
};

const rollbackExpiredOrSupersededHybridWallet = async (
  serviceClient: InstanceType<typeof createClient>,
  row: ReschedulePendingPaystackRow,
  fallbackPatientId: string,
  reason: string,
) => {
  const metadata = (row.metadata || {}) as Record<string, unknown>;
  const paymentMode = String(metadata.payment_mode || '').trim().toLowerCase();
  const walletPaymentReference = String(metadata.wallet_payment_reference || '').trim();
  const walletAppliedRaw = Number(metadata.wallet_applied_amount || 0);
  const walletApplied = Number.isFinite(walletAppliedRaw) && walletAppliedRaw > 0
    ? roundMoney(walletAppliedRaw)
    : 0;

  if (paymentMode !== 'hybrid' || walletApplied <= 0) return 0;

  const appointmentId = String(row.appointment_id || metadata.appointment_id || '').trim();
  const patientId = String(row.patient_id || metadata.patient_id || fallbackPatientId || '').trim();
  if (!appointmentId || !patientId) return 0;

  const { data: rollbackRows, error: rollbackLookupError } = await serviceClient
    .from('patient_wallet_transactions')
    .select('amount')
    .eq('appointment_id', appointmentId)
    .eq('patient_id', patientId)
    .eq('direction', 'credit')
    .eq('transaction_type', 'adjustment')
    .eq('status', 'completed')
    .ilike('narration', 'Reschedule hybrid payment rollback%');

  if (rollbackLookupError) {
    throw new Error(`Failed checking existing hybrid reschedule rollback rows: ${rollbackLookupError.message}`);
  }

  const alreadyRolledBack = roundMoney((rollbackRows || []).reduce((sum: number, item: any) => (
    sum + Number(item.amount || 0)
  ), 0));
  const rollbackOutstanding = roundMoney(Math.max(walletApplied - alreadyRolledBack, 0));

  if (rollbackOutstanding > 0) {
    const { error: rollbackError } = await serviceClient.rpc('credit_patient_wallet_adjustment', {
      p_patient_id: patientId,
      p_appointment_id: appointmentId,
      p_amount: rollbackOutstanding,
      p_narration: `Reschedule hybrid payment rollback (${appointmentId})`,
    });

    if (rollbackError) {
      throw new Error(`Failed to rollback hybrid reschedule wallet debit: ${rollbackError.message}`);
    }
  }

  if (walletPaymentReference) {
    const nowIso = new Date().toISOString();
    const { data: walletPayment } = await serviceClient
      .from('payments')
      .select('metadata')
      .or(`provider_reference.eq.${walletPaymentReference},payment_reference.eq.${walletPaymentReference}`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    await serviceClient
      .from('payments')
      .update({
        status: 'FAILED',
        metadata: {
          ...((walletPayment?.metadata || {}) as Record<string, unknown>),
          type: 'reschedule_hybrid_wallet',
          payment_mode: 'hybrid',
          stage: 'rolled_back_after_pending_intent_expiry',
          failure_reason: reason,
          failed_at: nowIso,
        },
      })
      .or(`provider_reference.eq.${walletPaymentReference},payment_reference.eq.${walletPaymentReference}`);
  }

  return rollbackOutstanding;
};

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
      paymentMethod,
    } = payload;
    const requestedPaystackMethod = asReschedulePaystackMethod(paymentMethod);

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

    const { data: existingPendingRows, error: existingPendingLookupError } = await serviceClient
      .from('payments')
      .select('amount,provider_reference,payment_reference,metadata,created_at,patient_id,appointment_id')
      .eq('appointment_id', appointmentId)
      .eq('provider', 'paystack')
      .in('status', ['PENDING', 'pending'])
      .order('created_at', { ascending: false })
      .limit(5);

    if (existingPendingLookupError) {
      console.warn('[reschedule-payment-initiate] failed to inspect existing pending paystack row:', existingPendingLookupError.message);
    }

    const existingPending = (existingPendingRows || []).find((row: any) =>
      String((row?.metadata as Record<string, unknown> | null)?.type || '').trim().toLowerCase() === 'reschedule_upgrade',
    ) as ReschedulePendingPaystackRow | undefined;

    const existingReference = String(
      existingPending?.provider_reference || existingPending?.payment_reference || '',
    ).trim();

    if (existingPending && existingReference) {
      const existingMetadata = (existingPending.metadata || {}) as Record<string, unknown>;
      const existingCreatedAtMs = new Date(String(existingPending.created_at || '')).getTime();
      const existingAgeMs = Number.isFinite(existingCreatedAtMs)
        ? Math.max(Date.now() - existingCreatedAtMs, 0)
        : Number.POSITIVE_INFINITY;
      const stalePendingIntent = existingAgeMs > RESCHEDULE_PENDING_INTENT_MAX_AGE_MS;

      if (stalePendingIntent) {
        const expiredAtIso = new Date().toISOString();
        const expiryReason = 'Pending reschedule payment intent expired before completion';

        const { error: expirePendingError } = await serviceClient
          .from('payments')
          .update({
            status: 'FAILED',
            metadata: {
              ...existingMetadata,
              expired_at: expiredAtIso,
              expiry_reason: expiryReason,
              stage: 'expired_before_new_attempt',
            },
          })
          .or(`provider_reference.eq.${existingReference},payment_reference.eq.${existingReference}`);

        if (expirePendingError) {
          throw new Error(`Failed to expire stale pending reschedule payment intent: ${expirePendingError.message}`);
        }

        await rollbackExpiredOrSupersededHybridWallet(
          serviceClient,
          existingPending,
          user.id,
          expiryReason,
        );
      }

      const existingProposedDate = String(existingMetadata.proposed_date || '').trim();
      const existingProposedTime = normalizeTimeInput(existingMetadata.proposed_time) || '';
      const existingProposedDuration = Number(existingMetadata.proposed_duration || 0);
      const existingProposedConsultationType = String(existingMetadata.proposed_consultation_type || '').trim().toLowerCase();
      const pendingMatchesRequested =
        existingProposedDate === metadataProposedDate &&
        toTimeKey(existingProposedTime) === toTimeKey(metadataProposedTime) &&
        (Number.isFinite(existingProposedDuration) && existingProposedDuration > 0
          ? Math.max(5, Math.round(existingProposedDuration)) === metadataProposedDuration
          : true) &&
        (existingProposedConsultationType
          ? existingProposedConsultationType === (metadataProposedConsultationType || 'video')
          : true);

      if (!stalePendingIntent && !pendingMatchesRequested) {
        return new Response(JSON.stringify({
          error: 'A different reschedule payment is already pending for this appointment. Complete that payment or wait for expiry before starting a new one.',
          reference: existingReference,
          pendingCreatedAt: existingPending.created_at || null,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 409,
        });
      }

      if (stalePendingIntent) {
        // Stale pending intent has been expired and (if hybrid) wallet reservation rolled back.
        // Proceed to initialize a fresh intent below.
      } else if (pendingMatchesRequested) {
        const existingWalletAppliedRaw = Number(existingMetadata.wallet_applied_amount || 0);
        const existingWalletApplied = Number.isFinite(existingWalletAppliedRaw) && existingWalletAppliedRaw > 0
          ? roundMoney(existingWalletAppliedRaw)
          : 0;
        const existingPaystackAmount = roundMoney(Number(existingPending.amount || 0));
        const existingTotalUpgradeRaw = Number(existingMetadata.total_upgrade_amount || 0);
        const existingTotalUpgrade = Number.isFinite(existingTotalUpgradeRaw) && existingTotalUpgradeRaw > 0
          ? roundMoney(existingTotalUpgradeRaw)
          : roundMoney(existingWalletApplied + existingPaystackAmount);

        return new Response(JSON.stringify({
          email: profile?.email || user.email || '',
          amountInKobo: Math.round(existingPaystackAmount * 100),
          reference: existingReference,
          metadata: existingMetadata,
          upgradeAmount: existingTotalUpgrade,
          proposedPrice,
          alreadyPaid,
          walletChargedAmount: existingWalletApplied,
          paystackAmountDue: existingPaystackAmount,
          paymentMethod: String(existingMetadata.payment_mode || '').trim().toLowerCase() === 'hybrid' ? 'hybrid' : 'paystack',
          reusedPendingIntent: true,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        });
      }
    }

    const metadataBase = {
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
    };

    if (requestedPaystackMethod === 'hybrid') {
      const walletReference = `WALLET-RSHYB-${Date.now()}-${appointmentId.slice(0, 8)}`;
      let walletChargedAmount = 0;
      let balanceAfter: number | null = null;

      try {
        let walletDebitData: any = null;
        let walletDebitError: any = null;

        const walletDebitResponse = await serviceClient.rpc(
          'debit_patient_wallet_for_booking_up_to',
          {
            p_patient_id: user.id,
            p_appointment_id: appointmentId,
            p_amount: upgradeAmount,
            p_narration: `Hybrid reschedule wallet debit (${appointmentId})`,
          },
        );

        walletDebitData = walletDebitResponse.data;
        walletDebitError = walletDebitResponse.error;

        if (walletDebitError) {
          const walletDebitMessage = String(walletDebitError.message || '');
          const isMissingRpc = walletDebitMessage.includes('debit_patient_wallet_for_booking_up_to');
          if (!isMissingRpc) {
            throw new Error(walletDebitMessage || 'Hybrid reschedule wallet debit failed');
          }

          // Backward-compatible fallback if latest migration is not yet applied.
          const { data: walletRow, error: walletLookupError } = await serviceClient
            .from('patient_wallet')
            .select('available_balance')
            .eq('patient_id', user.id)
            .maybeSingle();

          if (walletLookupError) {
            throw new Error(`Hybrid reschedule wallet fallback lookup failed: ${walletLookupError.message}`);
          }

          const fallbackChargeAmount = roundMoney(Math.max(Math.min(Number(walletRow?.available_balance || 0), upgradeAmount), 0));
          if (fallbackChargeAmount > 0) {
            const fallbackDebitResponse = await serviceClient.rpc(
              'debit_patient_wallet_for_booking',
              {
                p_patient_id: user.id,
                p_appointment_id: appointmentId,
                p_amount: fallbackChargeAmount,
                p_narration: `Hybrid reschedule wallet debit (${appointmentId})`,
              },
            );
            if (fallbackDebitResponse.error) {
              throw new Error(fallbackDebitResponse.error.message || 'Hybrid reschedule wallet fallback debit failed');
            }
            walletDebitData = fallbackDebitResponse.data;
          } else {
            walletDebitData = {
              charged_amount: 0,
              balance_after: Number(walletRow?.available_balance || 0),
            };
          }
        }

        const walletDebit = (walletDebitData || {}) as Record<string, unknown>;
        const chargedRaw = Number(walletDebit.charged_amount || 0);
        const balanceAfterRaw = Number(walletDebit.balance_after);
        walletChargedAmount = Number.isFinite(chargedRaw) && chargedRaw > 0 ? roundMoney(chargedRaw) : 0;
        balanceAfter = Number.isFinite(balanceAfterRaw) ? roundMoney(balanceAfterRaw) : null;

        if (walletChargedAmount > 0) {
          const { error: walletPaymentInitError } = await serviceClient.from('payments').insert({
            appointment_id: appointmentId,
            patient_id: user.id,
            amount: walletChargedAmount,
            status: 'pending',
            provider_reference: walletReference,
            provider: 'wallet',
            payment_reference: walletReference,
            payment_method: 'wallet',
            metadata: {
              ...metadataBase,
              type: 'reschedule_hybrid_wallet',
              payment_mode: 'hybrid',
              total_upgrade_amount: upgradeAmount,
              wallet_applied_amount: walletChargedAmount,
              balance_due_amount: roundMoney(Math.max(upgradeAmount - walletChargedAmount, 0)),
              balance_after: balanceAfter,
              stage: 'wallet_charged_pending_paystack',
            },
          });

          if (walletPaymentInitError) {
            throw new Error(`Failed to initialize hybrid reschedule wallet payment row: ${walletPaymentInitError.message}`);
          }
        }

        const paystackAmountDue = roundMoney(Math.max(upgradeAmount - walletChargedAmount, 0));
        if (paystackAmountDue <= 0) {
          throw new Error('Hybrid split is not needed because wallet covers the full upgrade. Use wallet payment method.');
        }

        const result = await paymentService.createPaymentIntent({
          appointmentId,
          patientId: user.id,
          doctorId: appointment.doctor_id,
          email: profile?.email || user.email || '',
          amount: paystackAmountDue,
          metadata: {
            ...metadataBase,
            payment_mode: 'hybrid',
            total_upgrade_amount: upgradeAmount,
            wallet_applied_amount: walletChargedAmount,
            balance_due_amount: paystackAmountDue,
            ...(walletChargedAmount > 0 ? { wallet_payment_reference: walletReference } : {}),
          },
        });

        return new Response(JSON.stringify({
          ...result,
          upgradeAmount,
          proposedPrice,
          alreadyPaid,
          walletChargedAmount,
          paystackAmountDue,
          paymentMethod: 'hybrid',
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        });
      } catch (hybridError) {
        const message = hybridError instanceof Error ? hybridError.message : String(hybridError);

        if (walletChargedAmount > 0) {
          const { error: rollbackError } = await serviceClient.rpc('credit_patient_wallet_adjustment', {
            p_patient_id: user.id,
            p_appointment_id: appointmentId,
            p_amount: walletChargedAmount,
            p_narration: `Rollback for failed hybrid reschedule payment (${appointmentId})`,
          });
          if (rollbackError) {
            console.warn('[reschedule-payment-initiate] hybrid rollback failed:', rollbackError.message);
          }
        }

        await serviceClient
          .from('payments')
          .update({
            status: 'FAILED',
            metadata: {
              ...metadataBase,
              type: 'reschedule_hybrid_wallet',
              payment_mode: 'hybrid',
              stage: 'rolled_back_after_init_failure',
              failure_reason: message,
              failed_at: new Date().toISOString(),
            },
          })
          .or(`provider_reference.eq.${walletReference},payment_reference.eq.${walletReference}`);

        throw new Error(message || 'Failed to initialize hybrid reschedule payment');
      }
    }

    const result = await paymentService.createPaymentIntent({
      appointmentId,
      patientId: user.id,
      doctorId: appointment.doctor_id,
      email: profile?.email || user.email || '',
      amount: upgradeAmount,
      metadata: {
        ...metadataBase,
        payment_mode: 'paystack',
        total_upgrade_amount: upgradeAmount,
        wallet_applied_amount: 0,
        balance_due_amount: upgradeAmount,
      },
    });

    return new Response(JSON.stringify({
      ...result,
      upgradeAmount,
      proposedPrice,
      alreadyPaid,
      walletChargedAmount: 0,
      paystackAmountDue: upgradeAmount,
      paymentMethod: 'paystack',
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
