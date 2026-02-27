import { supabase } from '@/integrations/supabase/client';
import type { BookingInitiateRequest, BookingInitiateResponse } from './marketplaceTypes';

export const BookingService = {
  async initiateBooking(input: BookingInitiateRequest): Promise<BookingInitiateResponse> {
    const { data, error } = await supabase.functions.invoke('booking-initiate', {
      body: input,
    });

    if (error) throw error;
    if (!data) throw new Error('No booking response from server');

    return data as BookingInitiateResponse;
  },
};
