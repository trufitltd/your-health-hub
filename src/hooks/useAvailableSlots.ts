import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  isSlotBlockedByAppointments,
  normalizeDurationMinutes,
  type AppointmentIntervalRow,
} from '@/lib/appointmentIntervals';

export interface Doctor {
  id: string;
  name: string;
  specialty: string;
  email?: string;
  phone?: string;
  bio?: string;
  avatar_url?: string;
}

export interface AvailableSlot {
  schedule_id: string;
  doctor_id: string;
  doctor_name: string;
  specialty: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  slot_duration_minutes: number;
  max_patients_per_slot: number;
  booked_count: number;
  available_slots: number;
}

type AppointmentSlotRow = {
  id: string;
} & AppointmentIntervalRow;

/**
 * Fetch all active doctors
 */
export const useDoctors = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    // Subscribe to doctors table changes
    const subscription = supabase
      .channel('doctors-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'doctors' },
        () => {
          // Invalidate doctors cache when any doctor changes
          queryClient.invalidateQueries({ queryKey: ['doctors'] });
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [queryClient]);

  return useQuery({
    queryKey: ['doctors'],
    queryFn: async () => {
      // Approved registrations are the source-of-truth for discovery eligibility.
      const { data: registrations, error: regsError } = await supabase
        .from('doctor_registrations')
        .select('user_id, full_name, specialty, email, phone_number, bio, profile_picture_url')
        .eq('verification_status', 'approved');

      if (regsError) {
        console.error('Error fetching doctor registrations:', regsError);
        throw regsError;
      }

      const approvedRows = (registrations || []) as Array<{
        user_id: string;
        full_name?: string | null;
        specialty?: string | null;
        email?: string | null;
        phone_number?: string | null;
        bio?: string | null;
        profile_picture_url?: string | null;
      }>;

      const approvedIds = approvedRows.map((row) => row.user_id).filter(Boolean);
      if (approvedIds.length === 0) return [];

      const { data: availableSchedules, error: schedulesError } = await supabase
        .from('doctor_schedules')
        .select('doctor_id')
        .in('doctor_id', approvedIds)
        .eq('is_available', true);

      if (schedulesError) {
        console.error('Error fetching doctor schedules:', schedulesError);
        throw schedulesError;
      }

      const availableDoctorIds = new Set((availableSchedules || []).map((row: any) => row.doctor_id));
      const availableApprovedRows = approvedRows.filter((row) => availableDoctorIds.has(row.user_id));
      if (availableApprovedRows.length === 0) return [];

      // Enrich from public.doctors when present; fallback to registration fields.
      const { data: doctors } = await supabase
        .from('doctors')
        .select('id, name, specialty, email, phone, bio, avatar_url')
        .in('id', availableApprovedRows.map((row) => row.user_id));

      const doctorsById = new Map((doctors || []).map((doc: any) => [doc.id as string, doc]));

      return availableApprovedRows
        .map((row) => {
          const synced = doctorsById.get(row.user_id);
          return {
            id: row.user_id,
            name: (synced?.name as string | undefined) || row.full_name || 'Doctor',
            specialty: (synced?.specialty as string | undefined) || row.specialty || 'General Practice',
            email: (synced?.email as string | undefined) || row.email || undefined,
            phone: (synced?.phone as string | undefined) || row.phone_number || undefined,
            bio: (synced?.bio as string | undefined) || row.bio || undefined,
            avatar_url: (synced?.avatar_url as string | undefined) || row.profile_picture_url || undefined,
          } as Doctor;
        })
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  });
};

/**
 * Fetch available slots for a given date range or doctor
 * If no doctorId is provided, returns slots for all doctors
 * Automatically syncs with real-time changes to schedules
 */
export const useAvailableSlots = (doctorId?: string, daysAhead: number = 7) => {
  const queryClient = useQueryClient();

  // Subscribe to real-time changes to doctor_schedules
  useEffect(() => {
    const subscription = supabase
      .channel(`schedules-${doctorId || 'all'}`)
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'doctor_schedules'
        },
        (payload) => {
          // Invalidate the available-slots cache when schedules change
          queryClient.invalidateQueries({ 
            queryKey: ['available-slots', doctorId, daysAhead] 
          });
          console.log('Schedule changed, invalidating cache:', payload);
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [queryClient, doctorId, daysAhead]);

  return useQuery({
    queryKey: ['available-slots', doctorId, daysAhead],
    queryFn: async () => {
      let query = supabase.from('available_slots').select('*');
      
      if (doctorId) {
        query = query.eq('doctor_id', doctorId);
      }
      
      const { data, error } = await query;
      
      if (error) {
        console.error('Error fetching available slots:', error);
        throw error;
      }
      
      console.log('Raw slots data:', data); // Debug log
      
      // Filter to only show slots for dates within daysAhead
      const today = new Date();
      let slots: AvailableSlot[] = data || [];

      // Fallback path: if the view returns nothing (often due stale doctors.is_active),
      // build slots directly from available schedules.
      if (slots.length === 0) {
        let schedulesQuery = supabase
          .from('doctor_schedules')
          .select('id, doctor_id, day_of_week, start_time, end_time, slot_duration_minutes, max_patients_per_slot')
          .eq('is_available', true);

        if (doctorId) {
          schedulesQuery = schedulesQuery.eq('doctor_id', doctorId);
        }

        const { data: fallbackSchedules, error: fallbackError } = await schedulesQuery;
        if (!fallbackError && fallbackSchedules) {
          const doctorIds = Array.from(
            new Set(
              (fallbackSchedules as Array<{ doctor_id?: string | null }>)
                .map((row) => row.doctor_id || '')
                .filter(Boolean),
            ),
          ) as string[];

          const { data: doctorRows } = await supabase
            .from('doctors')
            .select('id, name, specialty')
            .in('id', doctorIds);

          const { data: registrationRows } = await supabase
            .from('doctor_registrations')
            .select('user_id, full_name, specialty')
            .in('user_id', doctorIds)
            .eq('verification_status', 'approved');

          const doctorsById = new Map((doctorRows || []).map((row: any) => [row.id as string, row]));
          const regsById = new Map((registrationRows || []).map((row: any) => [row.user_id as string, row]));

          slots = fallbackSchedules
            .filter((row: any) => {
              const docId = String(row.doctor_id || '');
              return docId && (doctorsById.has(docId) || regsById.has(docId));
            })
            .map((row: any) => ({
              schedule_id: row.id,
              doctor_id: row.doctor_id,
              doctor_name:
                doctorsById.get(row.doctor_id)?.name
                || regsById.get(row.doctor_id)?.full_name
                || 'Doctor',
              specialty:
                doctorsById.get(row.doctor_id)?.specialty
                || regsById.get(row.doctor_id)?.specialty
                || 'General Practice',
              day_of_week: Number(row.day_of_week),
              start_time: String(row.start_time || '').slice(0, 5),
              end_time: String(row.end_time || '').slice(0, 5),
              slot_duration_minutes: Number(row.slot_duration_minutes || 30),
              max_patients_per_slot: Number(row.max_patients_per_slot || 1),
              booked_count: 0,
              available_slots: Number(row.max_patients_per_slot || 1),
            })) as AvailableSlot[];
        } else if (fallbackError) {
          console.error('Fallback schedule query failed:', fallbackError);
        }
      }
      
      console.log(`Fetched ${slots.length} available slots for doctor ${doctorId || 'all'}`);
      
      return slots.filter(slot => {
        // Generate dates for the day_of_week
        const dates = generateDatesForDayOfWeek(slot.day_of_week, daysAhead);
        return dates.length > 0;
      }).map(slot => ({
        ...slot,
        // Add a computed field for the next occurrence of this day
        nextOccurrence: getNextDateForDayOfWeek(slot.day_of_week),
      }));
    },
    refetchInterval: 30000, // Refetch every 30 seconds to catch schedule changes
    refetchOnWindowFocus: true, // Refetch when window regains focus
  });
};

/**
 * Generate a list of dates that fall on a specific day of week (0-6)
 * within the next N days
 */
export function generateDatesForDayOfWeek(dayOfWeek: number, daysAhead: number): Date[] {
  const dates: Date[] = [];
  const today = new Date();
  // Use UTC to avoid timezone-related day shifts
  const todayUTC = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  
  for (let i = 0; i < daysAhead; i++) {
    const date = new Date(todayUTC);
    date.setUTCDate(date.getUTCDate() + i);
    // getUTCDay() returns 0-6 where 0=Sunday, 6=Saturday (same as stored day_of_week)
    if (date.getUTCDay() === dayOfWeek) {
      dates.push(date);
    }
  }
  
  return dates;
}

/**
 * Get the next date that falls on a specific day of week (UTC-safe)
 */
export function getNextDateForDayOfWeek(dayOfWeek: number): Date {
  const today = new Date();
  // Use UTC to avoid timezone-related day shifts
  const todayUTC = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  
  const currentDay = todayUTC.getUTCDay();
  let daysUntilTarget = (dayOfWeek - currentDay + 7) % 7;
  
  // If it's today, return today; otherwise get the next occurrence
  if (daysUntilTarget === 0) {
    daysUntilTarget = 0; // Today is the target day
  }
  
  const nextDate = new Date(todayUTC);
  nextDate.setUTCDate(nextDate.getUTCDate() + daysUntilTarget);
  
  return nextDate;
}

/**
 * Check if a specific time slot is available (no conflicts)
 */
export const checkSlotAvailability = async (
  doctorId: string,
  date: string, // YYYY-MM-DD format
  time: string,  // HH:MM format
  durationMinutes: number = 30,
  excludeAppointmentId?: string,
): Promise<boolean> => {
  try {
    // Query appointments for this date, then apply interval overlap logic.
    let query = supabase
      .from('appointments')
      .select('id,time,duration_minutes,status,slot_locked_until')
      .eq('doctor_id', doctorId)
      .eq('date', date);

    if (excludeAppointmentId) {
      query = query.neq('id', excludeAppointmentId);
    }

    const { data, error } = await query;
    
    if (error) throw error;

    const safeDuration = normalizeDurationMinutes(durationMinutes, 30);
    const hasConflict = isSlotBlockedByAppointments(
      time,
      safeDuration,
      (data || []) as AppointmentSlotRow[],
    );

    return !hasConflict;
  } catch (error) {
    console.error('Error checking slot availability:', error);
    // If there's an error, assume available to allow booking
    return true;
  }
};

/**
 * Generate time slots for a given schedule
 */
export function generateTimeSlots(
  startTime: string, // HH:MM format
  endTime: string,   // HH:MM format
  durationMinutes: number = 30
): string[] {
  const safeDurationMinutes = normalizeDurationMinutes(durationMinutes, 30);
  const slots: string[] = [];
  const [startHour, startMin] = startTime.split(':').map(Number);
  const [endHour, endMin] = endTime.split(':').map(Number);
  
  const current = new Date();
  current.setHours(startHour, startMin, 0, 0);
  
  const endDate = new Date();
  endDate.setHours(endHour, endMin, 0, 0);
  
  while ((current.getTime() + (safeDurationMinutes * 60000)) <= endDate.getTime()) {
    const hours = String(current.getHours()).padStart(2, '0');
    const minutes = String(current.getMinutes()).padStart(2, '0');
    slots.push(`${hours}:${minutes}`);
    current.setMinutes(current.getMinutes() + safeDurationMinutes);
  }
  
  return slots;
}
