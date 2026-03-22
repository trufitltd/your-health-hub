import { supabase } from '@/integrations/supabase/client';

export interface DoctorSchedule {
  id: string;
  doctor_id: string;
  day_of_week: number; // 0 = Sunday, 6 = Saturday
  start_time: string; // HH:MM format
  end_time: string; // HH:MM format
  slot_duration_minutes: number;
  max_patients_per_slot: number;
  is_available: boolean;
  created_at: string;
  updated_at?: string;
}

export interface ScheduleInput {
  day_of_week: number;
  start_time: string;
  end_time: string;
  slot_duration_minutes?: number;
  max_patients_per_slot?: number;
  is_available?: boolean;
  id?: string;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DEFAULT_SCHEDULE_START = '09:00';
const DEFAULT_SCHEDULE_END = '23:00';
const DEFAULT_SCHEDULE_DAYS = [1, 2, 3, 4, 5, 6]; // Monday-Saturday

/**
 * Get all schedules for a doctor
 */
export const getDoctorSchedules = async (doctorId: string): Promise<DoctorSchedule[]> => {
  try {
    const { data, error } = await supabase
      .from('doctor_schedules')
      .select('*')
      .eq('doctor_id', doctorId)
      .order('day_of_week');

    if (error) {
      console.error('Error fetching doctor schedules:', error);
      throw error;
    }

    return (data || []) as DoctorSchedule[];
  } catch (err) {
    console.error('Failed to fetch doctor schedules:', err);
    throw err;
  }
};

/**
 * Get schedules for the current authenticated doctor
 */
export const getMySchedules = async (doctorId: string): Promise<DoctorSchedule[]> => {
  return getDoctorSchedules(doctorId);
};

/**
 * Create or update a schedule for a specific day
 */
export const upsertSchedule = async (
  doctorId: string,
  schedule: ScheduleInput
): Promise<DoctorSchedule> => {
  try {
    // If an id is provided, update that specific slot
    if (schedule.id) {
      const { data, error } = await supabase
        .from('doctor_schedules')
        .update({
          start_time: schedule.start_time,
          end_time: schedule.end_time,
          slot_duration_minutes: schedule.slot_duration_minutes || 15,
          max_patients_per_slot: schedule.max_patients_per_slot || 1,
          is_available: schedule.is_available !== false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', schedule.id)
        .select()
        .single();

      if (error) throw error;
      return data as DoctorSchedule;
    }

    // Otherwise insert a new slot for the given day
    const { data, error } = await supabase
      .from('doctor_schedules')
      .insert({
        doctor_id: doctorId,
        day_of_week: schedule.day_of_week,
        start_time: schedule.start_time,
        end_time: schedule.end_time,
        slot_duration_minutes: schedule.slot_duration_minutes || 15,
        max_patients_per_slot: schedule.max_patients_per_slot || 1,
        is_available: schedule.is_available !== false,
      })
      .select()
      .single();

    if (error) throw error;
    return data as DoctorSchedule;
  } catch (err) {
    console.error('Error upserting schedule:', err);
    throw err;
  }
};

/**
 * Delete a schedule for a specific day
 */
export const deleteSchedule = async (doctorId: string, scheduleId: string): Promise<void> => {
  try {
    const { error } = await supabase
      .from('doctor_schedules')
      .delete()
      .eq('doctor_id', doctorId)
      .eq('id', scheduleId);

    if (error) throw error;
  } catch (err) {
    console.error('Error deleting schedule:', err);
    throw err;
  }
};

/**
 * Toggle availability for a specific day
 */
export const toggleDayAvailability = async (
  doctorId: string,
  dayOfWeek: number,
  isAvailable: boolean
): Promise<DoctorSchedule | null> => {
  try {
    console.log(`[toggleDayAvailability] doctorId=${doctorId}, dayOfWeek=${dayOfWeek}, isAvailable=${isAvailable}`);
    
    // Fetch any schedules for this day
    const { data: existingSchedules, error: fetchError } = await supabase
      .from('doctor_schedules')
      .select('*')
      .eq('doctor_id', doctorId)
      .eq('day_of_week', dayOfWeek);

    if (fetchError) {
      console.error('Error fetching existing schedules:', fetchError);
      // proceed to create default if needed
    }

    if (!existingSchedules || existingSchedules.length === 0) {
      // Create a default single slot for the day
      const created = await upsertSchedule(doctorId, {
        day_of_week: dayOfWeek,
        start_time: DEFAULT_SCHEDULE_START,
        end_time: DEFAULT_SCHEDULE_END,
        is_available: isAvailable,
      });
      return created || null;
    }

    // Update all schedules for that day to set availability
    const { data, error } = await supabase
      .from('doctor_schedules')
      .update({
        is_available: isAvailable,
        updated_at: new Date().toISOString(),
      })
      .eq('doctor_id', doctorId)
      .eq('day_of_week', dayOfWeek)
      .select();

    if (error) {
      console.error('Error updating schedules:', error);
      throw new Error(`Failed to update schedules: ${error.message}`);
    }

    return (data && data[0]) as DoctorSchedule | null;
  } catch (err) {
    console.error('Error in toggleDayAvailability:', err);
    throw err;
  }
};

/**
 * Get formatted schedule for display
 * Returns data structured by day with human-readable time
 */
export const getFormattedSchedule = async (doctorId: string) => {
  try {
    const schedules = await getDoctorSchedules(doctorId);

    const weeklySchedule = DAY_NAMES.map((dayName, dayIndex) => {
      const daySchedules = schedules.filter((s) => s.day_of_week === dayIndex);

      return {
        day: dayName,
        dayOfWeek: dayIndex,
        enabled: daySchedules.length > 0 && daySchedules.some((s) => s.is_available),
        slots: daySchedules
          .filter((s) => s.is_available)
          .map((s) => `${s.start_time} - ${s.end_time}`)
          .sort(),
        schedules: daySchedules,
      };
    });

    return weeklySchedule;
  } catch (err) {
    console.error('Error formatting schedule:', err);
    throw err;
  }
};

/**
 * Create default schedule for new doctor (all days, 9 AM - 11 PM)
 */
export const createDefaultSchedule = async (doctorId: string): Promise<DoctorSchedule[]> => {
  try {
    const defaultSchedules = DEFAULT_SCHEDULE_DAYS.map((dayOfWeek) => ({
      day_of_week: dayOfWeek,
      start_time: DEFAULT_SCHEDULE_START,
      end_time: DEFAULT_SCHEDULE_END,
    }));

    // Direct insert without checking for existing schedules
    const scheduleData = defaultSchedules.map(schedule => ({
      doctor_id: doctorId,
      day_of_week: schedule.day_of_week,
      start_time: schedule.start_time,
      end_time: schedule.end_time,
      slot_duration_minutes: 15,
      max_patients_per_slot: 1,
      is_available: true,
    }));

    const { data, error } = await supabase
      .from('doctor_schedules')
      .upsert(scheduleData, {
        onConflict: 'doctor_id,day_of_week,start_time,end_time',
        ignoreDuplicates: true,
      })
      .select();

    if (error) {
      // Existing rows can return conflict-like responses in some PostgREST paths; treat as idempotent success.
      const isConflict =
        error.code === '23505'
        || (error as any).status === 409
        || String(error.message || '').toLowerCase().includes('conflict')
        || String(error.message || '').toLowerCase().includes('duplicate key');
      if (isConflict) {
        return [];
      }
      console.error('Error creating default schedule:', error);
      // Don't throw error, just log it - schedule can be created later
      return [];
    }

    // If defaults exist, make doctor discoverable for booking.
    const hasDefaults = (data || []).length > 0;
    if (hasDefaults) {
      const { error: activateError } = await supabase
        .from('doctors')
        .update({ is_active: true })
        .eq('id', doctorId);
      if (activateError) {
        console.warn('Failed to auto-activate doctor after default schedule seed:', activateError);
      }
    }

    return (data || []) as DoctorSchedule[];
  } catch (err) {
    console.error('Error creating default schedule:', err);
    // Don't throw error, just return empty array
    return [];
  }
};

/**
 * Subscribe to schedule changes for a doctor
 */
export const subscribeToScheduleChanges = (
  doctorId: string,
  callback: (schedules: DoctorSchedule[]) => void
) => {
  const subscription = supabase
    .channel(`doctor_schedules:${doctorId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'doctor_schedules',
        filter: `doctor_id=eq.${doctorId}`,
      },
      () => {
        // Refetch all schedules when changes occur
        getDoctorSchedules(doctorId)
          .then(callback)
          .catch((err) => console.error('Error in schedule subscription callback:', err));
      }
    )
    .subscribe();

  return subscription;
};
