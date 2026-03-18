import { useCallback } from 'react';

interface PaystackConfig {
  email: string;
  amount: number; // in kobo (multiply naira by 100)
  reference: string;
  publicKey: string;
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
  const initializePayment = useCallback((config: PaystackConfig) => {
    // Only enable Paystack for localhost by default.
    // Use ?enablePaystackRemote=true or set localStorage.enablePaystackRemote=true for remote testing.
    const isLocalhost = typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

    const enableRemote = typeof window !== 'undefined' && (() => {
      try {
        const params = new URLSearchParams(window.location.search);
        if (params.get('enablePaystackRemote') === 'true') return true;
        return window.localStorage?.getItem('enablePaystackRemote') === 'true';
      } catch {
        return false;
      }
    })();

    if (!isLocalhost && !enableRemote) {
      console.warn('Paystack payment skipped on remote deployment for testing. Use wallet payments or set enablePaystackRemote=true via query string or localStorage to enable Paystack.');
      // Call onClose to indicate payment was cancelled/skipped
      config.onClose();
      return;
    }

    const key = String(config.publicKey || '').trim();
    const email = String(config.email || '').trim();
    const reference = String(config.reference || '').trim();
    const amountInKobo = Math.round(Number(config.amount || 0));

    if (!key) throw new Error('Paystack public key is missing');
    if (!email) throw new Error('Payer email is missing for payment');
    if (!reference) throw new Error('Payment reference is missing');
    if (!Number.isFinite(amountInKobo) || amountInKobo <= 0) {
      throw new Error('Invalid payment amount for Paystack checkout');
    }

    const paystack = (window as Window & { PaystackPop?: PaystackSDK }).PaystackPop;
    if (!paystack || typeof paystack.setup !== 'function') {
      throw new Error('Paystack SDK is not loaded');
    }

    const payload: Record<string, unknown> = {
      key,
      email,
      amount: amountInKobo,
      ref: reference,
      reference,
      currency: 'NGN',
      callback: (response: unknown) => {
        config.onSuccess(response);
      },
      onClose: () => {
        config.onClose();
      },
    };

    const metadata = sanitizeMetadata(config.metadata);
    if (metadata) {
      payload.metadata = metadata;
    }

    const handler = paystack.setup(payload);
    if (!handler || typeof handler.openIframe !== 'function') {
      throw new Error('Paystack checkout failed to initialize');
    }

    handler.openIframe();
  }, []);

  return { initializePayment };
};
