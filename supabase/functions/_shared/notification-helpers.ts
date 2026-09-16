import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface NotificationContext {
  organisationId: string;
  appointmentId: string;
  patientId: string;
  patientName?: string;
  patientPhone?: string;
  doctorName?: string;
  serviceName?: string;
  appointmentDate?: string;
  appointmentTime?: string;
}

/**
 * Send patient notification when a clinician has been assigned.
 * Uses the existing organisation-aware send-sms and send-push edge functions.
 */
export async function notifyPatientAssigned(
  supabase: SupabaseClient,
  ctx: NotificationContext,
): Promise<void> {
  const { organisationId, appointmentId, patientId, patientName, patientPhone, doctorName, serviceName, appointmentDate, appointmentTime } = ctx;

  // Load org brand config
  const { data: orgConfig } = await supabase
    .from('organisation_config')
    .select('config_key, config_value')
    .eq('organisation_id', organisationId)
    .in('config_key', ['brand_name', 'sms_signature', 'vapid_subject']);

  const configMap = new Map<string, string>();
  (orgConfig || []).forEach((row: any) => configMap.set(row.config_key, row.config_value));

  const brandName = configMap.get('brand_name') || 'MyE-Doctor';

  // Send push notification
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    await fetch(`${supabaseUrl}/functions/v1/send-push`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id: patientId,
        title: `${brandName} - Clinician Assigned`,
        body: `Dr. ${doctorName || 'Your clinician'} has been assigned to your ${serviceName || 'consultation'} appointment on ${appointmentDate || ''} at ${appointmentTime || ''}.`,
        url: `/consultation/${appointmentId}`,
        organisationId,
      }),
    });
  } catch (pushError) {
    console.warn('[notifyPatientAssigned] Push notification failed:', pushError);
  }

  // Send SMS if phone number available
  if (patientPhone) {
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

      await fetch(`${supabaseUrl}/functions/v1/send-sms`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${anonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phoneNumber: patientPhone,
          fullName: patientName || 'Patient',
          messageType: 'appointment_confirmation',
          organisationId,
          appointmentDetails: {
            doctorName: doctorName || 'Your clinician',
            date: appointmentDate,
            time: appointmentTime,
            serviceType: serviceName,
          },
          message: `Dr. ${doctorName || 'Your clinician'} has been assigned to your ${serviceName || 'consultation'} appointment on ${appointmentDate || ''} at ${appointmentTime || ''}.`,
        }),
      });
    } catch (smsError) {
      console.warn('[notifyPatientAssigned] SMS notification failed:', smsError);
    }
  }
}

/**
 * Send notification to organisation admins when automatic assignment fails.
 */
export async function notifyAdminAssignmentFailed(
  supabase: SupabaseClient,
  ctx: NotificationContext & { failureReason: string },
): Promise<void> {
  const { organisationId, appointmentId, patientName, serviceName, appointmentDate, appointmentTime, failureReason } = ctx;

  // Load org admins
  const { data: admins } = await supabase
    .from('organisation_members')
    .select('user_id')
    .eq('organisation_id', organisationId)
    .eq('role', 'org_admin')
    .eq('active', true);

  if (!admins || admins.length === 0) return;

  // Load org brand config
  const { data: orgConfig } = await supabase
    .from('organisation_config')
    .select('config_key, config_value')
    .eq('organisation_id', organisationId)
    .in('config_key', ['brand_name']);

  const configMap = new Map<string, string>();
  (orgConfig || []).forEach((row: any) => configMap.set(row.config_key, row.config_value));
  const brandName = configMap.get('brand_name') || 'MyE-Doctor';

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  // Send push notification to each admin
  for (const admin of admins) {
    try {
      await fetch(`${supabaseUrl}/functions/v1/send-push`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${anonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: admin.user_id,
          title: `${brandName} - Assignment Failed`,
          body: `Automatic clinician assignment failed for ${patientName || 'a patient'}'s ${serviceName || 'consultation'} on ${appointmentDate || ''} at ${appointmentTime || ''}. Reason: ${failureReason}. Manual assignment required.`,
          url: `/admin`,
          organisationId,
        }),
      });
    } catch (pushError) {
      console.warn('[notifyAdminAssignmentFailed] Push notification to admin failed:', pushError);
    }
  }
}
