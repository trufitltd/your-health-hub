import { useQuery } from '@tanstack/react-query';
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
 * Fetch all doctors
 */
export const useDoctors = () => {
  return useQuery({
    queryKey: ['doctors'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('doctors')
        .select('*')
        .order('name');
      
      if (error) throw error;
      return data as Doctor[];
    },
  });
};

/**
 * Fetch available slots for a given date range or doctor
 * If no doctorId is provided, returns slots for all doctors
 */
export const useAvailableSlots = (doctorId?: string, daysAhead: number = 7) => {
  return useQuery({
    queryKey: ['available-slots', doctorId, daysAhead],
    queryFn: async () => {
      let query = supabase.from('available_slots').select('*');
      
      if (doctorId) {
        query = query.eq('doctor_id', doctorId);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      
      // Filter to only show slots for dates within daysAhead
      const today = new Date();
      const slots: AvailableSlot[] = data || [];
      
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
  });
};

/**
 * Generate a list of dates that fall on a specific day of week (0-6)
 * within the next N days
 */
export function generateDatesForDayOfWeek(dayOfWeek: number, daysAhead: number): Date[] {
  const dates: Date[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  for (let i = 0; i < daysAhead; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    if (date.getDay() === dayOfWeek) {
      dates.push(date);
    }
  }
  
  return dates;
}

/**
 * Get the next date that falls on a specific day of week
 */
export function getNextDateForDayOfWeek(dayOfWeek: number): Date {
  const today = new Date();
  const daysUntilTarget = (dayOfWeek - today.getDay() + 7) % 7;
  const nextDate = new Date(today);
  nextDate.setDate(nextDate.getDate() + (daysUntilTarget === 0 ? 7 : daysUntilTarget));
  nextDate.setHours(0, 0, 0, 0);
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
  // Query for existing appointments at this time
  const { data, error } = await supabase
    .from('appointments')
    .select('id')
    .eq('doctor_id', doctorId)
    .eq('date', date)
    .eq('time', time)
    .neq('status', 'cancelled');
  
  if (error) throw error;
  return (data?.length ?? 0) === 0; // Available if no conflicts
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
