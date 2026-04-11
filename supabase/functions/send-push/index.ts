import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const VAPID_PUBLIC_KEY = Deno.env.get('VITE_VAPID_PUBLIC_KEY') ?? '';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const VAPID_SUBJECT = 'mailto:myedoctoronline@gmail.com';

// --- Minimal VAPID / Web Push implementation using Web Crypto ---

function base64urlToUint8Array(b64: string): Uint8Array {
  const padding = '='.repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

function uint8ArrayToBase64url(arr: Uint8Array): string {
  return btoa(String.fromCharCode(...arr))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function buildVapidJwt(audience: string): Promise<string> {
  const header = { typ: 'JWT', alg: 'ES256' };
  const now = Math.floor(Date.now() / 1000);
  const payload = { aud: audience, exp: now + 12 * 3600, sub: VAPID_SUBJECT };

  const encode = (obj: object) =>
    uint8ArrayToBase64url(new TextEncoder().encode(JSON.stringify(obj)));

  const signingInput = `${encode(header)}.${encode(payload)}`;

  const privateKeyBytes = base64urlToUint8Array(VAPID_PRIVATE_KEY);
  // VAPID_PRIVATE_KEY is pkcs8-encoded; import it
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    privateKeyBytes,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  return `${signingInput}.${uint8ArrayToBase64url(new Uint8Array(signature))}`;
}

async function sendPush(
  endpoint: string,
  p256dh: string,
  authKey: string,
  payload: string
): Promise<{ ok: boolean; status: number }> {
  const url = new URL(endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const jwt = await buildVapidJwt(audience);

  // Encrypt payload using Web Push encryption (RFC 8291 / aes128gcm)
  // For simplicity we send an unencrypted payload with Content-Encoding: text/plain
  // and rely on the SW to parse it. Full encryption requires the subscriber keys.
  // We use the keys to do proper aesgcm encryption below.

  const recipientPublicKey = base64urlToUint8Array(p256dh);
  const recipientAuth = base64urlToUint8Array(authKey);

  // Generate sender ephemeral key pair
  const senderKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits']
  );

  const senderPublicKeyRaw = new Uint8Array(
    await crypto.subtle.exportKey('raw', senderKeyPair.publicKey)
  );

  // Import recipient public key
  const recipientKey = await crypto.subtle.importKey(
    'raw',
    recipientPublicKey,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );

  // Derive shared secret
  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: recipientKey },
    senderKeyPair.privateKey,
    256
  );

  // HKDF to derive content encryption key and nonce (RFC 8291 aes128gcm)
  const salt = crypto.getRandomValues(new Uint8Array(16));

  const prk = await crypto.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey', 'deriveBits']);

  // auth secret info
  const authInfo = new TextEncoder().encode('Content-Encoding: auth\0');
  const authIkm = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: recipientAuth, info: authInfo },
      prk,
      256
    )
  );

  const ikm = await crypto.subtle.importKey('raw', authIkm, 'HKDF', false, ['deriveKey', 'deriveBits']);

  // key info
  const keyInfo = buildInfo('aesgcm128', recipientPublicKey, senderPublicKeyRaw);
  const contentKey = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: keyInfo },
    ikm,
    { name: 'AES-GCM', length: 128 },
    false,
    ['encrypt']
  );

  // nonce info
  const nonceInfo = buildInfo('nonce', recipientPublicKey, senderPublicKeyRaw);
  const nonceBytes = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt, info: nonceInfo },
      ikm,
      96
    )
  );

  const payloadBytes = new TextEncoder().encode(payload);
  // Add padding: 1 byte padding length (0) + payload
  const padded = new Uint8Array(payloadBytes.length + 1);
  padded.set(payloadBytes, 1);

  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonceBytes }, contentKey, padded)
  );

  // Build body: salt (16) + record size (4) + sender key length (1) + sender key (65) + ciphertext
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096, false);
  const body = new Uint8Array(16 + 4 + 1 + senderPublicKeyRaw.length + encrypted.length);
  let offset = 0;
  body.set(salt, offset); offset += 16;
  body.set(rs, offset); offset += 4;
  body[offset++] = senderPublicKeyRaw.length;
  body.set(senderPublicKeyRaw, offset); offset += senderPublicKeyRaw.length;
  body.set(encrypted, offset);

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `vapid t=${jwt},k=${VAPID_PUBLIC_KEY}`,
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aesgcm',
      'Encryption': `salt=${uint8ArrayToBase64url(salt)}`,
      'Crypto-Key': `dh=${uint8ArrayToBase64url(senderPublicKeyRaw)}`,
      'TTL': '86400',
    },
    body,
  });

  return { ok: res.ok, status: res.status };
}

function buildInfo(type: string, recipientKey: Uint8Array, senderKey: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(`Content-Encoding: ${type}\0P-256\0`);
  const info = new Uint8Array(typeBytes.length + 2 + recipientKey.length + 2 + senderKey.length);
  let offset = 0;
  info.set(typeBytes, offset); offset += typeBytes.length;
  new DataView(info.buffer).setUint16(offset, recipientKey.length, false); offset += 2;
  info.set(recipientKey, offset); offset += recipientKey.length;
  new DataView(info.buffer).setUint16(offset, senderKey.length, false); offset += 2;
  info.set(senderKey, offset);
  return info;
}

// --- Edge Function handler ---

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' },
    });
  }

  try {
    const { user_id, title, body, url } = await req.json() as {
      user_id?: string;
      title: string;
      body?: string;
      url?: string;
    };

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const query = supabase.from('push_subscriptions').select('endpoint, p256dh, auth_key');
    if (user_id) query.eq('user_id', user_id);

    const { data: subs, error } = await query;
    if (error) throw error;
    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
    }

    const payload = JSON.stringify({ title, body: body ?? '', url: url ?? '/' });
    const results = await Promise.allSettled(
      subs.map((s: { endpoint: string; p256dh: string; auth_key: string }) =>
        sendPush(s.endpoint, s.p256dh, s.auth_key, payload)
      )
    );

    const sent = results.filter((r) => r.status === 'fulfilled' && (r as PromiseFulfilledResult<{ ok: boolean }>).value.ok).length;

    // Remove expired subscriptions (410 Gone)
    const expiredEndpoints: string[] = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled' && (r as PromiseFulfilledResult<{ status: number }>).value.status === 410) {
        expiredEndpoints.push(subs[i].endpoint);
      }
    });
    if (expiredEndpoints.length > 0) {
      await supabase.from('push_subscriptions').delete().in('endpoint', expiredEndpoints);
    }

    return new Response(JSON.stringify({ sent, total: subs.length }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
});
