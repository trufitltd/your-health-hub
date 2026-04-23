import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type TurnCredentialsResponse = {
  iceServers: RTCIceServer[];
  ttlSeconds: number;
  expiresAt: string;
};

function parseCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function clampTtlSeconds(value: string | undefined): number {
  const parsed = Number(value ?? '');
  if (!Number.isFinite(parsed)) return 3600;
  return Math.min(86400, Math.max(60, Math.floor(parsed)));
}

async function createTurnCredential(username: string, sharedSecret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(sharedSecret),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(username));
  const bytes = new Uint8Array(signature);
  return btoa(String.fromCharCode(...bytes));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Supabase environment variables are not configured.');
    }

    const sharedSecret = Deno.env.get('EXPRESSTURN_SECRET_KEY') ?? Deno.env.get('TURN_SHARED_SECRET');
    const staticTurnUsername = Deno.env.get('EXPRESSTURN_USERNAME') ?? Deno.env.get('TURN_USERNAME');
    const staticTurnPassword = Deno.env.get('EXPRESSTURN_PASSWORD') ?? Deno.env.get('TURN_PASSWORD');

    const turnUrls = parseCsv(Deno.env.get('EXPRESSTURN_ICE_URLS') ?? Deno.env.get('TURN_ICE_URLS'));
    if (turnUrls.length === 0) {
      throw new Error('TURN URLs are not configured. Set EXPRESSTURN_ICE_URLS.');
    }

    const stunUrls = parseCsv(Deno.env.get('EXPRESSTURN_STUN_URLS') ?? Deno.env.get('TURN_STUN_URLS'));
    const ttlSeconds = clampTtlSeconds(Deno.env.get('EXPRESSTURN_TTL_SECONDS') ?? Deno.env.get('TURN_TTL_SECONDS'));

    const serviceClient = createClient(supabaseUrl, serviceRoleKey);

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

    const expiresAtUnix = Math.floor(Date.now() / 1000) + ttlSeconds;

    let turnUsername = '';
    let turnCredential = '';

    if (sharedSecret) {
      turnUsername = `${expiresAtUnix}:${user.id}`;
      turnCredential = await createTurnCredential(turnUsername, sharedSecret);
    } else if (staticTurnUsername && staticTurnPassword) {
      // Free-mode fallback: static TURN credentials kept server-side.
      turnUsername = staticTurnUsername;
      turnCredential = staticTurnPassword;
    } else {
      throw new Error(
        'TURN auth is not configured. Set EXPRESSTURN_SECRET_KEY (preferred) or EXPRESSTURN_USERNAME and EXPRESSTURN_PASSWORD.',
      );
    }

    const iceServers: RTCIceServer[] = [];
    if (stunUrls.length > 0) {
      iceServers.push({ urls: stunUrls });
    }

    iceServers.push({
      urls: turnUrls,
      username: turnUsername,
      credential: turnCredential,
    });

    const response: TurnCredentialsResponse = {
      iceServers,
      ttlSeconds,
      expiresAt: new Date(expiresAtUnix * 1000).toISOString(),
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[turn-credentials] error', error);
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
