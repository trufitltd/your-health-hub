import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { PricingService } from '../_shared/services/PricingService.ts';
import { AvailabilityService } from '../_shared/services/AvailabilityService.ts';
import { PaymentService } from '../_shared/services/PaymentService.ts';
import { WalletService } from '../_shared/services/WalletService.ts';
import { PromotionService } from '../_shared/services/PromotionService.ts';
import { BookingService } from '../_shared/services/BookingService.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Supabase env vars are not configured');
    }

    const authHeader = req.headers.get('Authorization') || '';

    // We will attempt to identify the user if a valid token is provided.
    // If not, we proceed as a guest.
    let patientId: string | undefined = undefined;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const authedClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
          global: { headers: { Authorization: authHeader } },
        });
        const { data: { user }, error: authError } = await authedClient.auth.getUser();
        if (!authError && user) {
          patientId = user.id;
        }
      } catch (e) {
        console.warn('[pricing-preview] JWT verification failed (non-critical):', e);
      }
    }

    const payload = await req.json();
    if (!payload?.doctorId) {
      throw new Error('Missing doctorId');
    }

    // Allow patientId to be passed in the body (used when JWT auth is skipped)
    if (!patientId && payload.patientId) {
      patientId = String(payload.patientId);
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey);
    const pricingService = new PricingService(serviceClient);
    const availabilityService = new AvailabilityService(serviceClient);
    const paymentService = new PaymentService(serviceClient);
    const walletService = new WalletService(serviceClient);
    const promotionService = new PromotionService(serviceClient);
    const bookingService = new BookingService(
      serviceClient,
      pricingService,
      availabilityService,
      paymentService,
      walletService,
      promotionService,
    );

    const result = await bookingService.previewPrice({
      doctorId: payload.doctorId,
      patientId: patientId,
      duration: payload.duration,
      consultationType: payload.consultationType,
    });


    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('[pricing-preview] error', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown pricing preview error',
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
