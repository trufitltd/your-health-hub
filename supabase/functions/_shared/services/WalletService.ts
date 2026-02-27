import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { normalizeDoctorType, roundMoney } from '../marketplace-types.ts';

export class WalletService {
  constructor(private readonly supabase: SupabaseClient) {}

  private async ensureWallet(doctorId: string) {
    const { data: existing, error } = await this.supabase
      .from('doctor_wallet')
      .select('*')
      .eq('doctor_id', doctorId)
      .maybeSingle();

    if (error) throw new Error(`Failed to load doctor wallet: ${error.message}`);

    if (existing) return existing;

    const { data: created, error: createError } = await this.supabase
      .from('doctor_wallet')
      .insert({ doctor_id: doctorId, pending_balance: 0, available_balance: 0 })
      .select('*')
      .single();

    if (createError) throw new Error(`Failed to create doctor wallet: ${createError.message}`);
    return created;
  }

  private async getDoctorType(doctorId: string) {
    const { data: reg, error: regError } = await this.supabase
      .from('doctor_registrations')
      .select('specialty')
      .eq('user_id', doctorId)
      .maybeSingle();

    if (regError) throw new Error(`Failed loading doctor registration for fee rule: ${regError.message}`);

    if (reg?.specialty) return normalizeDoctorType(reg.specialty);

    const { data: doctor, error: doctorError } = await this.supabase
      .from('doctors')
      .select('specialty')
      .eq('id', doctorId)
      .maybeSingle();

    if (doctorError) throw new Error(`Failed loading doctor profile for fee rule: ${doctorError.message}`);

    return normalizeDoctorType(doctor?.specialty);
  }

  private async getPlatformFeeRule(doctorType: 'GP' | 'Specialist') {
    const { data, error } = await this.supabase
      .from('platform_fee_rules')
      .select('*')
      .eq('doctor_type', doctorType)
      .eq('active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(`Failed loading platform fee rules: ${error.message}`);
    return data;
  }

  async addPendingEarning(appointment: {
    id: string;
    doctor_id: string;
    final_price: number;
    price_breakdown?: Record<string, unknown>;
  }) {
    const doctorType = await this.getDoctorType(appointment.doctor_id);
    const feeRule = await this.getPlatformFeeRule(doctorType);

    const finalPrice = Number(appointment.final_price || 0);
    if (finalPrice <= 0) {
      throw new Error('Cannot add wallet earning from non-positive final price');
    }

    const platformFee = feeRule
      ? feeRule.fee_type === 'percentage'
        ? roundMoney((finalPrice * Number(feeRule.value || 0)) / 100)
        : roundMoney(Number(feeRule.value || 0))
      : 0;

    const doctorEarning = roundMoney(Math.max(finalPrice - platformFee, 0));
    const wallet = await this.ensureWallet(appointment.doctor_id);

    const { error: walletUpdateError } = await this.supabase
      .from('doctor_wallet')
      .update({
        pending_balance: roundMoney(Number(wallet.pending_balance || 0) + doctorEarning),
      })
      .eq('doctor_id', appointment.doctor_id);

    if (walletUpdateError) {
      throw new Error(`Failed to update doctor pending wallet balance: ${walletUpdateError.message}`);
    }

    const releaseHours = Number(Deno.env.get('DOCTOR_WALLET_RELEASE_HOURS') || 24);
    const availableAfter = new Date();
    availableAfter.setHours(availableAfter.getHours() + releaseHours);

    const { error: walletTxError } = await this.supabase.from('doctor_wallet_transactions').insert({
      doctor_id: appointment.doctor_id,
      appointment_id: appointment.id,
      amount: doctorEarning,
      status: 'pending',
      available_after: availableAfter.toISOString(),
    });

    if (walletTxError) {
      throw new Error(`Failed to create wallet transaction: ${walletTxError.message}`);
    }

    const mergedBreakdown = {
      ...(appointment.price_breakdown || {}),
      platform_fee: platformFee,
      doctor_earning: doctorEarning,
      doctor_type: doctorType,
      platform_fee_rule: feeRule
        ? {
            id: feeRule.id,
            fee_type: feeRule.fee_type,
            value: feeRule.value,
          }
        : null,
    };

    const { error: appointmentError } = await this.supabase
      .from('appointments')
      .update({
        platform_fee: platformFee,
        doctor_earning: doctorEarning,
        price_breakdown: mergedBreakdown,
      })
      .eq('id', appointment.id);

    if (appointmentError) {
      throw new Error(`Failed to persist appointment wallet breakdown: ${appointmentError.message}`);
    }

    return {
      doctorType,
      platformFee,
      doctorEarning,
    };
  }

  async releasePendingFunds(afterHours = Number(Deno.env.get('DOCTOR_WALLET_RELEASE_HOURS') || 24)) {
    const holdHours = Math.max(0, afterHours);
    const now = new Date();
    const dueBy = new Date(now.getTime() - holdHours * 60 * 60 * 1000);

    const { data: pendingTransactions, error } = await this.supabase
      .from('doctor_wallet_transactions')
      .select('*')
      .eq('status', 'pending')
      .lte('available_after', dueBy.toISOString())
      .order('doctor_id', { ascending: true });

    if (error) {
      throw new Error(`Failed loading pending wallet transactions: ${error.message}`);
    }

    const transactions = pendingTransactions || [];
    if (transactions.length === 0) {
      return { releasedCount: 0, totalAmount: 0, doctorsAffected: 0 };
    }

    const byDoctor = new Map<string, number>();
    transactions.forEach((row: any) => {
      const amount = Number(row.amount || 0);
      byDoctor.set(row.doctor_id, roundMoney((byDoctor.get(row.doctor_id) || 0) + amount));
    });

    for (const [doctorId, amount] of byDoctor.entries()) {
      const wallet = await this.ensureWallet(doctorId);
      const pending = Number(wallet.pending_balance || 0);
      const available = Number(wallet.available_balance || 0);

      const nextPending = roundMoney(Math.max(pending - amount, 0));
      const nextAvailable = roundMoney(available + amount);

      const { error: updateError } = await this.supabase
        .from('doctor_wallet')
        .update({ pending_balance: nextPending, available_balance: nextAvailable })
        .eq('doctor_id', doctorId);

      if (updateError) {
        throw new Error(`Failed releasing wallet funds for doctor ${doctorId}: ${updateError.message}`);
      }
    }

    const ids = transactions.map((row: any) => row.id);
    const { error: markError } = await this.supabase
      .from('doctor_wallet_transactions')
      .update({ status: 'available', released_at: new Date().toISOString() })
      .in('id', ids);

    if (markError) {
      throw new Error(`Failed marking wallet transactions as available: ${markError.message}`);
    }

    const totalAmount = roundMoney(transactions.reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0));

    return {
      releasedCount: transactions.length,
      totalAmount,
      doctorsAffected: byDoctor.size,
    };
  }
}
