// Email Service using Supabase Edge Functions or SendGrid

import { supabase } from '@/integrations/supabase/client';

interface EmailPayload {
  to: string;
  subject: string;
  htmlContent: string;
  textContent?: string;
}

interface DoctorApprovalEmail {
  doctorEmail: string;
  doctorName: string;
}

class EmailService {
  private async sendEmail(payload: EmailPayload): Promise<{ success: boolean; error?: string }> {
    try {
      console.log('📧 Attempting to send email:', { to: payload.to, subject: payload.subject });
      
      // Get current session
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        console.warn('⚠️ No active session for email - using edge function without auth');
      }

      // Try to invoke the email edge function
      const { data, error } = await supabase.functions.invoke('send-email', {
        body: {
          to: payload.to,
          subject: payload.subject,
          htmlContent: payload.htmlContent,
          textContent: payload.textContent,
        },
        ...(session && {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }),
      });

      if (error) {
        console.error('❌ Email function error:', error);
        // Return success anyway - email might fail but shouldn't block approval
        return { success: true, error: 'Email notification failed but proceeding' };
      }

      console.log('✅ Email sent successfully:', data);
      return { success: true };
    } catch (err) {
      console.error('❌ Error sending email:', err);
      // Don't throw - email is optional
      return { success: true, error: String(err) };
    }
  }

  async sendDoctorApprovalEmail(payload: DoctorApprovalEmail): Promise<{ success: boolean; error?: string }> {
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
            .content { background: #f9f9f9; padding: 20px; }
            .footer { background: #f0f0f0; padding: 15px; text-align: center; font-size: 12px; color: #666; }
            .button { background: #667eea; color: white; padding: 12px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 20px 0; }
            .success-icon { color: #28a745; font-size: 48px; margin-bottom: 10px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎉 Welcome to MyEdoctor!</h1>
            </div>
            <div class="content">
              <p>Dear Dr. ${payload.doctorName},</p>
              
              <p>Congratulations! Your application has been reviewed and <strong>approved</strong>.</p>
              
              <h3>Your Account is Now Active</h3>
              <p>Your profile has been verified and activated on the MyEdoctor platform. You can now:</p>
              <ul>
                <li>Access your doctor portal</li>
                <li>View and manage patient appointments</li>
                <li>Conduct consultations</li>
                <li>Update your availability schedule</li>
                <li>Track your ratings and reviews</li>
              </ul>
              
              <p>
                <a href="${window.location.origin}/doctor-portal" class="button">Go to Doctor Portal</a>
              </p>
              
              <h3>Getting Started</h3>
              <p>Please log in to your account to:</p>
              <ul>
                <li>Complete your profile setup</li>
                <li>Set your consultation rates</li>
                <li>Configure your availability schedule</li>
                <li>Review the platform guidelines</li>
              </ul>
              
              <p>If you have any questions or need assistance, please don't hesitate to contact our support team.</p>
              
              <p>Best regards,<br/><strong>MyEdoctor Team</strong></p>
            </div>
            <div class="footer">
              <p>&copy; 2026 MyEdoctor. All rights reserved.</p>
              <p>This is an automated message. Please do not reply to this email.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const textContent = `
Welcome to MyEdoctor, Dr. ${payload.doctorName}!

Your application has been approved and your account is now active.

You can now access:
- Doctor portal
- View and manage patient appointments
- Conduct consultations
- Update availability schedule
- Track ratings and reviews

Visit: ${typeof window !== 'undefined' ? window.location.origin : 'https://myedoctor.com'}/doctor-portal

Best regards,
MyEdoctor Team
    `.trim();

    return this.sendEmail({
      to: payload.doctorEmail,
      subject: 'Your MyEdoctor Account Has Been Approved! 🎉',
      htmlContent,
      textContent,
    });
  }

  async sendDoctorRejectionEmail(doctorEmail: string, doctorName: string, reason?: string): Promise<{ success: boolean; error?: string }> {
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
            .content { background: #f9f9f9; padding: 20px; }
            .footer { background: #f0f0f0; padding: 15px; text-align: center; font-size: 12px; color: #666; }
            .alert { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 15px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>MyEdoctor Application Update</h1>
            </div>
            <div class="content">
              <p>Dear Dr. ${doctorName},</p>
              
              <p>Thank you for submitting your application to join MyEdoctor.</p>
              
              <div class="alert">
                <strong>Application Status: Under Review</strong>
                <p>We have reviewed your credentials and unfortunately cannot approve your application at this time.</p>
              </div>
              
              ${reason ? `<p><strong>Reason:</strong></p><p>${reason}</p>` : ''}
              
              <p>We appreciate your interest in joining our platform. If you believe this is an error or would like to resubmit with additional information, please contact our support team.</p>
              
              <p>Best regards,<br/><strong>MyEdoctor Team</strong></p>
            </div>
            <div class="footer">
              <p>&copy; 2026 MyEdoctor. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    return this.sendEmail({
      to: doctorEmail,
      subject: 'MyEdoctor Application Status Update',
      htmlContent,
      textContent: `Dear Dr. ${doctorName},\n\nThank you for your application. Unfortunately, we cannot approve it at this time.\n\n${reason ? `Reason: ${reason}\n\n` : ''}Please contact support for more information.\n\nBest regards,\nMyEdoctor Team`,
    });
  }
}

export const emailService = new EmailService();
