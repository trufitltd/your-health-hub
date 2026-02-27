import { supabase } from '@/integrations/supabase/client';

export interface DoctorConsultationFolderNote {
  id: string;
  created_at: string;
  doctor_id: string | null;
  diagnosis: string | null;
  diagnosis_translations: Record<string, string> | null;
  treatment_plan: string | null;
  treatment_plan_translations: Record<string, string> | null;
  prescriptions: string | null;
  prescriptions_translations: Record<string, string> | null;
  follow_up_notes: string | null;
  follow_up_notes_translations: Record<string, string> | null;
}

interface FetchDoctorConsultationNotesResult {
  data: DoctorConsultationFolderNote[];
  error: unknown | null;
  missingTranslationColumns: boolean;
}

const NOTES_SELECT_WITH_TRANSLATIONS =
  'id, created_at, doctor_id, diagnosis, diagnosis_translations, treatment_plan, treatment_plan_translations, prescriptions, prescriptions_translations, follow_up_notes, follow_up_notes_translations';

const NOTES_SELECT_LEGACY =
  'id, created_at, doctor_id, diagnosis, treatment_plan, prescriptions, follow_up_notes';

const isMissingTranslationColumnsError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;

  const errorCode = (error as { code?: unknown }).code;
  const message = (error as { message?: unknown }).message;
  const normalizedMessage = typeof message === 'string' ? message.toLowerCase() : '';

  return (
    (
      errorCode === '42703' &&
      normalizedMessage.includes('doctor_consultation_notes') &&
      normalizedMessage.includes('_translations') &&
      normalizedMessage.includes('does not exist')
    ) ||
    (
      errorCode === 'PGRST204' &&
      normalizedMessage.includes('doctor_consultation_notes') &&
      normalizedMessage.includes('_translations') &&
      normalizedMessage.includes('schema cache')
    )
  );
};

const normalizeLegacyNotes = (notes: unknown[] | null): DoctorConsultationFolderNote[] =>
  (notes ?? []).map((note) => {
    const row = note as Record<string, unknown>;
    return {
      id: typeof row.id === 'string' ? row.id : '',
      created_at: typeof row.created_at === 'string' ? row.created_at : '',
      doctor_id: typeof row.doctor_id === 'string' ? row.doctor_id : null,
      diagnosis: typeof row.diagnosis === 'string' ? row.diagnosis : null,
      diagnosis_translations: null,
      treatment_plan: typeof row.treatment_plan === 'string' ? row.treatment_plan : null,
      treatment_plan_translations: null,
      prescriptions: typeof row.prescriptions === 'string' ? row.prescriptions : null,
      prescriptions_translations: null,
      follow_up_notes: typeof row.follow_up_notes === 'string' ? row.follow_up_notes : null,
      follow_up_notes_translations: null,
    };
  });

const normalizeNotesWithTranslations = (notes: unknown[] | null): DoctorConsultationFolderNote[] =>
  (notes ?? []).map((note) => {
    const row = note as Record<string, unknown>;
    return {
      id: typeof row.id === 'string' ? row.id : '',
      created_at: typeof row.created_at === 'string' ? row.created_at : '',
      doctor_id: typeof row.doctor_id === 'string' ? row.doctor_id : null,
      diagnosis: typeof row.diagnosis === 'string' ? row.diagnosis : null,
      diagnosis_translations:
        row.diagnosis_translations && typeof row.diagnosis_translations === 'object'
          ? (row.diagnosis_translations as Record<string, string>)
          : null,
      treatment_plan: typeof row.treatment_plan === 'string' ? row.treatment_plan : null,
      treatment_plan_translations:
        row.treatment_plan_translations && typeof row.treatment_plan_translations === 'object'
          ? (row.treatment_plan_translations as Record<string, string>)
          : null,
      prescriptions: typeof row.prescriptions === 'string' ? row.prescriptions : null,
      prescriptions_translations:
        row.prescriptions_translations && typeof row.prescriptions_translations === 'object'
          ? (row.prescriptions_translations as Record<string, string>)
          : null,
      follow_up_notes: typeof row.follow_up_notes === 'string' ? row.follow_up_notes : null,
      follow_up_notes_translations:
        row.follow_up_notes_translations && typeof row.follow_up_notes_translations === 'object'
          ? (row.follow_up_notes_translations as Record<string, string>)
          : null,
    };
  });

export const fetchDoctorConsultationNotesForFolder = async (
  patientId: string,
  doctorId: string,
  limit = 10
): Promise<FetchDoctorConsultationNotesResult> => {
  const withTranslations = await supabase
    .from('doctor_consultation_notes')
    .select(NOTES_SELECT_WITH_TRANSLATIONS)
    .eq('patient_id', patientId)
    .eq('doctor_id', doctorId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (!withTranslations.error) {
    return {
      data: normalizeNotesWithTranslations((withTranslations.data as unknown[] | null) ?? null),
      error: null,
      missingTranslationColumns: false,
    };
  }

  if (!isMissingTranslationColumnsError(withTranslations.error)) {
    return {
      data: [],
      error: withTranslations.error,
      missingTranslationColumns: false,
    };
  }

  const legacy = await supabase
    .from('doctor_consultation_notes')
    .select(NOTES_SELECT_LEGACY)
    .eq('patient_id', patientId)
    .eq('doctor_id', doctorId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (legacy.error) {
    return {
      data: [],
      error: legacy.error,
      missingTranslationColumns: true,
    };
  }

  return {
    data: normalizeLegacyNotes((legacy.data as unknown[] | null) ?? null),
    error: null,
    missingTranslationColumns: true,
  };
};
