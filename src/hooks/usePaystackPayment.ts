import { useCallback } from 'react';

interface PaystackConfig {
  email: string;
  amount: number; // in kobo (multiply naira by 100)
  reference: string;
  publicKey: string;
  metadata?: {
    custom_fields?: Array<{
      display_name: string;
      variable_name: string;
      value: string;
    }>;
  };
  onSuccess: (reference: any) => void;
  onClose: () => void;
}

export const usePaystackPayment = () => {
  const initializePayment = useCallback((config: PaystackConfig) => {
    const handler = (window as any).PaystackPop.setup({
      key: config.publicKey,
      email: config.email,
      amount: config.amount,
      ref: config.reference,
      metadata: config.metadata,
      callback: (response: any) => {
        config.onSuccess(response);
      },
      onClose: () => {
        config.onClose();
      },
    });

    handler.openIframe();
  }, []);

  return { initializePayment };
};
