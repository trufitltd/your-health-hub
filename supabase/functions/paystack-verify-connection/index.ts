/**
 * paystack-verify-connection
 *
 * Verifies that a Paystack account is properly configured for an organisation.
 * Returns safe account info (business name, mode) without exposing secrets.
 *
 * POST /paystack-verify-connection
 * Body: { organisation_id: string, secret_key?: string, public_key?: string }
 *
 * If secret_key is provided in the body (new configuration), encrypts and stores it.
 * If not provided, resolves from organisation_payment_providers table.
 *
 * Returns: { connected: boolean, mode: string, business_name?: string }
 */

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  encryptSecret,
  resolvePaymentProvider,
} from '../_shared/services/PaymentProviderResolver.ts';

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

    // Authenticate the caller
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
    const { organisation_id, secret_key, public_key, mode } = payload;

    if (!organisation_id) {
      return new Response(JSON.stringify({ error: 'Missing organisation_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify the caller is an org admin
    const serviceClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: membership } = await serviceClient
      .from('organisation_members')
      .select('id')
      .eq('organisation_id', organisation_id)
      .eq('user_id', user.id)
      .eq('role', 'org_admin')
      .eq('active', true)
      .maybeSingle();

    if (!membership) {
      return new Response(JSON.stringify({ error: 'Forbidden: not an organisation admin' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let secretKeyToUse = secret_key || '';

    // If a new secret key is provided, encrypt and store it
    if (secret_key) {
      const encryptedSecret = await encryptSecret(secret_key);

      const publicKeyToStore = public_key || '';

      // Upsert the payment provider config
      const { error: upsertError } = await serviceClient
        .from('organisation_payment_providers')
        .upsert({
          organisation_id,
          provider: 'paystack',
          public_key: publicKeyToStore,
          encrypted_secret_key: encryptedSecret,
          mode: mode || 'live',
          status: 'active',
          last_verified_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'organisation_id,provider',
        });

      if (upsertError) {
        throw new Error(`Failed to store payment provider config: ${upsertError.message}`);
      }
    }

    // Resolve the provider (may use newly stored config or existing)
    if (!secretKeyToUse) {
      const provider = await resolvePaymentProvider(serviceClient, organisation_id);
      secretKeyToUse = provider.secretKey;
    }

    if (!secretKeyToUse) {
      return new Response(JSON.stringify({
        connected: false,
        error: 'No Paystack secret key configured',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // Verify with Paystack API: fetch balance as a lightweight check
    const verifyResponse = await fetch('https://api.paystack.co/balance', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${secretKeyToUse}`,
        'Content-Type': 'application/json',
      },
    });

    if (!verifyResponse.ok) {
      // Mark status as verification_failed
      await serviceClient
        .from('organisation_payment_providers')
        .update({
          status: 'verification_failed',
          last_verified_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('organisation_id', organisation_id)
        .eq('provider', 'paystack');

      return new Response(JSON.stringify({
        connected: false,
        error: `Paystack API returned ${verifyResponse.status}`,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    const balanceData = await verifyResponse.json();
    constcurrency = balanceData?.data?.[0]?.currency || 'NGN';

    // Try to fetch business info
    let businessName = '';
    try {
      const integrationResponse = await fetch('https://api.paystack.co/integration', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${secretKeyToUse}`,
          'Content-Type': 'application/json',
        },
      });
      if (integrationResponse.ok) {
        const integrationData = await integrationResponse.json();
        businessName = integrationData?.data?.business_name || '';
      }
    } catch {
      // Non-critical — business name is optional
    }

    // Update status to active
    await serviceClient
      .from('organisation_payment_providers')
      .update({
        status: 'active',
        business_name: businessName,
        last_verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('organisation_id', organisation_id)
      .eq('provider', 'paystack');

    return new Response(JSON.stringify({
      connected: true,
      mode: mode || 'live',
      currency,
      business_name: businessName,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('[paystack-verify-connection] error', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
