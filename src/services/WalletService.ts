import { supabase } from '@/integrations/supabase/client';
import type { DoctorWallet } from './marketplaceTypes';

export const WalletService = {
  async getDoctorWallet(doctorId: string): Promise<DoctorWallet | null> {
    const { data, error } = await supabase
      .from('doctor_wallet')
      .select('*')
      .eq('doctor_id', doctorId)
      .maybeSingle();

    if (error) throw error;
    return (data as DoctorWallet | null) || null;
  },

  async getWalletTransactions(doctorId: string) {
    const { data, error } = await supabase
      .from('doctor_wallet_transactions')
      .select('*')
      .eq('doctor_id', doctorId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },
};
