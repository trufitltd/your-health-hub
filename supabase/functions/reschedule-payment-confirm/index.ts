import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { PaymentService } from '../_shared/services/PaymentService.ts';
import { WalletService } from '../_shared/services/WalletService.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const roundMoney = (value: number) => Number((Math.round(value * 100) / 100).toFixed(2));

const normalizeTimeInput = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (/^\d{2}:\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{2}:\d{2}:\d{2}$/.test(trimmed)) return trimmed.slice(0, 5);
  return null;
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

    const payload = await req.json().catch(() => ({}));
    const reference = String(payload?.reference || '').trim();

    if (!reference) {
      return new Response(JSON.stringify({ error: 'Missing payment reference' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey);
    const paymentService = new PaymentService(serviceClient);

    const payment = await paymentService.getPaymentByReference(reference);
    if (!payment) {
      return new Response(JSON.stringify({ error: 'Payment not found for reference' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (String(payment.patient_id || '') !== user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const paymentMetadata = (payment.metadata || {}) as Record<string, unknown>;
    const paymentType = String(paymentMetadata.type || '').trim();
    if (paymentType !== 'reschedule_upgrade') {
      return new Response(JSON.stringify({ error: 'Payment is not a reschedule upgrade' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (
      String(payment.status || '').trim().toLowerCase() === 'success' &&
      typeof paymentMetadata.reschedule_finalized_at === 'string'
    ) {
      return new Response(JSON.stringify({
        success: true,
        appointmentId: payment.appointment_id,
        alreadyFinalized: true,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const verified = await paymentService.verifyPayment(reference);
    if (!verified.ok) {
      await paymentService.markPaymentFailed(reference, `Verification failed with status ${verified.status}`);
      throw new Error(`Payment verification failed: ${verified.status}`);
    }

    const expectedAmount = roundMoney(Number(payment.amount || 0));
    const verifiedAmount = roundMoney(Number(verified.amountInKobo || 0) / 100);
    if (Math.abs(verifiedAmount - expectedAmount) > 0.01) {
      await paymentService.markPaymentFailed(
        reference,
        `Verification amount mismatch. expected=${expectedAmount}, got=${verifiedAmount}`,
      );
      throw new Error(`Payment verification amount mismatch: expected ${expectedAmount}, got ${verifiedAmount}`);
    }

    await paymentService.markPaymentSuccess(reference, {
      confirm_source: 'reschedule-payment-confirm',
      verify_response: verified.raw,
    });

    const { data: appointment, error: appointmentError } = await serviceClient
      .from('appointments')
      .select('*')
      .eq('id', payment.appointment_id)
      .eq('patient_id', user.id)
      .maybeSingle();

    if (appointmentError || !appointment) {
      throw new Error('Appointment not found for payment');
    }

    const proposedDate = String(paymentMetadata.proposed_date || appointment.reschedule_proposed_date || '').trim();
    const proposedTime = normalizeTimeInput(paymentMetadata.proposed_time)
      || normalizeTimeInput(appointment.reschedule_proposed_time)
      || '';

    const proposedDurationRaw = Number(paymentMetadata.proposed_duration);
    const proposedDuration = Number.isFinite(proposedDurationRaw) && proposedDurationRaw > 0
      ? Math.max(5, Math.round(proposedDurationRaw))
      : Math.max(5, Math.round(Number(appointment.reschedule_proposed_duration_minutes || appointment.duration_minutes || 30)));

    const proposedFinalPriceRaw = Number(paymentMetadata.proposed_price);
    const proposedFinalPrice = Number.isFinite(proposedFinalPriceRaw) && proposedFinalPriceRaw > 0
      ? roundMoney(proposedFinalPriceRaw)
      : roundMoney(Number(appointment.reschedule_proposed_final_price ?? appointment.final_price ?? 0));

    if (!proposedDate || !proposedTime || proposedFinalPrice <= 0) {
      throw new Error('Missing proposed reschedule details in payment metadata');
    }

    const proposedConsultationName = String(
      paymentMetadata.proposed_consultation_type || appointment.reschedule_proposed_consultation_type || '',
    ).trim().toLowerCase();

    const currentRequestTime = normalizeTimeInput(appointment.reschedule_proposed_time) || '';
    const alreadyApplied =
      String(appointment.reschedule_request_status || '').trim().toLowerCase() === 'pending' &&
      String(appointment.reschedule_requested_by || '').trim().toLowerCase() === 'patient' &&
      String(appointment.reschedule_proposed_date || '') === proposedDate &&
      currentRequestTime === proposedTime &&
      Number(appointment.reschedule_proposed_duration_minutes || 0) === proposedDuration &&
      roundMoney(Number(appointment.reschedule_proposed_final_price || 0)) === proposedFinalPrice;

    if (!alreadyApplied) {
      const { error: updateError } = await serviceClient
        .from('appointments')
        .update({
          reschedule_request_status: 'pending',
          reschedule_requested_by: 'patient',
          reschedule_requested_at: new Date().toISOString(),
          reschedule_decision_at: null,
          reschedule_response_note: null,
          reschedule_proposed_date: proposedDate,
          reschedule_proposed_time: proposedTime,
          reschedule_proposed_duration_minutes: proposedDuration,
          reschedule_proposed_consultation_type: proposedConsultationName || null,
          reschedule_proposed_final_price: proposedFinalPrice,
          // Already paid via external gateway; avoid wallet debit in approval RPC.
          reschedule_upgrade_amount: 0,
        })
        .eq('id', appointment.id);

      if (updateError) {
        throw new Error(`Failed to persist pending reschedule request: ${updateError.message}`);
      }
    }

    const upgradeAmount = roundMoney(Number(payment.amount || 0));
    let walletCredited = false;
    if (upgradeAmount > 0) {
      const { data: existingWalletCredit, error: walletLookupError } = await serviceClient
        .from('doctor_wallet_transactions')
        .select('id')
        .eq('appointment_id', appointment.id)
        .in('status', ['pending', 'available'])
        .limit(1)
        .maybeSingle();

      if (walletLookupError) {
        throw new Error(`Failed to check existing wallet credit: ${walletLookupError.message}`);
      }

      if (!existingWalletCredit) {
        const walletService = new WalletService(serviceClient);
        await walletService.addPendingEarning({
          id: appointment.id,
          doctor_id: appointment.doctor_id,
          final_price: upgradeAmount,
          price_breakdown: {
            upgrade_amount: upgradeAmount,
            upgrade_reason: 'Reschedule upgrade payment',
          },
        });
        walletCredited = true;
      }
    }

    const finalizedAt = new Date().toISOString();
    const paymentAfterSuccess = await paymentService.getPaymentByReference(reference);
    if (paymentAfterSuccess) {
      await serviceClient
        .from('payments')
        .update({
          metadata: {
            ...(paymentAfterSuccess.metadata || {}),
            reschedule_finalized_at: finalizedAt,
            reschedule_finalized_via: 'client_confirm',
            reschedule_wallet_credited: walletCredited,
          },
        })
        .or(`provider_reference.eq.${reference},payment_reference.eq.${reference}`);
    }

    return new Response(JSON.stringify({
      success: true,
      appointmentId: appointment.id,
      alreadyApplied,
      requestStatus: 'pending',
      walletCredited,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[reschedule-payment-confirm] error', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown confirmation error' }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
