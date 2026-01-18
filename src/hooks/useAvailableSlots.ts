import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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
      const { data, error } = await supabase
        .from('doctors')
        .select('id, name, specialty, email, phone, bio, avatar_url')
        .eq('is_active', true)
        .order('name');
      
      if (error) {
        console.error('Error fetching doctors:', error);
        throw error;
      }
      return (data || []) as Doctor[];
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
      
      // Filter to only show slots for dates within daysAhead
      const today = new Date();
      const slots: AvailableSlot[] = data || [];
      
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
  time: string  // HH:MM format
): Promise<boolean> => {
  try {
    // Query for existing appointments at this time
    const { data, error } = await supabase
      .from('appointments')
      .select('id')
      .eq('doctor_id', doctorId)
      .eq('date', date)
      .eq('time', time)
      .not('status', 'in', '(cancelled)');
    
    if (error) throw error;
    return (data?.length ?? 0) === 0; // Available if no conflicts
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
  const slots: string[] = [];
  const [startHour, startMin] = startTime.split(':').map(Number);
  const [endHour, endMin] = endTime.split(':').map(Number);
  
  const current = new Date();
  current.setHours(startHour, startMin, 0, 0);
  
  const endDate = new Date();
  endDate.setHours(endHour, endMin, 0, 0);
  
  while (current < endDate) {
    const hours = String(current.getHours()).padStart(2, '0');
    const minutes = String(current.getMinutes()).padStart(2, '0');
    slots.push(`${hours}:${minutes}`);
    current.setMinutes(current.getMinutes() + durationMinutes);
  }
  
  return slots;
}
