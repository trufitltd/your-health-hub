/**
 * Organisation-aware payment provider resolution.
 *
 * Resolution rules:
 * - orgId === null: use global PAYSTACK_SECRET_KEY (legacy/no-org context)
 * - orgId === MYEDOCTOR_ORG_ID: use global PAYSTACK_SECRET_KEY (backward compat)
 * - any other orgId: REQUIRE active entry in organisation_payment_providers
 *   → if missing/inactive: throw PAYMENT_PROVIDER_NOT_CONFIGURED
 *   → NEVER fall back to global key
 *   → REQUIRE valid callback_url in organisation_payment_providers
 *   → NEVER fall back to global PAYSTACK_CALLBACK_URL
 *
 * Secrets are encrypted at rest using AES-256-GCM and decrypted
 * only within edge functions using the service role key.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type ResolvedPaymentProvider = {
  organisationId: string | null;
  provider: string;
  secretKey: string;
  publicKey: string;
  mode: string;
  callbackUrl: string;
  isGlobal: boolean;
};

const ENCRYPTION_KEY_ENV = 'PAYSTACK_ENCRYPTION_KEY';
const MYEDOCTOR_ORG_ID_ENV = 'MYEDOCTOR_ORG_ID';

/**
 * Get the canonical MyE-Doctor organisation ID.
 * Only this org is allowed to use the global PAYSTACK_SECRET_KEY fallback.
 */
function getMyEDoctorOrgId(): string | null {
  return Deno.env.get(MYEDOCTOR_ORG_ID_ENV) || null;
}

/**
 * Check if an organisation is the canonical MyE-Doctor org.
 */
function isMyEDoctorOrg(orgId: string | null | undefined): boolean {
  if (!orgId) return false;
  const myeOrgId = getMyEDoctorOrgId();
  return !!myeOrgId && orgId === myeOrgId;
}

/**
 * Derive a 256-bit AES-GCM key from the encryption passphrase.
 */
async function deriveKey(passphrase: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode('ciba-paystack-salt-v1'),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Encrypt a plaintext secret using AES-256-GCM.
 * Returns base64-encoded ciphertext with IV prefix.
 */
export async function encryptSecret(plaintext: string): Promise<string> {
  const passphrase = Deno.env.get(ENCRYPTION_KEY_ENV);
  if (!passphrase) throw new Error('PAYSTACK_ENCRYPTION_KEY is not configured');

  const key = await deriveKey(passphrase);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext),
  );

  const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt an AES-256-GCM encrypted secret.
 */
export async function decryptSecret(encrypted: string): Promise<string> {
  const passphrase = Deno.env.get(ENCRYPTION_KEY_ENV);
  if (!passphrase) throw new Error('PAYSTACK_ENCRYPTION_KEY is not configured');

  const key = await deriveKey(passphrase);
  const combined = new Uint8Array(
    atob(encrypted).split('').map((c) => c.charCodeAt(0)),
  );

  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext,
  );

  return new TextDecoder().decode(decrypted);
}

/**
 * Resolve the payment provider configuration for an organisation.
 *
 * Rules:
 * - orgId === null → global env var (no org context)
 * - orgId is MyE-Doctor org → global env var (backward compat)
 * - orgId is any other org → MUST have active org-specific config
 *   → throws PAYMENT_PROVIDER_NOT_CONFIGURED if missing (no fallback to global)
 *   → throws PAYMENT_CALLBACK_NOT_CONFIGURED if callback_url is missing/invalid
 *   → NEVER falls back to global PAYSTACK_CALLBACK_URL
 */
export async function resolvePaymentProvider(
  supabase: SupabaseClient,
  orgId: string | null | undefined,
): Promise<ResolvedPaymentProvider> {
  const myeOrgId = getMyEDoctorOrgId();
  const callbackBase = (Deno.env.get('PAYSTACK_CALLBACK_URL') || Deno.env.get('APP_URL') || Deno.env.get('SITE_URL') || '').trim().replace(/\/+$/, '');

  // If no org context or is MyE-Doctor, use global env var
  if (!orgId || orgId === myeOrgId) {
    const globalSecret = Deno.env.get('PAYSTACK_SECRET_KEY') || '';
    return {
      organisationId: orgId || null,
      provider: 'paystack',
      secretKey: globalSecret,
      publicKey: Deno.env.get('VITE_PAYSTACK_PUBLIC_KEY') || '',
      mode: 'live',
      callbackUrl: callbackBase ? `${callbackBase}/patient-portal` : '',
      isGlobal: true,
    };
  }

  // For any non-MyE org (CIBA, future tenants): REQUIRE org-specific config
  const { data, error } = await supabase
    .from('organisation_payment_providers')
    .select('*')
    .eq('organisation_id', orgId)
    .eq('provider', 'paystack')
    .eq('status', 'active')
    .maybeSingle();

  if (error) {
    throw new Error(`PAYMENT_PROVIDER_ERROR: Failed to load payment configuration for organisation ${orgId}`);
  }

  if (!data) {
    throw new Error(
      `PAYMENT_PROVIDER_NOT_CONFIGURED: Organisation ${orgId} has no active Paystack configuration. ` +
      `Organisation administrators must configure Paystack credentials before payments can be processed.`
    );
  }

  if (!data.encrypted_secret_key) {
    throw new Error(
      `PAYMENT_PROVIDER_NOT_CONFIGURED: Organisation ${orgId} has an inactive Paystack entry but no secret key stored.`
    );
  }

  // Callback URL must be explicitly configured for non-MyE orgs.
  // NEVER fall back to the global PAYSTACK_CALLBACK_URL (which belongs to MyE-Doctor).
  const orgCallback = data.callback_url || '';
  if (!orgCallback) {
    throw new Error(
      `PAYMENT_CALLBACK_NOT_CONFIGURED: Organisation ${orgId} has no callback URL configured. ` +
      `Organisation administrators must set a callback URL before payments can be processed. ` +
      `The callback URL must be an HTTPS URL belonging to the organisation's trusted domain.`
    );
  }

  // Validate callback URL format
  const callbackValidation = validateCallbackUrl(orgCallback);
  if (!callbackValidation.valid) {
    throw new Error(
      `PAYMENT_CALLBACK_INVALID: Organisation ${orgId} has an invalid callback URL: ${callbackValidation.reason}. ` +
      `The callback URL must be a valid HTTPS URL.`
    );
  }

  // Validate callback domain against organisation's allowed domains
  const { data: domainConfig } = await supabase
    .from('organisation_config')
    .select('config_value')
    .eq('organisation_id', orgId)
    .eq('config_key', 'allowed_callback_domains')
    .maybeSingle();

  if (domainConfig?.config_value) {
    const allowedDomains = domainConfig.config_value
      .split(',')
      .map((d: string) => d.trim().toLowerCase())
      .filter((d: string) => d.length > 0);

    if (allowedDomains.length > 0) {
      let parsed: URL;
      try {
        parsed = new URL(orgCallback);
      } catch {
        throw new Error(
          `PAYMENT_CALLBACK_INVALID: Organisation ${orgId} has an invalid callback URL.`
        );
      }

      const callbackHostname = parsed.hostname.toLowerCase();
      const domainAllowed = allowedDomains.some(
        (domain: string) => callbackHostname === domain || callbackHostname.endsWith(`.${domain}`),
      );

      if (!domainAllowed) {
        throw new Error(
          `PAYMENT_CALLBACK_DOMAIN_NOT_TRUSTED: Organisation ${orgId} callback URL hostname "${callbackHostname}" ` +
          `is not in the allowed domains list. Allowed: ${allowedDomains.join(', ')}. ` +
          `Configure 'allowed_callback_domains' in organisation_config to add trusted domains.`
        );
      }
    }
  }

  const secretKey = await decryptSecret(data.encrypted_secret_key);

  return {
    organisationId: orgId,
    provider: 'paystack',
    secretKey,
    publicKey: data.public_key || '',
    mode: data.mode || 'live',
    callbackUrl: orgCallback,
    isGlobal: false,
  };
}

/**
 * Validate a callback URL for payment redirects.
 * Enforces HTTPS in production, rejects malicious schemes.
 */
export function validateCallbackUrl(url: string): { valid: boolean; reason?: string } {
  if (!url || typeof url !== 'string') {
    return { valid: false, reason: 'empty or non-string' };
  }

  const trimmed = url.trim();
  if (!trimmed) {
    return { valid: false, reason: 'empty after trimming' };
  }

  // Reject malicious schemes
  const lowercased = trimmed.toLowerCase();
  if (lowercased.startsWith('javascript:') || lowercased.startsWith('data:') || lowercased.startsWith('file:')) {
    return { valid: false, reason: `disallowed scheme: ${lowercased.split(':')[0]}` };
  }

  // Must be HTTPS (or HTTP for localhost development)
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, reason: 'not a valid URL' };
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { valid: false, reason: `disallowed protocol: ${parsed.protocol}` };
  }

  // In production, require HTTPS
  const isDev = Deno.env.get('DENO_ENV') === 'development' || Deno.env.get('SUPABASE_ENV') === 'development';
  if (!isDev && parsed.protocol !== 'https:') {
    return { valid: false, reason: 'production callback URL must use HTTPS' };
  }

  // Reject URLs with no hostname
  if (!parsed.hostname) {
    return { valid: false, reason: 'missing hostname' };
  }

  return { valid: true };
}

/**
 * Resolve the payment provider for webhook signature verification.
 * Uses the same resolution rules as resolvePaymentProvider.
 */
export async function resolveWebhookProvider(
  supabase: SupabaseClient,
  orgId: string | null | undefined,
): Promise<ResolvedPaymentProvider> {
  return resolvePaymentProvider(supabase, orgId);
}
