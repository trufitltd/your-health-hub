import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { PricingService } from '../_shared/services/PricingService.ts';

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
    const pricingService = new PricingService(serviceClient);
    const result = await pricingService.getDiscoveryStartingPrices();

    return new Response(
      JSON.stringify({
        gp: result.gp,
        specialist: result.specialist,
        currency: result.currency,
        variation: result.variation,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=60',
        },
      },
    );
  } catch (error) {
    console.error('[discovery-starting-prices] error', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown pricing error',
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
