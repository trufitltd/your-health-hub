import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

interface RecentConsultation {
  id: string;
  doctor_name: string;
  specialty: string;
  date: string;
  diagnosis: string;
  prescription: boolean;
  rating: number | null;
}

export function useRecentConsultations() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['recent-consultations', user?.id],
    queryFn: async (): Promise<RecentConsultation[]> => {
      if (!user?.id) return [];

      console.log('[Recent Consultations] Fetching for user:', user.id);

      // Fetch completed appointments
      const { data: appointments, error: aptError } = await supabase
        .from('appointments')
        .select('id, date, specialist_name, rating, doctor_id, notes')
        .eq('patient_id', user.id)
        .eq('status', 'completed')
        .order('date', { ascending: false })
        .limit(10);

      if (aptError) {
        console.error('[Recent Consultations] Error:', aptError);
        throw aptError;
      }

      if (!appointments || appointments.length === 0) return [];

      // Fetch consultation notes for these appointments
      const { data: notesData } = await supabase
        .from('doctor_consultation_notes')
        .select(`
          id,
          diagnosis,
          prescriptions,
          consultation_sessions!inner(appointment_id)
        `)
        .eq('patient_id', user.id)
        .in('consultation_sessions.appointment_id', appointments.map(a => a.id));

      // Create a map of appointment_id to notes
      const notesMap: Record<string, any> = {};
      (notesData || []).forEach((note: any) => {
        const aptId = note.consultation_sessions?.appointment_id;
        if (aptId) notesMap[aptId] = note;
      });

      // Fetch doctor specialties
      const doctorIds = [...new Set(appointments.map(a => a.doctor_id).filter(Boolean))];
      const doctorSpecialties: Record<string, string> = {};
      
      if (doctorIds.length > 0) {
        const { data: doctorData } = await supabase
          .from('doctor_registrations')
          .select('user_id, specialty')
          .in('user_id', doctorIds);
        
        if (doctorData) {
          doctorData.forEach((doc: any) => {
            doctorSpecialties[doc.user_id] = doc.specialty;
          });
        }
      }

      const result = appointments.map((apt: any) => {
        const notes = notesMap[apt.id];
        return {
          id: apt.id,
          doctor_name: apt.specialist_name,
          specialty: doctorSpecialties[apt.doctor_id] || 'General Medicine',
          date: apt.date,
          diagnosis: notes?.diagnosis || apt.notes || 'Consultation completed',
          prescription: !!notes?.prescriptions,
          rating: apt.rating || null,
        };
      });

      console.log('[Recent Consultations] Result:', result);
      return result;
    },
    enabled: !!user?.id,
  });
}