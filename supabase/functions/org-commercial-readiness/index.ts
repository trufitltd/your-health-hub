/**
 * org-commercial-readiness
 *
 * Checks whether an organisation is commercially ready for paid online booking.
 * Returns readiness status with specific missing items.
 *
 * POST /org-commercial-readiness
 * Body: { organisation_id: string }
 *
 * Returns: {
 *   ready: boolean,
 *   organisation_active: boolean,
 *   services_count: number,
 *   services_with_price: number,
 *   paystack_configured: boolean,
 *   paystack_verified: boolean,
 *   pricing_profile_exists: boolean, (informational only, not a readiness gate)
 *   callback_configured: boolean,
 *   callback_valid: boolean,
 *   missing_items: string[]
 * }
 */

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

    const { data: { user }, error: authError } = await authedClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload = await req.json();
    const { organisation_id } = payload;

    if (!organisation_id) {
      return new Response(JSON.stringify({ error: 'Missing organisation_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey);

    // Verify caller is an org member
    const { data: membership } = await serviceClient
      .from('organisation_members')
      .select('id')
      .eq('organisation_id', organisation_id)
      .eq('user_id', user.id)
      .eq('active', true)
      .maybeSingle();

    if (!membership) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check organisation status
    const { data: org } = await serviceClient
      .from('organisations')
      .select('active, currency')
      .eq('id', organisation_id)
      .maybeSingle();

    const orgActive = !!org?.active;

    // Check services
    const { data: services } = await serviceClient
      .from('organisation_services')
      .select('id, name, base_price, active')
      .eq('organisation_id', organisation_id);

    const activeServices = (services || []).filter((s: any) => s.active);
    const servicesWithPrice = activeServices.filter((s: any) => Number(s.base_price || 0) > 0);

    // Check pricing profile
    const { data: pricingProfile } = await serviceClient
      .from('pricing_profiles')
      .select('id')
      .eq('organisation_id', organisation_id)
      .eq('active', true)
      .maybeSingle();

    // Check Paystack config
    const { data: paystackConfig } = await serviceClient
      .from('organisation_payment_providers')
      .select('status, last_verified_at, callback_url')
      .eq('organisation_id', organisation_id)
      .eq('provider', 'paystack')
      .maybeSingle();

    const paystackConfigured = !!paystackConfig && paystackConfig.status !== 'inactive';
    const paystackVerified = paystackConfig?.status === 'active';
    const callbackUrl = (paystackConfig?.callback_url || '').trim();
    const callbackConfigured = callbackUrl.length > 0;

    // Validate callback URL format (HTTPS required in production)
    const lowercased = callbackUrl.toLowerCase();
    let callbackValid = false;
    if (callbackConfigured) {
      try {
        const parsed = new URL(callbackUrl);
        const isDev = Deno.env.get('DENO_ENV') === 'development' || Deno.env.get('SUPABASE_ENV') === 'development';
        callbackValid = parsed.protocol === 'https:' || (isDev && parsed.protocol === 'http:');
        callbackValid = callbackValid && !!parsed.hostname;
        callbackValid = callbackValid && !lowercased.startsWith('javascript:') && !lowercased.startsWith('data:');
      } catch {
        callbackValid = false;
      }
    }

    // Determine missing items
    const missingItems: string[] = [];
    if (!orgActive) missingItems.push('Organisation is not active');
    if (activeServices.length === 0) missingItems.push('No active services configured');
    if (servicesWithPrice.length === 0 && activeServices.length > 0) missingItems.push('No services have a price configured');
    if (!paystackConfigured) missingItems.push('Paystack payment provider not configured');
    if (paystackConfigured && !paystackVerified) missingItems.push('Paystack connection not verified');
    if (paystackVerified && !callbackConfigured) missingItems.push('Payment callback URL not configured');
    if (paystackVerified && callbackConfigured && !callbackValid) missingItems.push('Payment callback URL is invalid (must be HTTPS)');

    const ready = orgActive
      && activeServices.length > 0
      && servicesWithPrice.length > 0
      && paystackVerified
      && callbackValid;

    return new Response(JSON.stringify({
      ready,
      organisation_active: orgActive,
      currency: org?.currency || 'NGN',
      services_count: activeServices.length,
      services_with_price: servicesWithPrice.length,
      pricing_profile_exists: !!pricingProfile,
      paystack_configured: paystackConfigured,
      paystack_verified: paystackVerified,
      paystack_status: paystackConfig?.status || 'not_configured',
      callback_configured: callbackConfigured,
      callback_valid: callbackValid,
      missing_items: missingItems,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('[org-commercial-readiness] error', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
