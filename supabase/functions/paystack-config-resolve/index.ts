/**
 * paystack-config-resolve
 *
 * Resolves the safe (non-secret) Paystack configuration for an organisation.
 * Returns public key, mode, and status — NEVER returns secret keys.
 *
 * POST /paystack-config-resolve
 * Body: { organisation_id: string }
 *
 * Returns: { public_key: string, mode: string, status: string, configured: boolean }
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

    // Verify the caller is an org member (not necessarily admin — they may need to display config status)
    const { data: membership } = await serviceClient
      .from('organisation_members')
      .select('id')
      .eq('organisation_id', organisation_id)
      .eq('user_id', user.id)
      .eq('active', true)
      .maybeSingle();

    if (!membership) {
      return new Response(JSON.stringify({ error: 'Forbidden: not an organisation member' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Read org-specific payment provider config (NO secret keys exposed)
    const { data: providerConfig } = await serviceClient
      .from('organisation_payment_providers')
      .select('public_key, mode, status, business_name, last_verified_at')
      .eq('organisation_id', organisation_id)
      .eq('provider', 'paystack')
      .maybeSingle();

    const configured = !!providerConfig && !!providerConfig.public_key;

    return new Response(JSON.stringify({
      configured,
      public_key: providerConfig?.public_key || '',
      mode: providerConfig?.mode || 'live',
      status: providerConfig?.status || 'inactive',
      business_name: providerConfig?.business_name || '',
      last_verified_at: providerConfig?.last_verified_at || null,
      // If not org-configured, indicate that global env var is in use
      using_global: !configured,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('[paystack-config-resolve] error', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
