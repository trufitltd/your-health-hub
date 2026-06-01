import { useCallback } from 'react';

interface PaystackConfig {
  email: string;
  amount: number; // in the smallest currency unit used by Paystack
  reference: string;
  publicKey: string;
  currency?: string;
  accessCode?: string;
  authorizationUrl?: string;
  preferRedirect?: boolean;
  preferAccessCode?: boolean;
  metadata?: Record<string, unknown>;
  onSuccess: (response: unknown) => void;
  onClose: () => void;
}

interface PaystackHandler {
  openIframe: () => void;
}

interface PaystackSDK {
  setup: (payload: Record<string, unknown>) => PaystackHandler | null;
}

const PAYSTACK_SDK_URL = 'https://js.paystack.co/v1/inline.js';
const PAYSTACK_SDK_LOAD_TIMEOUT_MS = 12000;
let paystackSdkPromise: Promise<PaystackSDK> | null = null;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const sanitizeMetadata = (metadata?: Record<string, unknown>) => {
  if (!isRecord(metadata)) return undefined;

  const safeMetadata: Record<string, unknown> = {};
  Object.entries(metadata).forEach(([key, value]) => {
    if (value === null || value === undefined) return;
    if (typeof value === 'string' || typeof value === 'boolean') {
      safeMetadata[key] = value;
      return;
    }
    if (typeof value === 'number') {
      if (Number.isFinite(value)) safeMetadata[key] = value;
      return;
    }
    // Keep metadata JSON-safe for the Paystack SDK.
    safeMetadata[key] = JSON.stringify(value);
  });

  return Object.keys(safeMetadata).length > 0 ? safeMetadata : undefined;
};

export const usePaystackPayment = () => {
  const ensurePaystackSdk = useCallback(async (): Promise<PaystackSDK> => {
    const existing = (window as Window & { PaystackPop?: PaystackSDK }).PaystackPop;
    if (existing && typeof existing.setup === 'function') {
      return existing;
    }

    if (!paystackSdkPromise) {
      paystackSdkPromise = new Promise<PaystackSDK>((resolve, reject) => {
        if (typeof document === 'undefined') {
          reject(new Error('Document is not available to load Paystack SDK'));
          return;
        }

        let settled = false;
        let timeoutId: number | null = null;
        const finish = (fn: () => void) => {
          if (settled) return;
          settled = true;
          if (timeoutId !== null) window.clearTimeout(timeoutId);
          fn();
        };

        const alreadyInjected = Array.from(document.getElementsByTagName('script')).find((script) =>
          (script.src || '').includes('js.paystack.co/v1/inline.js')
        );

        const completeLoad = () => {
          const sdk = (window as Window & { PaystackPop?: PaystackSDK }).PaystackPop;
          if (sdk && typeof sdk.setup === 'function') {
            finish(() => resolve(sdk));
          } else {
            finish(() => reject(new Error('Paystack SDK loaded but unavailable')));
          }
        };

        timeoutId = window.setTimeout(() => {
          finish(() => reject(new Error('Timed out while loading Paystack SDK. Please check your network or ad blocker and try again.')));
        }, PAYSTACK_SDK_LOAD_TIMEOUT_MS);

        if (alreadyInjected) {
          alreadyInjected.addEventListener('load', completeLoad, { once: true });
          alreadyInjected.addEventListener('error', () => finish(() => reject(new Error('Failed to load Paystack SDK'))), { once: true });
          // If script already loaded before listeners attached, resolve on next tick.
          window.setTimeout(completeLoad, 0);
          return;
        }

        const script = document.createElement('script');
        script.src = PAYSTACK_SDK_URL;
        script.async = true;
        script.onload = completeLoad;
        script.onerror = () => finish(() => reject(new Error('Failed to load Paystack SDK')));
        document.head.appendChild(script);
      }).catch((error) => {
        paystackSdkPromise = null;
        throw error;
      });
    }

    return paystackSdkPromise;
  }, []);

  const initializePayment = useCallback(async (config: PaystackConfig) => {
    // Enable Paystack on all environments by default
    // Only disable if explicitly requested via query string or localStorage
    const isLocalhost = typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

    const disablePaystack = typeof window !== 'undefined' && (() => {
      try {
        const params = new URLSearchParams(window.location.search);
        if (params.get('disablePaystackRemote') === 'true') return true;
        return window.localStorage?.getItem('disablePaystackRemote') === 'true';
      } catch {
        return false;
      }
    })();

    // Paystack is enabled by default on all environments
    // Only disable if explicitly requested (for testing purposes)
    if (disablePaystack) {
      console.warn('Paystack payment disabled. Remove disablePaystackRemote=true to enable Paystack.');
      // Call onClose to indicate payment was cancelled/skipped
      config.onClose();
      return;
    }

    const key = String(config.publicKey || '').trim();
    const email = String(config.email || '').trim();
    const reference = String(config.reference || '').trim();
    const amountInKobo = Math.round(Number(config.amount || 0));
    const currency = String(config.currency || 'NGN').trim().toUpperCase() || 'NGN';
    const accessCode = String(config.accessCode || '').trim();
    const authorizationUrl = String(config.authorizationUrl || '').trim();

    if (!key) throw new Error('Paystack public key is missing');
    if (!email) throw new Error('Payer email is missing for payment');
    if (!reference) throw new Error('Payment reference is missing');
    if (!Number.isFinite(amountInKobo) || amountInKobo <= 0) {
      throw new Error('Invalid payment amount for Paystack checkout');
    }

    const wantsRedirect = Boolean(config.preferRedirect);
    const canRedirect = wantsRedirect && Boolean(authorizationUrl);
    const canInlineWithAccessCode = Boolean(accessCode);

    if (wantsRedirect && canRedirect) {
      window.location.assign(authorizationUrl);
      return;
    }

    if (wantsRedirect && !canRedirect && !canInlineWithAccessCode) {
      throw new Error(
        'Paystack redirect URL and access code are missing. Please try again or refresh payment initialization.',
      );
    }

    const paystack = await ensurePaystackSdk();

    const payload: Record<string, unknown> = {
      key,
      currency,
      callback: (response: unknown) => {
        config.onSuccess(response);
      },
      onClose: () => {
        config.onClose();
      },
    };

    const useAccessCode = Boolean(accessCode) && (Boolean(config.preferAccessCode) || (wantsRedirect && !canRedirect));
    if (useAccessCode) {
      payload.access_code = accessCode;
    } else {
      payload.ref = reference;
      payload.reference = reference;
    }
    payload.email = email;
    payload.amount = amountInKobo;

    const metadata = sanitizeMetadata(config.metadata);
    if (metadata) {
      payload.metadata = metadata;
    }

    const handler = paystack.setup(payload);
    if (!handler || typeof handler.openIframe !== 'function') {
      throw new Error('Paystack checkout failed to initialize');
    }

    handler.openIframe();
  }, [ensurePaystackSdk]);

  return { initializePayment };
};
