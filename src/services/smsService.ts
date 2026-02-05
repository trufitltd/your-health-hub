// SMS Service using Africa's Talking API via Supabase Edge Functions
// Documentation: https://developers.africastalking.com/docs/sms/overview

import { supabase } from '@/integrations/supabase/client';

interface SMSMessage {
  to: string;
  message: string;
  messageType?: 'welcome' | 'appointment_reminder' | 'appointment_confirmation' | 'general';
}

interface AppointmentDetails {
  doctorName: string;
  appointmentDate: string;
  appointmentTime: string;
  patientName: string;
}

class SMSService {
  private async callEdgeFunction(functionName: string, payload: any): Promise<any> {
    try {
      console.log(`🚀 Calling Edge Function: ${functionName}`, payload);
      
      // Get current session
      const { data: { session } } = await supabase.auth.getSession();
      console.log('📍 Session status:', !!session);
      
      if (!session) {
        console.error('❌ No active session found');
        return { success: false, error: 'User not authenticated' };
      }

      const { data, error } = await supabase.functions.invoke(functionName, {
        body: payload,
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      console.log(`📥 Edge Function Response:`, { data, error });

      if (error) {
        console.error(`❌ Edge Function ${functionName} error:`, error);
        return { success: false, error: error.message };
      }

      // Parse the response if it's a string
      let parsedData = data;
      if (typeof data === 'string') {
        try {
          parsedData = JSON.parse(data);
          console.log('📊 Parsed response:', parsedData);
        } catch (parseError) {
          console.error('❌ Failed to parse response:', parseError);
          return { success: false, error: 'Invalid response format' };
        }
      }

      return parsedData;
    } catch (error) {
      console.error(`💥 Edge Function ${functionName} call failed:`, error);
      return { success: false, error: 'Function call failed' };
    }
  }

  async sendWelcomeSMS(phoneNumber: string, fullName: string): Promise<boolean> {
    // Convert phone number to international format if needed
    const formattedPhone = this.formatPhoneNumber(phoneNumber);
    console.log(`📞 Formatted phone: ${phoneNumber} -> ${formattedPhone}`);
    
    const result = await this.callEdgeFunction('send-sms', {
      phoneNumber: formattedPhone,
      fullName,
      messageType: 'welcome'
    });

    if (result.success) {
      // Log SMS to database for tracking
      await this.logSMSToDatabase(formattedPhone, 'welcome', `Welcome message sent to ${fullName}`);
      return true;
    }
    
    return false;
  }

  private formatPhoneNumber(phoneNumber: string): string {
    // Remove all non-digit characters
    const cleaned = phoneNumber.replace(/\D/g, '');
    
    // If it starts with 0 and is 11 digits (Nigerian format), convert to +234
    if (cleaned.startsWith('0') && cleaned.length === 11) {
      return '+234' + cleaned.substring(1);
    }
    
    // If it starts with 234 and is 13 digits, add +
    if (cleaned.startsWith('234') && cleaned.length === 13) {
      return '+' + cleaned;
    }
    
    // If it already starts with +, return as is
    if (phoneNumber.startsWith('+')) {
      return phoneNumber;
    }
    
    // Default: assume it needs +234 prefix for Nigerian numbers
    if (cleaned.length === 10) {
      return '+234' + cleaned;
    }
    
    // Return original if we can't determine format
    return phoneNumber;
  }

  async sendAppointmentConfirmation(phoneNumber: string, appointmentDetails: AppointmentDetails): Promise<boolean> {
    const result = await this.callEdgeFunction('send-sms', {
      phoneNumber,
      messageType: 'appointment_confirmation',
      appointmentDetails
    });

    if (result.success) {
      await this.logSMSToDatabase(phoneNumber, 'appointment_confirmation', 
        `Appointment confirmation sent for ${appointmentDetails.appointmentDate}`);
      return true;
    }
    
    return false;
  }

  async sendAppointmentReminder(phoneNumber: string, appointmentDetails: AppointmentDetails): Promise<boolean> {
    const result = await this.callEdgeFunction('send-sms', {
      phoneNumber,
      messageType: 'appointment_reminder',
      appointmentDetails
    });

    if (result.success) {
      await this.logSMSToDatabase(phoneNumber, 'appointment_reminder', 
        `Appointment reminder sent for ${appointmentDetails.appointmentDate}`);
      return true;
    }
    
    return false;
  }

  async sendCustomSMS(phoneNumber: string, message: string): Promise<boolean> {
    const result = await this.callEdgeFunction('send-sms', {
      phoneNumber,
      message,
      messageType: 'general'
    });

    if (result.success) {
      await this.logSMSToDatabase(phoneNumber, 'general', message.substring(0, 100));
      return true;
    }
    
    return false;
  }

  private async logSMSToDatabase(phoneNumber: string, messageType: string, content: string): Promise<void> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      await supabase.from('sms_logs').insert({
        phone_number: phoneNumber,
        message_type: messageType,
        content: content,
        sent_at: new Date().toISOString(),
        sent_by: user?.id || null,
        status: 'sent'
      });
    } catch (error) {
      console.error('Failed to log SMS to database:', error);
    }
  }

  // Get SMS history for a phone number
  async getSMSHistory(phoneNumber: string): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('sms_logs')
        .select('*')
        .eq('phone_number', phoneNumber)
        .order('sent_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Failed to fetch SMS history:', error);
      return [];
    }
  }
}

export const smsService = new SMSService();
