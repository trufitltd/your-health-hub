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
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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
    // First, check if schedule exists for this day
    const { data: existing } = await supabase
      .from('doctor_schedules')
      .select('id')
      .eq('doctor_id', doctorId)
      .eq('day_of_week', schedule.day_of_week)
      .single();

    if (existing) {
      // Update existing schedule
      const { data, error } = await supabase
        .from('doctor_schedules')
        .update({
          start_time: schedule.start_time,
          end_time: schedule.end_time,
          slot_duration_minutes: schedule.slot_duration_minutes || 30,
          max_patients_per_slot: schedule.max_patients_per_slot || 1,
          is_available: schedule.is_available !== false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw error;
      return data as DoctorSchedule;
    } else {
      // Create new schedule
      const { data, error } = await supabase
        .from('doctor_schedules')
        .insert({
          doctor_id: doctorId,
          day_of_week: schedule.day_of_week,
          start_time: schedule.start_time,
          end_time: schedule.end_time,
          slot_duration_minutes: schedule.slot_duration_minutes || 30,
          max_patients_per_slot: schedule.max_patients_per_slot || 1,
          is_available: schedule.is_available !== false,
        })
        .select()
        .single();

      if (error) throw error;
      return data as DoctorSchedule;
    }
  } catch (err) {
    console.error('Error upserting schedule:', err);
    throw err;
  }
};

/**
 * Delete a schedule for a specific day
 */
export const deleteSchedule = async (doctorId: string, dayOfWeek: number): Promise<void> => {
  try {
    const { error } = await supabase
      .from('doctor_schedules')
      .delete()
      .eq('doctor_id', doctorId)
      .eq('day_of_week', dayOfWeek);

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
    
    // Get existing schedule
    const { data: existing, error: fetchError } = await supabase
      .from('doctor_schedules')
      .select('*')
      .eq('doctor_id', doctorId)
      .eq('day_of_week', dayOfWeek)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      // PGRST116 = no rows returned (which is fine)
      console.error('Error fetching existing schedule:', fetchError);
    }

    if (!existing) {
      console.log(`[toggleDayAvailability] No existing schedule for day ${dayOfWeek}, creating new one`);
      return await upsertSchedule(doctorId, {
        day_of_week: dayOfWeek,
        start_time: '09:00',
        end_time: '17:00',
        is_available: isAvailable,
      });
    }

    console.log(`[toggleDayAvailability] Existing schedule found:`, existing);

    // Update existing schedule
    const { data, error } = await supabase
      .from('doctor_schedules')
      .update({
        is_available: isAvailable,
        updated_at: new Date().toISOString(),
      })
      .eq('doctor_id', doctorId)
      .eq('day_of_week', dayOfWeek)
      .select()
      .single();

    if (error) {
      console.error('Error updating schedule:', error);
      throw new Error(`Failed to update schedule: ${error.message}`);
    }
    
    console.log(`[toggleDayAvailability] Success - day ${dayOfWeek} now ${isAvailable ? 'available' : 'unavailable'}:`, data);
    return (data as DoctorSchedule) || null;
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
 * Create default schedule for new doctor (Monday-Friday, 9 AM - 5 PM)
 */
export const createDefaultSchedule = async (doctorId: string): Promise<DoctorSchedule[]> => {
  try {
    const defaultSchedules = [
      { day_of_week: 1, start_time: '09:00', end_time: '17:00' }, // Monday
      { day_of_week: 2, start_time: '09:00', end_time: '17:00' }, // Tuesday
      { day_of_week: 3, start_time: '09:00', end_time: '17:00' }, // Wednesday
      { day_of_week: 4, start_time: '09:00', end_time: '17:00' }, // Thursday
      { day_of_week: 5, start_time: '09:00', end_time: '17:00' }, // Friday
    ];

    const createdSchedules = await Promise.all(
      defaultSchedules.map((schedule) =>
        upsertSchedule(doctorId, {
          day_of_week: schedule.day_of_week,
          start_time: schedule.start_time,
          end_time: schedule.end_time,
        })
      )
    );

    return createdSchedules;
  } catch (err) {
    console.error('Error creating default schedule:', err);
    throw err;
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
