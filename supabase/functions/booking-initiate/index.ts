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

    const serviceClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: profile, error: profileError } = await serviceClient
      .from('profiles')
      .select('email')
      .eq('user_id', user.id)
      .maybeSingle();
    if (profileError) {
      console.warn('[booking-initiate] profile lookup failed, falling back to auth email:', profileError.message);
    }

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

    const result = await bookingService.initiateBooking({
      patientId: user.id,
      patientEmail: profile?.email || user.email || '',
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
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown booking error',
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
