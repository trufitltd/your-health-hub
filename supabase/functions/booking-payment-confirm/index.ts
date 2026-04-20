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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Supabase env vars are not configured');
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey);

    // Verify user via service role (works with both HS256 and ES256 JWTs)
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    const { data: { user }, error: authError } = token
      ? await serviceClient.auth.getUser(token)
      : { data: { user: null }, error: new Error('No token') };

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

    const paymentType = String((payment.metadata as Record<string, unknown> | null)?.type || '')
      .trim()
      .toLowerCase();
    if (paymentType === 'reschedule_upgrade') {
      return new Response(JSON.stringify({ error: 'Use reschedule-payment-confirm for reschedule upgrades' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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

    const result = await bookingService.finalizeSuccessfulPayment(reference, {
      confirm_source: 'booking-payment-confirm',
    });

    return new Response(JSON.stringify({
      success: true,
      appointmentId: result.appointmentId,
      alreadyProcessed: !!result.alreadyProcessed,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[booking-payment-confirm] error', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown confirmation error',
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
