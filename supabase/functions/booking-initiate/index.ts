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

    const payload = await req.json();

    const patientEmail = user.email || '';

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

    const result = await bookingService.initiateBooking({
      patientId: user.id,
      patientEmail,
      doctorId: payload.doctorId,
      preferredDate: payload.preferredDate,
      preferredTime: payload.preferredTime,
      duration: payload.duration,
      consultationType: payload.consultationType,
      consultationLanguage: payload.consultationLanguage,
      paymentMethod: payload.paymentMethod,
      notes: payload.notes,
    });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('[booking-initiate] error', error);
    const errorMessage = error instanceof Error ? error.message : typeof error === 'object' ? JSON.stringify(error) : String(error);
    return new Response(
      JSON.stringify({
        error: errorMessage,
        details: error,
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
