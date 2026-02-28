import { supabase } from '@/integrations/supabase/client';
import type { PatientWallet, PatientWalletTransaction, PatientWalletWithdrawalRequest } from './marketplaceTypes';

export const PatientWalletService = {
  async getPatientWallet(patientId: string): Promise<PatientWallet | null> {
    const { data, error } = await supabase
      .from('patient_wallet')
      .select('*')
      .eq('patient_id', patientId)
      .maybeSingle();

    if (error) throw error;
    return (data as PatientWallet | null) || null;
  },

  async getWalletTransactions(patientId: string): Promise<PatientWalletTransaction[]> {
    const { data, error } = await supabase
      .from('patient_wallet_transactions')
      .select('*')
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data as PatientWalletTransaction[]) || [];
  },

  async cancelAppointmentWithRefund(appointmentId: string, reason?: string) {
    const { data, error } = await supabase.rpc('cancel_appointment_with_refund', {
      p_appointment_id: appointmentId,
      p_reason: reason ?? null,
    });

    if (error) throw error;
    return data as {
      appointment_id: string;
      status: 'cancelled';
      refund_amount: number;
      doctor_reversal_amount: number;
      already_cancelled?: boolean;
    };
  },

  async markAppointmentNoShow(appointmentId: string, reason?: string) {
    const { data, error } = await supabase.rpc('mark_appointment_no_show', {
      p_appointment_id: appointmentId,
      p_reason: reason ?? null,
    });

    if (error) throw error;
    return data as {
      appointment_id: string;
      status: 'no_show';
      refund_amount: number;
      doctor_reversal_amount: number;
      already_no_show?: boolean;
    };
  },

  async requestWalletWithdrawal(amount: number, narration?: string) {
    const { data, error } = await supabase.rpc('request_patient_wallet_withdrawal', {
      p_amount: amount,
      p_narration: narration ?? null,
    });

    if (error) throw error;
    return data as PatientWalletWithdrawalRequest;
  },
};
