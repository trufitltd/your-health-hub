import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { PricingService } from '../_shared/services/PricingService.ts';
import { AvailabilityService } from '../_shared/services/AvailabilityService.ts';
import { PaymentService } from '../_shared/services/PaymentService.ts';
import { WalletService } from '../_shared/services/WalletService.ts';
import { BookingService } from '../_shared/services/BookingService.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-paystack-signature',
};

async function finalizeReschedulePayment(
  serviceClient: InstanceType<typeof createClient>,
  reference: string,
  paystackVerification: Record<string, unknown>,
  paymentService: PaymentService,
) {
  const payment = await paymentService.getPaymentByReference(reference);
  if (!payment) throw new Error('Payment not found for reference');
  const paymentMetadata = (payment.metadata || {}) as Record<string, unknown>;
  if (
    String(payment.status || '').trim().toLowerCase() === 'success' &&
    typeof paymentMetadata.reschedule_finalized_at === 'string'
  ) {
    return {
      appointmentId: payment.appointment_id,
      type: 'reschedule_upgrade',
      upgradeAmount: Number(payment.amount || 0),
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
    await paymentService.markPaymentFailed(reference, `Verification failed with status ${verified.status}`);
    throw new Error(`Payment verification failed: ${verified.status}`);
  }
  const upgradeAmount = Number(payment.amount || 0);
  const verifiedAmount = Number((Number(verified.amountInKobo || 0) / 100).toFixed(2));
  if (Math.abs(verifiedAmount - upgradeAmount) > 0.01) {
    await paymentService.markPaymentFailed(
      reference,
      `Verification amount mismatch. expected=${upgradeAmount}, got=${verifiedAmount}`,
    );
    throw new Error(`Payment verification amount mismatch: expected ${upgradeAmount}, got ${verifiedAmount}`);
  }

  // Mark payment as successful
  await paymentService.markPaymentSuccess(reference, {
    ...paystackVerification,
    verify_response: verified.raw,
  });

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
    : (appointment.reschedule_proposed_duration_minutes || appointment.duration_minutes || 30);
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
      await walletService.addPendingEarning({
        id: appointment.id,
        doctor_id: appointment.doctor_id,
        final_price: upgradeAmount,
        price_breakdown: {
          upgrade_amount: upgradeAmount,
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
        },
      })
      .or(`provider_reference.eq.${reference},payment_reference.eq.${reference}`);
  }

  return {
    appointmentId: appointment.id,
    type: 'reschedule_upgrade',
    upgradeAmount,
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

    if (!reference) {
      return new Response(JSON.stringify({ error: 'Missing payment reference' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (eventName === 'charge.success') {
      // Fetch payment to check if it's a reschedule payment
      const payment = await paymentService.getPaymentByReference(reference);
      const paymentType = payment?.metadata?.type;

      if (paymentType === 'reschedule_upgrade') {
        // Handle reschedule payment
        const result = await finalizeReschedulePayment(serviceClient, reference, event?.data || {}, paymentService);
        return new Response(JSON.stringify({ success: true, event: eventName, type: 'reschedule', ...result }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } else {
        // Handle regular booking payment
        const result = await bookingService.finalizeSuccessfulPayment(reference, event?.data || {});
        return new Response(JSON.stringify({ success: true, event: eventName, ...result }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    if (eventName === 'charge.failed') {
      await bookingService.failPayment(reference, 'Paystack charge.failed webhook');
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
