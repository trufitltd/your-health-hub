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

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !user?.id) {
        throw new Error('You must be signed in to upload investigations.');
      }

      const ownerId = user.id;
      const fileExt = file.name.split('.').pop() || 'bin';
      const uniqueId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const fileName = `${Date.now()}-${uniqueId}.${fileExt}`;
      const filePath = `${ownerId}/health-records/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('patient-files')
        .upload(filePath, file, {
          cacheControl: '3600',
          contentType: file.type || undefined,
          upsert: false,
        });

      if (uploadError) {
        const message = [uploadError.message, (uploadError as any).details, (uploadError as any).hint]
          .filter(Boolean)
          .join(' | ');
        throw new Error(message || 'Failed to upload file to storage.');
      }

      const { data: urlData } = supabase.storage
        .from('patient-files')
        .getPublicUrl(filePath);

      const { error: dbError } = await supabase
        .from('health_records')
        .insert({
          patient_id: ownerId,
          file_name: file.name,
          file_url: urlData.publicUrl,
          file_type: file.type,
          file_size: file.size,
          notes: notes || null,
        });

      if (dbError) {
        const message = [dbError.message, (dbError as any).details, (dbError as any).hint]
          .filter(Boolean)
          .join(' | ');
        throw new Error(message || 'File uploaded but failed to save record.');
      }
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
