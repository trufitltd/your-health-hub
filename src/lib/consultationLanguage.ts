export const normalizeConsultationLanguage = (value: string | null | undefined): string => {
  if (!value) return '';
  return value.trim().toLowerCase().replace(/[\s-]+/g, '_');
};

const CONSULTATION_LANGUAGE_LABELS: Record<string, string> = {
  english: 'English',
  hausa: 'Hausa',
  igbo: 'Igbo',
  yoruba: 'Yoruba',
  arabic: 'Arabic',
  swahili: 'Swahili',
  fulfulde: 'Fulfulde',
  tiv: 'Tiv',
  pidgin_english: 'Pidgin English',
  french: 'French',
  spanish: 'Spanish',
  portuguese: 'Portuguese',
};

export const formatConsultationLanguageLabel = (value: string | null | undefined): string => {
  const normalized = normalizeConsultationLanguage(value);
  if (!normalized) return 'Not specified';
  return CONSULTATION_LANGUAGE_LABELS[normalized]
    || normalized
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
};

export const extractConsultationLanguageFromNotes = (notes: unknown): string => {
  if (typeof notes !== 'string' || !notes.trim()) return '';

  const tagged = notes.match(/\[consultation_language:([^\]]+)\]/i);
  if (tagged?.[1]) {
    return normalizeConsultationLanguage(tagged[1]);
  }

  const plain = notes.match(/consultation\s*language\s*:\s*([a-zA-Z_\-\s]+)/i);
  if (plain?.[1]) {
    return normalizeConsultationLanguage(plain[1]);
  }

  return '';
};
