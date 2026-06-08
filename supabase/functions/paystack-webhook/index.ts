import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { PricingService } from '../_shared/services/PricingService.ts';
import { AvailabilityService } from '../_shared/services/AvailabilityService.ts';
import { PaymentService } from '../_shared/services/PaymentService.ts';
import { WalletService } from '../_shared/services/WalletService.ts';
import { BookingService } from '../_shared/services/BookingService.ts';
import { DEFAULT_BOOKING_DURATION_MINUTES } from '../_shared/marketplace-types.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-paystack-signature',
};

const roundMoney = (value: number) => Number((Math.round(value * 100) / 100).toFixed(2));

async function rollbackHybridRescheduleWallet(
  serviceClient: InstanceType<typeof createClient>,
  payment: Record<string, any>,
  reason: string,
) {
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
}

async function failReschedulePayment(
  serviceClient: InstanceType<typeof createClient>,
  reference: string,
  reason: string,
  paymentService: PaymentService,
) {
  const payment = await paymentService.getPaymentByReference(reference);
  if (!payment) return { updated: false };

  await paymentService.markPaymentFailed(reference, reason);
  await rollbackHybridRescheduleWallet(serviceClient, payment as Record<string, any>, reason);
  return { updated: true };
}

async function finalizeReschedulePayment(
  serviceClient: InstanceType<typeof createClient>,
  reference: string,
  paystackVerification: Record<string, unknown>,
  paymentService: PaymentService,
) {
  const payment = await paymentService.getPaymentByReference(reference);
  if (!payment) throw new Error('Payment not found for reference');
  const paymentMetadata = (payment.metadata || {}) as Record<string, unknown>;
  const paymentMode = String(paymentMetadata.payment_mode || '').trim().toLowerCase();
  const walletPaymentReference = String(paymentMetadata.wallet_payment_reference || '').trim();
  const walletAppliedRaw = Number(paymentMetadata.wallet_applied_amount || 0);
  const walletAppliedAmount = Number.isFinite(walletAppliedRaw) && walletAppliedRaw > 0
    ? roundMoney(walletAppliedRaw)
    : 0;
  const totalUpgradeRaw = Number(paymentMetadata.total_upgrade_amount || 0);
  const totalUpgradeAmount = Number.isFinite(totalUpgradeRaw) && totalUpgradeRaw > 0
    ? roundMoney(totalUpgradeRaw)
    : roundMoney(Number(payment.amount || 0) + walletAppliedAmount);
  if (
    String(payment.status || '').trim().toLowerCase() === 'success' &&
    typeof paymentMetadata.reschedule_finalized_at === 'string'
  ) {
    return {
      appointmentId: payment.appointment_id,
      type: 'reschedule_upgrade',
      upgradeAmount: totalUpgradeAmount,
      alreadyFinalized: true,
    };
  }

  // Fetch appointment
  const { data: appointment, error: appointmentError } = await serviceClient
    .from('appointments')
    .select('*')
    .eq('id', payment.appointment_id)
    .maybeSingle();

  if (appointmentError || !appointment) {
    throw new Error('Appointment not found for payment');
  }

  // Verify payment with Paystack
  const verified = await paymentService.verifyPayment(reference);
  if (!verified.ok) {
    await failReschedulePayment(
      serviceClient,
      reference,
      `Verification failed with status ${verified.status}`,
      paymentService,
    );
    throw new Error(`Payment verification failed: ${verified.status}`);
  }
  const paystackAmount = roundMoney(Number(payment.amount || 0));
  const verifiedAmount = Number((Number(verified.amountInKobo || 0) / 100).toFixed(2));
  if (Math.abs(verifiedAmount - paystackAmount) > 0.01) {
    await failReschedulePayment(
      serviceClient,
      reference,
      `Verification amount mismatch. expected=${paystackAmount}, got=${verifiedAmount}`,
      paymentService,
    );
    throw new Error(`Payment verification amount mismatch: expected ${paystackAmount}, got ${verifiedAmount}`);
  }

  // Mark payment as successful
  await paymentService.markPaymentSuccess(reference, {
    ...paystackVerification,
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

  // For reschedule upgrades, keep request pending for doctor approval.
  // We only persist the paid proposed values here; we do not mutate the live
  // appointment slot/details until doctor approval via respond_appointment_reschedule.
  const metadata = (payment.metadata || {}) as Record<string, unknown>;
  const proposedDate = String(metadata.proposed_date || '').trim();
  const proposedTimeRaw = String(metadata.proposed_time || '').trim();
  const proposedTime = /^\d{2}:\d{2}$/.test(proposedTimeRaw)
    ? proposedTimeRaw
    : (/^\d{2}:\d{2}:\d{2}$/.test(proposedTimeRaw) ? proposedTimeRaw.slice(0, 5) : '');
  const proposedDurationRaw = Number(metadata.proposed_duration);
  const proposedDuration = Number.isFinite(proposedDurationRaw) && proposedDurationRaw > 0
    ? Math.max(5, Math.round(proposedDurationRaw))
    : (appointment.reschedule_proposed_duration_minutes || appointment.duration_minutes || DEFAULT_BOOKING_DURATION_MINUTES);
  const proposedFinalPriceRaw = Number(metadata.proposed_price);
  if (!Number.isFinite(proposedFinalPriceRaw) || proposedFinalPriceRaw <= 0) {
    throw new Error('Missing computed proposed price in payment metadata');
  }
  const proposedFinalPrice = Number((Math.round(proposedFinalPriceRaw * 100) / 100).toFixed(2));
  const proposedConsultationName = String(
    metadata.proposed_consultation_type || appointment.reschedule_proposed_consultation_type || '',
  ).trim().toLowerCase();

  if (!proposedDate || !proposedTime || proposedFinalPrice <= 0) {
    throw new Error('No proposed reschedule details available in payment metadata or appointment');
  }

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
    throw new Error(`Failed to apply reschedule changes: ${updateError.message}`);
  }

  // Add doctor's earning for the upgrade amount
  const walletService = new WalletService(serviceClient);
  if (totalUpgradeAmount > 0) {
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
      await walletService.addPendingEarning({
        id: appointment.id,
        doctor_id: appointment.doctor_id,
        final_price: totalUpgradeAmount,
        price_breakdown: {
          upgrade_amount: totalUpgradeAmount,
          upgrade_reason: 'Reschedule upgrade payment',
        },
      });
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
          payment_mode: paymentMode || 'paystack',
          total_upgrade_amount: totalUpgradeAmount,
          wallet_applied_amount: walletAppliedAmount,
          balance_due_amount: paystackAmount,
        },
      })
      .or(`provider_reference.eq.${reference},payment_reference.eq.${reference}`);
  }

  return {
    appointmentId: appointment.id,
    type: 'reschedule_upgrade',
    upgradeAmount: totalUpgradeAmount,
    requestStatus: 'pending',
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Missing Supabase runtime env vars for webhook');
    }

    const rawBody = await req.text();
    const signature = req.headers.get('x-paystack-signature');

    const serviceClient = createClient(supabaseUrl, serviceRoleKey);
    const pricingService = new PricingService(serviceClient);
    const availabilityService = new AvailabilityService(serviceClient);
    const paymentService = new PaymentService(serviceClient);
    const walletService = new WalletService(serviceClient);
    const bookingService = new BookingService(
      serviceClient,
      pricingService,
      availabilityService,
      paymentService,
      walletService,
    );

    const signatureValid = await paymentService.verifyWebhookSignature(rawBody, signature);
    if (!signatureValid) {
      return new Response(JSON.stringify({ error: 'Invalid webhook signature' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const event = JSON.parse(rawBody || '{}');
    const eventName = String(event?.event || '');
    const reference = String(event?.data?.reference || '');

    console.log(`[Paystack Webhook] Received ${eventName} for reference: ${reference}`);

    if (!reference) {
      console.error('[Paystack Webhook] Missing reference in payload');
      return new Response(JSON.stringify({ error: 'Missing payment reference' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (eventName === 'charge.success') {
      let payment;
      try {
        payment = await paymentService.getPaymentByReference(reference);
      } catch (err) {
        console.error(`[Paystack Webhook] Database error fetching payment ${reference}:`, err);
        throw err;
      }

      if (!payment) {
        console.error(`[Paystack Webhook] Payment record not found for reference: ${reference}`);
        return new Response(JSON.stringify({ error: 'Payment record not found' }), {
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const paymentType = String((payment?.metadata as Record<string, unknown> | undefined)?.type || '')
        .trim()
        .toLowerCase();

      console.log(`[Paystack Webhook] Finalizing successful payment. Reference: ${reference}, Type: ${paymentType}`);

      try {
        if (paymentType === 'reschedule_upgrade' || paymentType === 'reschedule_hybrid_wallet') {
          const result = await finalizeReschedulePayment(serviceClient, reference, event?.data || {}, paymentService);
          console.log('[Paystack Webhook] Reschedule finalize success:', result);
          return new Response(JSON.stringify({ success: true, event: eventName, type: 'reschedule', ...result }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } else {
          const result = await bookingService.finalizeSuccessfulPayment(reference, event?.data || {});
          console.log('[Paystack Webhook] Booking finalize success:', result);
          return new Response(JSON.stringify({ success: true, event: eventName, ...result }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      } catch (finalizeErr) {
        console.error(`[Paystack Webhook] Finalization failed for ${reference}:`, finalizeErr);

        try {
          const fallbackPayment = await paymentService.getPaymentByReference(reference);
          if (fallbackPayment?.appointment_id) {
            const { data: fallbackAppointment } = await serviceClient
              .from('appointments')
              .select('status')
              .eq('id', fallbackPayment.appointment_id)
              .maybeSingle();

            const status = String(fallbackAppointment?.status || '').trim().toLowerCase();
            if (['pending_approval', 'confirmed', 'in_progress', 'completed'].includes(status)) {
              console.warn(`[Paystack Webhook] Appointment already in final state after failed finalize: ${fallbackPayment.appointment_id}`);
              return new Response(JSON.stringify({ success: true, event: eventName, alreadyProcessed: true }), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            }
          }
        } catch (fallbackErr) {
          console.error('[Paystack Webhook] Fallback appointment status check failed:', fallbackErr);
        }

        throw finalizeErr;
      }
    }

    if (eventName === 'charge.failed') {
      const payment = await paymentService.getPaymentByReference(reference);
      const paymentType = String((payment?.metadata as Record<string, unknown> | undefined)?.type || '')
        .trim()
        .toLowerCase();

      if (paymentType === 'reschedule_upgrade') {
        await failReschedulePayment(serviceClient, reference, 'Paystack charge.failed webhook', paymentService);
      } else {
        await bookingService.failPayment(reference, 'Paystack charge.failed webhook');
      }

      return new Response(JSON.stringify({ success: true, event: eventName, marked: 'failed' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, event: eventName, ignored: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[paystack-webhook] error', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown webhook error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
