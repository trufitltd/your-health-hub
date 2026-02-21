import { supabase } from '@/integrations/supabase/client';

export const PaymentService = {
  async getPaymentByReference(reference: string) {
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .or(`provider_reference.eq.${reference},payment_reference.eq.${reference}`)
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data;
  },
};
