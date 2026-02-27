import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { PaymentService } from '../_shared/services/PaymentService.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      throw new Error('Supabase env vars are not configured');
    }

    const authHeader = req.headers.get('Authorization') || '';
    const authedClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await authedClient.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload = await req.json();
    const { appointmentId, patientId } = payload;

    if (!appointmentId) {
      return new Response(JSON.stringify({ error: 'Missing appointmentId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey);

    // Fetch the appointment to get doctor_id and pricing
    const { data: appointment, error: appointmentError } = await serviceClient
      .from('appointments')
      .select('*')
      .eq('id', appointmentId)
      .maybeSingle();

    if (appointmentError || !appointment) {
      return new Response(JSON.stringify({ error: 'Appointment not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get patient profile for email
    const { data: profile, error: profileError } = await serviceClient
      .from('profiles')
      .select('email')
      .eq('user_id', patientId || user.id)
      .maybeSingle();

    if (profileError) {
      console.warn('[payment-initialize] profile lookup failed, falling back to auth email:', profileError.message);
    }

    // Get the appointment's consultation type and duration to determine price
    // For now, use the original appointment_price if available, otherwise default price
    const appointmentPrice = appointment.appointment_price || 5000; // Default price in naira

    const paymentService = new PaymentService(serviceClient);
    const paymentIntent = await paymentService.createPaymentIntent({
      appointmentId,
      patientId: patientId || user.id,
      doctorId: appointment.doctor_id,
      email: profile?.email || user.email || '',
      amount: appointmentPrice,
      metadata: {
        appointment_id: appointmentId,
        patient_id: patientId || user.id,
        doctor_id: appointment.doctor_id,
        consultation_type: appointment.consultation_type || 'general',
        type: 'appointment_confirmation',
      },
    });

    return new Response(
      JSON.stringify({
        email: paymentIntent.email,
        amountInKobo: paymentIntent.amountInKobo,
        reference: paymentIntent.reference,
        metadata: paymentIntent.metadata,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );
  } catch (error) {
    console.error('[payment-initialize] error', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
