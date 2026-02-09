import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Star } from 'lucide-react';

interface PatientWithStats {
  id: string;
  full_name: string;
  email: string;
  phone_number: string;
  profile_picture_url: string | null;
  total_appointments: number;
  completed_appointments: number;
  pending_appointments: number;
  average_rating: number | null;
}

export function PatientsTable() {
  const { data: patients = [], isLoading } = useQuery({
    queryKey: ['admin-patients'],
    queryFn: async () => {
      const { data: patientData, error } = await supabase
        .from('patient_registrations')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      console.log('All patient data:', patientData?.map(p => ({ name: p.full_name, user_id: p.user_id })));

      const patientsWithStats = await Promise.all(
        (patientData || []).map(async (patient) => {
          console.log(`Fetching appointments for patient ${patient.full_name} with user_id:`, patient.user_id);
          
          const { data: appointments, error: aptError } = await supabase
            .from('appointments')
            .select('status, rating, patient_id')
            .eq('patient_id', patient.user_id);

          if (aptError) {
            console.error(`Error fetching appointments for ${patient.full_name}:`, aptError);
          }

          console.log(`Patient ${patient.full_name} appointments:`, appointments);

          const total = appointments?.length || 0;
          const completed = appointments?.filter(a => a.status === 'completed').length || 0;
          const pending = appointments?.filter(a => a.status === 'pending' || a.status === 'confirmed' || a.status === 'requested').length || 0;
          const ratings = appointments?.filter(a => a.rating && a.rating > 0).map(a => a.rating!) || [];
          const avgRating = ratings.length > 0 
            ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length 
            : null;

          console.log(`Patient ${patient.full_name} stats:`, { total, completed, pending, ratings, avgRating });

          return {
            id: patient.user_id,
            full_name: patient.full_name,
            email: patient.email,
            phone_number: patient.phone_number,
            profile_picture_url: patient.profile_picture_url,
            total_appointments: total,
            completed_appointments: completed,
            pending_appointments: pending,
            average_rating: avgRating,
          };
        })
      );

      return patientsWithStats as PatientWithStats[];
    },
    refetchInterval: 30000,
  });

  if (isLoading) {
    return <div className="text-center py-8 text-muted-foreground">Loading patients...</div>;
  }

  if (patients.length === 0) {
    return <div className="text-center py-8 text-muted-foreground">No patients registered yet</div>;
  }

  return (
    <div className="space-y-4">
      {patients.map((patient) => (
        <div key={patient.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-border hover:shadow-md transition-all">
          <div className="flex items-center gap-4 mb-3 sm:mb-0">
            <Avatar className="w-12 h-12">
              {patient.profile_picture_url && (
                <img src={patient.profile_picture_url} alt={patient.full_name} className="w-full h-full object-cover" />
              )}
              <AvatarFallback className="bg-primary/10 text-primary">
                {patient.full_name?.split(' ').map(n => n[0]).join('') || 'P'}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold">{patient.full_name}</p>
              <p className="text-sm text-muted-foreground">{patient.email}</p>
              <p className="text-xs text-muted-foreground">{patient.phone_number}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full sm:w-auto">
            <div className="text-center p-2 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-lg font-bold">{patient.total_appointments}</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-success/10">
              <p className="text-xs text-muted-foreground">Completed</p>
              <p className="text-lg font-bold text-success">{patient.completed_appointments}</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-warning/10">
              <p className="text-xs text-muted-foreground">Pending</p>
              <p className="text-lg font-bold text-warning">{patient.pending_appointments}</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-accent/10">
              <p className="text-xs text-muted-foreground">Avg Rating</p>
              <div className="flex items-center justify-center gap-1">
                {patient.average_rating ? (
                  <>
                    <Star className="w-4 h-4 text-warning fill-warning" />
                    <p className="text-lg font-bold">{patient.average_rating.toFixed(1)}</p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">N/A</p>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
