import { supabase } from '@/integrations/supabase/client';

export interface RequestAppointmentRescheduleInput {
  appointmentId: string;
  proposedDate: string;
  proposedTime: string;
  proposedDurationMinutes?: number | null;
  proposedFinalPrice?: number | null;
  proposedConsultationType?: 'chat' | 'voice' | 'video' | null;
  requestNote?: string | null;
}

export interface RespondAppointmentRescheduleInput {
  appointmentId: string;
  action: 'approve' | 'decline';
  responseNote?: string | null;
}

export const AppointmentRescheduleService = {
  async requestReschedule(input: RequestAppointmentRescheduleInput) {
    const normalizeTime = (value: string) => {
      const trimmed = String(value || '').trim();
      if (/^\d{2}:\d{2}$/.test(trimmed)) return trimmed;
      if (/^\d{2}:\d{2}:\d{2}$/.test(trimmed)) return trimmed.slice(0, 5);
      return trimmed;
    };

    const proposedFinalPrice =
      typeof input.proposedFinalPrice === 'number' && Number.isFinite(input.proposedFinalPrice)
        ? input.proposedFinalPrice
        : null;

    const { data, error } = await supabase.rpc('request_appointment_reschedule', {
      p_appointment_id: input.appointmentId,
      p_proposed_date: input.proposedDate,
      p_proposed_time: normalizeTime(input.proposedTime),
      p_proposed_duration_minutes: input.proposedDurationMinutes ?? null,
      p_proposed_final_price: proposedFinalPrice,
      p_proposed_consultation_type: input.proposedConsultationType ?? null,
      p_request_note: input.requestNote ?? null,
    });

    if (error) throw error;
    return data as {
      appointment_id: string;
      reschedule_request_status: 'pending';
      requested_by: 'patient' | 'doctor';
      proposed_date: string;
      proposed_time: string;
      proposed_duration_minutes: number;
      proposed_final_price: number;
      upgrade_amount: number;
    };
  },

  async respondToReschedule(input: RespondAppointmentRescheduleInput) {
    const { data, error } = await supabase.rpc('respond_appointment_reschedule', {
      p_appointment_id: input.appointmentId,
      p_action: input.action,
      p_response_note: input.responseNote ?? null,
    });

    if (error) throw error;
    return data as {
      appointment_id: string;
      action: 'approve' | 'decline';
      reschedule_request_status: 'approved' | 'declined';
      status: string;
      charged_upgrade_amount: number;
    };
  },
};
