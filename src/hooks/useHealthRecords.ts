import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface HealthRecord {
  id: string;
  patient_id: string;
  file_name: string;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
  uploaded_at: string;
  notes: string | null;
}

export const useHealthRecords = (patientId: string | undefined) => {
  const queryClient = useQueryClient();

  const { data: records = [], isLoading } = useQuery({
    queryKey: ['health-records', patientId],
    queryFn: async () => {
      if (!patientId) return [];

      const { data, error } = await supabase
        .from('health_records')
        .select('*')
        .eq('patient_id', patientId)
        .order('uploaded_at', { ascending: false });

      if (error) throw error;
      return data as HealthRecord[];
    },
    enabled: !!patientId,
  });

  const uploadRecord = useMutation({
    mutationFn: async ({ file, notes }: { file: File; notes?: string }) => {
      if (!patientId) throw new Error('Patient ID required');

      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `${patientId}/health-records/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('patient-files')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('patient-files')
        .getPublicUrl(filePath);

      const { error: dbError } = await supabase
        .from('health_records')
        .insert({
          patient_id: patientId,
          file_name: file.name,
          file_url: urlData.publicUrl,
          file_type: file.type,
          file_size: file.size,
          notes: notes || null,
        });

      if (dbError) throw dbError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['health-records', patientId] });
    },
  });

  const deleteRecord = useMutation({
    mutationFn: async (recordId: string) => {
      const { error } = await supabase
        .from('health_records')
        .delete()
        .eq('id', recordId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['health-records', patientId] });
    },
  });

  return {
    records,
    isLoading,
    uploadRecord,
    deleteRecord,
  };
};
