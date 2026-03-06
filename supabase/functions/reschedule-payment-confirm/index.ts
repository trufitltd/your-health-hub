import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { PaymentService } from '../_shared/services/PaymentService.ts';
import { WalletService } from '../_shared/services/WalletService.ts';
import { DEFAULT_BOOKING_DURATION_MINUTES } from '../_shared/marketplace-types.ts';

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

const rollbackHybridWalletReservation = async (
  serviceClient: InstanceType<typeof createClient>,
  payment: Record<string, any>,
  reason: string,
) => {
  const metadata = (payment.metadata || {}) as Record<string, unknown>;
  const paymentMode = String(metadata.payment_mode || '').trim().toLowerCase();
  const walletPaymentReference = String(metadata.wallet_payment_reference || '').trim();
  const walletAppliedRaw = Number(metadata.wallet_applied_amount || 0);
  const walletApplied = Number.isFinite(walletAppliedRaw) && walletAppliedRaw > 0
    ? roundMoney(walletAppliedRaw)
    : 0;

  if (paymentMode !== 'hybrid' || walletApplied <= 0) return 0;

  const appointmentId = String(payment.appointment_id || '').trim();
  const patientId = String(payment.patient_id || '').trim();
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

  const alreadyRolledBack = roundMoney((rollbackRows || []).reduce((sum: number, row: any) => (
    sum + Number(row.amount || 0)
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
          stage: 'rolled_back_after_paystack_failure',
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
    const paymentType = String(paymentMetadata.type || '').trim().toLowerCase();
    if (paymentType !== 'reschedule_upgrade') {
      return new Response(JSON.stringify({ error: 'Payment is not a reschedule upgrade' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const paymentMode = String(paymentMetadata.payment_mode || '').trim().toLowerCase();
    const walletPaymentReference = String(paymentMetadata.wallet_payment_reference || '').trim();
    const walletAppliedRaw = Number(paymentMetadata.wallet_applied_amount || 0);
    const walletAppliedAmount = Number.isFinite(walletAppliedRaw) && walletAppliedRaw > 0
      ? roundMoney(walletAppliedRaw)
      : 0;

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
      await rollbackHybridWalletReservation(serviceClient, payment as Record<string, any>, `Verification failed with status ${verified.status}`);
      throw new Error(`Payment verification failed: ${verified.status}`);
    }

    const expectedAmount = roundMoney(Number(payment.amount || 0));
    const verifiedAmount = roundMoney(Number(verified.amountInKobo || 0) / 100);
    if (Math.abs(verifiedAmount - expectedAmount) > 0.01) {
      await paymentService.markPaymentFailed(
        reference,
        `Verification amount mismatch. expected=${expectedAmount}, got=${verifiedAmount}`,
      );
      await rollbackHybridWalletReservation(
        serviceClient,
        payment as Record<string, any>,
        `Verification amount mismatch. expected=${expectedAmount}, got=${verifiedAmount}`,
      );
      throw new Error(`Payment verification amount mismatch: expected ${expectedAmount}, got ${verifiedAmount}`);
    }

    await paymentService.markPaymentSuccess(reference, {
      confirm_source: 'reschedule-payment-confirm',
      verify_response: verified.raw,
    });

    if (paymentMode === 'hybrid' && walletPaymentReference) {
      const nowIso = new Date().toISOString();
      const { data: walletPayment } = await serviceClient
        .from('payments')
        .select('metadata')
        .or(`provider_reference.eq.${walletPaymentReference},payment_reference.eq.${walletPaymentReference}`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const { error: walletMarkSuccessError } = await serviceClient
        .from('payments')
        .update({
          status: 'SUCCESS',
          verified_at: nowIso,
          metadata: {
            ...((walletPayment?.metadata || {}) as Record<string, unknown>),
            type: 'reschedule_hybrid_wallet',
            payment_mode: 'hybrid',
            charged_amount: walletAppliedAmount,
            stage: 'wallet_applied',
            verified_at: nowIso,
          },
        })
        .or(`provider_reference.eq.${walletPaymentReference},payment_reference.eq.${walletPaymentReference}`);

      if (walletMarkSuccessError) {
        throw new Error(`Failed to finalize hybrid reschedule wallet payment: ${walletMarkSuccessError.message}`);
      }
    }

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
      : Math.max(
        5,
        Math.round(Number(
          appointment.reschedule_proposed_duration_minutes
          || appointment.duration_minutes
          || DEFAULT_BOOKING_DURATION_MINUTES,
        )),
      );

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

    const totalUpgradeRaw = Number(paymentMetadata.total_upgrade_amount || 0);
    const upgradeAmount = Number.isFinite(totalUpgradeRaw) && totalUpgradeRaw > 0
      ? roundMoney(totalUpgradeRaw)
      : roundMoney(Number(payment.amount || 0) + walletAppliedAmount);
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
            payment_mode: paymentMode || 'paystack',
            total_upgrade_amount: upgradeAmount,
            wallet_applied_amount: walletAppliedAmount,
            balance_due_amount: roundMoney(Math.max(upgradeAmount - walletAppliedAmount, 0)),
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
      walletChargedAmount: walletAppliedAmount,
      paystackAmountPaid: roundMoney(Number(payment.amount || 0)),
      upgradeAmount,
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
