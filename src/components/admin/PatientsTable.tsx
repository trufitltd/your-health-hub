import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Star, Trash2 } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useState } from 'react';
import { normalizeAppointmentStatus } from '@/services/marketplaceTypes';

interface PatientWithStats {
  id: string;
  full_name: string;
  email: string;
  phone_number: string;
  age?: number | null;
  gender?: string | null;
  city?: string | null;
  state?: string | null;
  profile_picture_url: string | null;
  total_appointments: number;
  completed_appointments: number;
  pending_appointments: number;
  average_rating: number | null;
  registration_complete: boolean;
}

const isIncompletePatient = (p: { post_auth_prompt_completed?: boolean | null }) =>
  p.post_auth_prompt_completed !== true;

export function PatientsTable({
  filter = 'all',
  searchTerm = '',
  onViewAppointments,
}: {
  filter?: 'all' | 'complete' | 'incomplete';
  searchTerm?: string;
  onViewAppointments?: (patient: { id: string; full_name: string }) => void;
}) {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [deletePatientId, setDeletePatientId] = useState<string | null>(null);

  const deletePatient = useMutation({
    mutationFn: async (patientId: string) => {
      const { data, error } = await supabase.rpc('admin_delete_user', {
        user_id_to_delete: patientId,
      });
      if (error) throw error;
      if (data && !data.success) throw new Error(data.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-patients'] });
      toast({ title: 'Success', description: 'Patient removed from platform' });
      setDeletePatientId(null);
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to remove patient', variant: 'destructive' });
    },
  });

  const { data: patients = [], isLoading } = useQuery({
    queryKey: ['admin-patients'],
    queryFn: async () => {
      const { data: patientData, error } = await supabase
        .from('patient_registrations')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const patientsWithStats = await Promise.all(
        (patientData || []).map(async (patient) => {
          const complete = !isIncompletePatient(patient);

          const { data: appointments, error: aptError } = await supabase
            .from('appointments')
            .select('status, rating')
            .eq('patient_id', patient.user_id);

          if (aptError) {
            console.error(`Error fetching appointments for ${patient.full_name}:`, aptError);
          }

          const normalizedAppointments = (appointments || []).map((a) => ({
            ...a,
            status: normalizeAppointmentStatus(a.status),
          }));
          const total = appointments?.length || 0;
          const completed = normalizedAppointments.filter((a) => a.status === 'completed').length;
          const pending = normalizedAppointments.filter((a) =>
            ['pending_payment', 'pending_approval', 'confirmed', 'in_progress'].includes(String(a.status || ''))
          ).length;
          const ratings = appointments?.filter((a) => a.rating && a.rating > 0).map((a) => a.rating!) || [];
          const avgRating = ratings.length > 0
            ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length
            : null;

          return {
            id: patient.user_id,
            full_name: patient.full_name,
            email: patient.email,
            phone_number: patient.phone_number,
            age: patient.age ?? null,
            gender: patient.gender ?? null,
            city: patient.city ?? null,
            state: patient.state ?? null,
            profile_picture_url: patient.profile_picture_url,
            total_appointments: total,
            completed_appointments: completed,
            pending_appointments: pending,
            average_rating: avgRating,
            registration_complete: complete,
          };
        })
      );

      return patientsWithStats as PatientWithStats[];
    },
    refetchInterval: 30000,
  });

  const normalizedSearch = String(searchTerm || '').trim().toLowerCase();

  const filteredPatients = patients.filter((p) => {
    if (filter === 'complete') return p.registration_complete;
    if (filter === 'incomplete') return !p.registration_complete;
    return true;
  }).filter((p) => {
    if (!normalizedSearch) return true;
    return [
      p.full_name,
      p.email,
      p.phone_number,
      p.city,
      p.state,
      p.gender,
    ]
      .map((value) => String(value || '').toLowerCase())
      .some((value) => value.includes(normalizedSearch));
  });

  if (isLoading) {
    return <div className="text-center py-8 text-muted-foreground">Loading patients...</div>;
  }

  if (filteredPatients.length === 0) {
    return <div className="text-center py-8 text-muted-foreground">{filter === 'complete' ? 'No complete patient registrations.' : filter === 'incomplete' ? 'No incomplete patient registrations.' : 'No patients registered yet'}</div>;
  }

  return (
    <>
      <div className="space-y-4">
        {filteredPatients.map((patient) => (
          <div
            key={patient.id}
            className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border transition-all ${
              patient.registration_complete
                ? 'border-border hover:shadow-md'
                : 'border-destructive/30 bg-destructive/5'
            }`}
          >
            <div className="flex items-center gap-4 mb-3 sm:mb-0">
              <Avatar className="w-12 h-12">
                {patient.profile_picture_url && (
                  <img src={patient.profile_picture_url} alt={patient.full_name} className="w-full h-full object-cover" />
                )}
                <AvatarFallback className="bg-primary/10 text-primary">
                  {patient.full_name?.split(' ').map((n) => n[0]).join('') || 'P'}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold">{patient.full_name}</p>
                  {!patient.registration_complete && (
                    <Badge className="bg-destructive/10 text-destructive border-destructive/20 text-[10px]">
                      Incomplete Registration
                    </Badge>
                  )}
                </div>
                {patient.email && <p className="text-sm text-muted-foreground">{patient.email}</p>}
                {patient.phone_number && patient.phone_number !== 'N/A' && (
                  <p className="text-xs text-muted-foreground">{patient.phone_number}</p>
                )}
                {patient.registration_complete && (
                  <>
                    <p className="text-xs text-muted-foreground">Age: {patient.age ?? 'N/A'}</p>
                    <p className="text-xs text-muted-foreground">Sex: {patient.gender || 'N/A'}</p>
                    <p className="text-xs text-muted-foreground">Location: {patient.city || 'N/A'}, {patient.state || 'N/A'}</p>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              {patient.registration_complete && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
                        <p className="text-sm text-muted-foreground">{t('specialists.defaults.notAvailable', 'N/A')}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => onViewAppointments?.({ id: patient.id, full_name: patient.full_name })}
              >
                View Appointments
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => setDeletePatientId(patient.id)}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <AlertDialog open={!!deletePatientId} onOpenChange={(open) => !open && setDeletePatientId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Patient</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this patient from the platform? This will delete their account and all associated data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletePatientId && deletePatient.mutate(deletePatientId)}
              className="bg-destructive hover:bg-destructive/90"
            >
              Remove Patient
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
