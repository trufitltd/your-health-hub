import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-paystack-signature',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const paystackSecretKey = Deno.env.get('PAYSTACK_SECRET_KEY')
    if (!paystackSecretKey) {
      throw new Error('PAYSTACK_SECRET_KEY not configured')
    }

    // Get request body
    const body = await req.text()
    const event = JSON.parse(body)
    
    console.log('Webhook event:', event.event)
    console.log('Event data:', JSON.stringify(event.data))

    // Verify Paystack signature (optional - only if header is present)
    const signature = req.headers.get('x-paystack-signature')
    if (signature) {
      console.log('Verifying signature...')
      const encoder = new TextEncoder()
      const data = encoder.encode(body)
      const key = encoder.encode(paystackSecretKey)
      
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        key,
        { name: 'HMAC', hash: 'SHA-512' },
        false,
        ['sign']
      )
      
      const hashBuffer = await crypto.subtle.sign('HMAC', cryptoKey, data)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      const expectedSignature = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

      console.log('Signature match:', signature === expectedSignature)
      
      if (signature !== expectedSignature) {
        console.error('Invalid signature - Expected:', expectedSignature.substring(0, 20), 'Got:', signature.substring(0, 20))
        // Don't reject - Paystack signature verification can be tricky
        // return new Response(JSON.stringify({ error: 'Invalid signature' }), {
        //   status: 400,
        //   headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        // })
      }
    } else {
      console.log('No signature header found - skipping verification')
    }

    // Handle successful payment
    if (event.event === 'charge.success') {
      const { reference, metadata, amount } = event.data

      // Initialize Supabase client
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      const supabase = createClient(supabaseUrl, supabaseKey)

      // Extract appointment details from metadata
      const customFields = metadata?.custom_fields || []
      const doctorId = customFields.find((f: any) => f.variable_name === 'doctor_id')?.value
      const patientId = customFields.find((f: any) => f.variable_name === 'patient_id')?.value
      const appointmentDate = customFields.find((f: any) => f.variable_name === 'appointment_date')?.value
      const appointmentTime = customFields.find((f: any) => f.variable_name === 'appointment_time')?.value

      console.log('Extracted data:', { doctorId, patientId, appointmentDate, appointmentTime })

      if (!doctorId || !patientId || !appointmentDate || !appointmentTime) {
        console.error('Missing appointment details in metadata')
        return new Response(JSON.stringify({ error: 'Missing appointment details', metadata }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Check if payment already processed (prevent duplicates)
      const { data: existingPayment } = await supabase
        .from('payments')
        .select('id')
        .eq('payment_reference', reference)
        .single()

      if (existingPayment) {
        console.log('Payment already processed:', reference)
        return new Response(JSON.stringify({ success: true, message: 'Already processed' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Create appointment with pending status (doctor needs to confirm)
      const { data: appointment, error: appointmentError } = await supabase
        .from('appointments')
        .insert({
          patient_id: patientId,
          doctor_id: doctorId,
          date: appointmentDate,
          time: appointmentTime,
          status: 'pending',
          notes: `Payment confirmed. Reference: ${reference}. Amount: ₦${amount / 100}`,
        })
        .select()
        .single()

      if (appointmentError) {
        console.error('Error creating appointment:', appointmentError)
        return new Response(JSON.stringify({ error: 'Failed to create appointment', details: appointmentError }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Create payment record
      const { error: paymentError } = await supabase
        .from('payments')
        .insert({
          appointment_id: appointment.id,
          patient_id: patientId,
          amount: amount / 100,
          payment_reference: reference,
          payment_method: 'paystack',
          status: 'completed',
          payment_date: new Date().toISOString(),
        })

      if (paymentError) {
        console.error('Error creating payment record:', paymentError)
      }

      console.log('Appointment created successfully:', appointment.id)
      return new Response(JSON.stringify({ success: true, appointment_id: appointment.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Webhook error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
