import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface AppointmentDetails {
  doctorName: string;
  appointmentDate: string;
  appointmentTime: string;
  patientName: string;
}

function generateMessage(messageType: string, data: any): string {
  switch (messageType) {
    case 'welcome':
      return `Welcome to MyEDoctor, ${data.fullName}! Your registration is complete. You can now book appointments with our qualified doctors. Thank you for choosing us for your healthcare needs.`;
    
    case 'appointment_confirmation':
      const { doctorName, appointmentDate, appointmentTime, patientName } = data.appointmentDetails;
      return `Hi ${patientName}, your appointment with Dr. ${doctorName} is confirmed for ${appointmentDate} at ${appointmentTime}. Please be ready 5 minutes before your scheduled time. - MyEDoctor`;
    
    case 'appointment_reminder':
      const { doctorName: drName, appointmentDate: apptDate, appointmentTime: apptTime, patientName: ptName } = data.appointmentDetails;
      return `Reminder: You have an appointment with Dr. ${drName} tomorrow (${apptDate}) at ${apptTime}. Please ensure you're ready on time. - MyEDoctor`;
    
    case 'general':
      return data.message;
    
    default:
      return data.message || `Hello from MyEDoctor! Thank you for using our services.`;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { 
      headers: corsHeaders,
      status: 200
    })
  }

  try {
    console.log('SMS Edge Function called with method:', req.method);
    
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { 
          status: 405, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const { phoneNumber, fullName, messageType = 'welcome', appointmentDetails, message } = await req.json()
    console.log('Request payload:', { phoneNumber, fullName, messageType });

    if (!phoneNumber) {
      return new Response(
        JSON.stringify({ error: 'Phone number is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Generate appropriate message based on type
    const smsMessage = generateMessage(messageType, { fullName, appointmentDetails, message });
    console.log('Generated SMS message:', smsMessage.substring(0, 50) + '...');

    // Get Twilio environment variables
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const fromNumber = Deno.env.get('TWILIO_PHONE_NUMBER');
    
    console.log('Environment check:', { 
      hasAccountSid: !!accountSid, 
      hasAuthToken: !!authToken,
      fromNumber 
    });

    if (!accountSid || !authToken || !fromNumber) {
      console.error('Missing Twilio environment variables');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'SMS service not configured properly' 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Twilio API call
    console.log('Calling Twilio API...');
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    
    const response = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        From: fromNumber,
        To: phoneNumber,
        Body: smsMessage
      })
    })

    const result = await response.json()
    console.log('Twilio response:', { status: response.status, result });

    if (response.ok && result.sid) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'SMS sent successfully',
          messageType,
          recipient: phoneNumber,
          twilioSid: result.sid
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    } else {
      console.error('SMS sending failed:', result);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'SMS sending failed', 
          details: result,
          messageType
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

  } catch (error) {
    console.error('Edge function error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})