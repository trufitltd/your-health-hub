import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { PaymentService } from '../_shared/services/PaymentService.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
    const { appointmentId, patientId } = payload;

    if (!appointmentId) {
      return new Response(JSON.stringify({ error: 'Missing appointmentId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey);

    // Fetch the appointment to get doctor_id and pricing
    const { data: appointment, error: appointmentError } = await serviceClient
      .from('appointments')
      .select('*')
      .eq('id', appointmentId)
      .maybeSingle();

    if (appointmentError || !appointment) {
      return new Response(JSON.stringify({ error: 'Appointment not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get patient profile for email
    const { data: profile, error: profileError } = await serviceClient
      .from('profiles')
      .select('email')
      .eq('user_id', patientId || user.id)
      .maybeSingle();

    if (profileError) {
      console.warn('[payment-initialize] profile lookup failed, falling back to auth email:', profileError.message);
    }

    const paymentService = new PaymentService(serviceClient);

    const { data: existingPendingPaystack, error: pendingLookupError } = await serviceClient
      .from('payments')
      .select('amount, provider_reference, payment_reference, metadata')
      .eq('appointment_id', appointmentId)
      .eq('provider', 'paystack')
      .in('status', ['PENDING', 'pending'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pendingLookupError) {
      console.warn('[payment-initialize] failed to lookup pending paystack payment:', pendingLookupError.message);
    }

    const existingReference = String(
      existingPendingPaystack?.provider_reference || existingPendingPaystack?.payment_reference || '',
    ).trim();

    if (existingPendingPaystack && existingReference) {
      const existingAmountInKobo = Math.round(Number(existingPendingPaystack.amount || 0) * 100);
      return new Response(
        JSON.stringify({
          email: profile?.email || user.email || '',
          amountInKobo: existingAmountInKobo,
          reference: existingReference,
          metadata: existingPendingPaystack.metadata || {},
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        },
      );
    }

    const { data: walletDebits, error: walletDebitLookupError } = await serviceClient
      .from('patient_wallet_transactions')
      .select('amount')
      .eq('appointment_id', appointmentId)
      .eq('direction', 'debit')
      .eq('transaction_type', 'booking_wallet_use')
      .eq('status', 'completed');

    if (walletDebitLookupError) {
      console.warn('[payment-initialize] failed to lookup wallet debits for appointment:', walletDebitLookupError.message);
    }

    const walletDebitedTotal = Number((Math.round(((walletDebits || []).reduce((sum: number, row: any) => (
      sum + Number(row.amount || 0)
    ), 0)) * 100) / 100).toFixed(2));
    const finalPrice = Number(appointment.final_price || appointment.appointment_price || 0);
    const outstandingAmount = Number((Math.round(Math.max(finalPrice - walletDebitedTotal, 0) * 100) / 100).toFixed(2));
    const appointmentPrice = outstandingAmount > 0 ? outstandingAmount : Number(appointment.final_price || appointment.appointment_price || 5000);
    const safeAmount = appointmentPrice > 0 ? appointmentPrice : 5000;

    const paymentIntent = await paymentService.createPaymentIntent({
      appointmentId,
      patientId: patientId || user.id,
      doctorId: appointment.doctor_id,
      email: profile?.email || user.email || '',
      amount: safeAmount,
      metadata: {
        appointment_id: appointmentId,
        patient_id: patientId || user.id,
        doctor_id: appointment.doctor_id,
        consultation_type: appointment.consultation_type || 'general',
        type: 'appointment_confirmation',
        outstanding_amount: safeAmount,
        wallet_applied_amount: walletDebitedTotal,
      },
    });

    return new Response(
      JSON.stringify({
        email: paymentIntent.email,
        amountInKobo: paymentIntent.amountInKobo,
        reference: paymentIntent.reference,
        metadata: paymentIntent.metadata,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );
  } catch (error) {
    console.error('[payment-initialize] error', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
