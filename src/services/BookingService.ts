import { supabase } from '@/integrations/supabase/client';
import type { BookingInitiateRequest, BookingInitiateResponse } from './marketplaceTypes';

export const BookingService = {
  async initiateBooking(input: BookingInitiateRequest): Promise<BookingInitiateResponse> {
    const { data: { session } } = await supabase.auth.getSession();
    const { data, error } = await supabase.functions.invoke('booking-initiate', {
      body: input,
      headers: session?.access_token ? {
        Authorization: `Bearer ${session.access_token}`,
      } : undefined,
    });

    if (error) throw error;
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

    if (error) throw error;
    return data as { appointmentId?: string; alreadyProcessed?: boolean };
  },
};
