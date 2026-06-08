import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { PaymentIntentResult, PaystackVerifyResult } from '../marketplace-types.ts';

const hex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, '0')).join('');

export class PaymentService {
  constructor(private readonly supabase: SupabaseClient) {}

  private getPaystackSecretKey() {
    const value = Deno.env.get('PAYSTACK_SECRET_KEY');
    if (!value) throw new Error('PAYSTACK_SECRET_KEY is not configured');
    return value;
  }

  async createPaymentIntent(input: {
    appointmentId: string;
    patientId: string;
    doctorId: string;
    email: string;
    amount: number;
    currency?: string;
    metadata?: Record<string, unknown>;
  }): Promise<PaymentIntentResult> {
    const reference = `APT-${Date.now()}-${input.appointmentId.slice(0, 8)}`;
    const amount = Number(input.amount || 0);
    const amountInKobo = Math.round(amount * 100);
    const currency = input.currency || 'NGN';

    const metadata = {
      appointment_id: input.appointmentId,
      patient_id: input.patientId,
      doctor_id: input.doctorId,
      currency,
      ...(input.metadata || {}),
    };

    const { error } = await this.supabase.from('payments').insert({
      appointment_id: input.appointmentId,
      patient_id: input.patientId,
      amount,
      currency,
      status: 'PENDING',
      provider_reference: reference,
      provider: 'paystack',
      payment_reference: reference,
      payment_method: 'paystack',
      metadata,
    });

    if (error) throw new Error(`Failed to create payment intent: ${error.message}`);

    const { error: appointmentError } = await this.supabase
      .from('appointments')
      .update({ payment_reference: reference })
      .eq('id', input.appointmentId);

    if (appointmentError) {
      throw new Error(`Failed to persist payment reference on appointment: ${appointmentError.message}`);
    }

    const secretKey = this.getPaystackSecretKey();
    const initializePayload: Record<string, unknown> = {
      email: input.email,
      amount: amountInKobo,
      reference,
      currency,
      metadata,
    };

    const explicitCallback = Deno.env.get('PAYSTACK_CALLBACK_URL');
    if (explicitCallback && explicitCallback.trim().startsWith('http')) {
      initializePayload.callback_url = explicitCallback.trim();
    } else {
      const baseUrl = (Deno.env.get('APP_URL') || Deno.env.get('SITE_URL') || '').trim();
      if (baseUrl && baseUrl.startsWith('http')) {
        try {
          const url = new URL(baseUrl);
          url.pathname = '/patient-portal';
          // Ensure no double slashes in the path
          initializePayload.callback_url = url.toString().replace(/([^:])\/\//g, '$1/');
        } catch (e) {
          console.warn('[PaymentService] Failed to parse baseUrl for callback:', e);
        }
      }
    }

    const initializeResponse = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(initializePayload),
    });

    const initializeRaw = await initializeResponse.text();
    if (!initializeResponse.ok) {
      throw new Error(`Paystack initialize failed: ${initializeResponse.status} ${initializeRaw}`);
    }

    let initializeData: any = null;
    try {
      initializeData = JSON.parse(initializeRaw);
    } catch {
      throw new Error('Paystack initialize returned a non-JSON response');
    }

    const accessCode = String(initializeData?.data?.access_code || '').trim();
    const authorizationUrl = String(initializeData?.data?.authorization_url || '').trim();
    if (!accessCode) {
      throw new Error('Paystack initialize did not return an access code');
    }
    if (!authorizationUrl) {
      throw new Error('Paystack initialize did not return an authorization URL');
    }

    const { error: accessCodePersistError } = await this.supabase
      .from('payments')
      .update({
        metadata: {
          ...metadata,
          paystack_access_code: accessCode,
          paystack_authorization_url: authorizationUrl,
        },
      })
      .or(`provider_reference.eq.${reference},payment_reference.eq.${reference}`);

    if (accessCodePersistError) {
      console.warn('Failed to persist Paystack access code on payment metadata:', accessCodePersistError.message);
    }

    return {
      reference,
      amountInKobo,
      currency,
      email: input.email,
      metadata,
      accessCode,
      authorizationUrl,
    };
  }

  async verifyPayment(reference: string): Promise<PaystackVerifyResult> {
    const secretKey = this.getPaystackSecretKey();
    const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Paystack verify failed: ${response.status} ${text}`);
    }

    const payload = await response.json();
    const status = String(payload?.data?.status || '').toLowerCase();
    const amountInKobo = Number(payload?.data?.amount || 0);

    return {
      ok: status === 'success',
      status,
      amountInKobo,
      reference: String(payload?.data?.reference || reference),
      raw: payload,
    };
  }

  async verifyWebhookSignature(rawBody: string, signature: string | null): Promise<boolean> {
    if (!signature) return false;
    const secretKey = this.getPaystackSecretKey();

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secretKey),
      { name: 'HMAC', hash: 'SHA-512' },
      false,
      ['sign'],
    );

    const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody));
    const expected = hex(digest);
    return expected === signature;
  }

  async getPaymentByReference(reference: string) {
    const { data, error } = await this.supabase
      .from('payments')
      .select('*')
      .or(`provider_reference.eq.${reference},payment_reference.eq.${reference}`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(`Failed to load payment by reference: ${error.message}`);
    return data;
  }

  async markPaymentSuccess(reference: string, verificationPayload: Record<string, unknown>) {
    const existing = await this.getPaymentByReference(reference);
    const { error } = await this.supabase
      .from('payments')
      .update({
        status: 'success',
        verified_at: new Date().toISOString(),
        metadata: {
          ...(existing?.metadata || {}),
          verification: verificationPayload,
        },
      })
      .or(`provider_reference.eq.${reference},payment_reference.eq.${reference}`);

    if (error) throw new Error(`Failed to mark payment success: ${error.message}`);

    // Keep appointment state in sync with successful payment in case webhook/client
    // confirmation path misses explicit appointment promotion.
    const appointmentId = existing?.appointment_id ? String(existing.appointment_id) : '';
    if (appointmentId) {
      const { error: appointmentUpdateError } = await this.supabase
        .from('appointments')
        .update({
          status: 'pending_approval',
          slot_locked_until: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', appointmentId)
        .in('status', [
          'pending_payment',
          'pending payment',
          'pending-payment',
          'payment_processing',
          'payment processing',
          'payment-processing',
          'pending',
        ]);

      if (appointmentUpdateError) {
        throw new Error(`Failed to sync appointment status after payment success: ${appointmentUpdateError.message}`);
      }
    }
  }

  async markPaymentFailed(reference: string, reason: string) {
    const existing = await this.getPaymentByReference(reference);
    const { error } = await this.supabase
      .from('payments')
      .update({
        status: 'FAILED',
        metadata: {
          ...(existing?.metadata || {}),
          failure_reason: reason,
          failed_at: new Date().toISOString(),
        },
      })
      .or(`provider_reference.eq.${reference},payment_reference.eq.${reference}`);

    if (error) throw new Error(`Failed to mark payment failed: ${error.message}`);
  }
}
