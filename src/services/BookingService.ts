import { supabase } from '@/integrations/supabase/client';
import type { BookingInitiateRequest, BookingInitiateResponse } from './marketplaceTypes';

const extractFunctionErrorMessage = async (error: unknown): Promise<string> => {
  const fallback = 'Unable to complete this request right now.';
  if (!error || typeof error !== 'object') return fallback;

  const maybeError = error as {
    message?: string;
    context?: Response;
  };

  const baseMessage = String(maybeError.message || '').trim();

  if (maybeError.context && typeof maybeError.context.clone === 'function') {
    try {
      const responseClone = maybeError.context.clone();
      const body = await responseClone.json();
      const detailed = String(body?.error || body?.message || '').trim();
      if (detailed) return detailed;
    } catch {
      // Ignore JSON parse failures and fall back to plain-text parsing.
    }

    try {
      const responseClone = maybeError.context.clone();
      const bodyText = (await responseClone.text()).trim();
      if (bodyText) return bodyText;
    } catch {
      // Ignore text parse failures.
    }
  }

  if (baseMessage && !baseMessage.toLowerCase().includes('non-2xx')) {
    return baseMessage;
  }

  return fallback;
};

export const BookingService = {
  async initiateBooking(input: BookingInitiateRequest): Promise<BookingInitiateResponse> {
    const { data: { session } } = await supabase.auth.getSession();
    const { data, error } = await supabase.functions.invoke('booking-initiate', {
      body: input,
      headers: session?.access_token ? {
        Authorization: `Bearer ${session.access_token}`,
      } : undefined,
    });

    if (error) {
      const message = await extractFunctionErrorMessage(error);
      throw new Error(message);
    }
    if (!data) throw new Error('No booking response from server');

    return data as BookingInitiateResponse;
  },

  async confirmPayment(reference: string): Promise<{ appointmentId?: string; alreadyProcessed?: boolean }> {
    const { data: { session } } = await supabase.auth.getSession();
    const { data, error } = await supabase.functions.invoke('booking-payment-confirm', {
      body: { reference },
      headers: session?.access_token ? {
        Authorization: `Bearer ${session.access_token}`,
      } : undefined,
    });

    if (error) {
      const message = await extractFunctionErrorMessage(error);
      throw new Error(message);
    }
    return data as { appointmentId?: string; alreadyProcessed?: boolean };
  },
};
