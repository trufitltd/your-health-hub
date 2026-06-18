import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '@/components/layout';
import { Search, Star, Clock, Video, Gift } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn, formatSpecialtyLabel, formatDoctorName } from '@/lib/utils';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { type AppLanguage, useLanguage } from '@/contexts/LanguageContext';
import { useActivePatientPromotion } from '@/hooks/useActivePatientPromotion';
import { useAuth } from '@/hooks/useAuth';

interface DoctorCard {
  id: string;
  name: string;
  specialty: string;
  avatar_url?: string | null;
  bio?: string | null;
  experience?: string | null;
  rating?: number | null;
  total_reviews?: number;
  registration?: Record<string, unknown> | null;
}

const normalizeDoctorNameForVisibility = (value: string | null | undefined) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^dr\.?\s+/, '')
    .replace(/\s+/g, ' ');

const isExcludedDoctorName = (value: string | null | undefined) =>
  normalizeDoctorNameForVisibility(value) === 'test doctor';

const isTestPatientName = (value: string | null | undefined) =>
  String(value || '').trim().toLowerCase() === 'test patient';

interface DoctorScheduleRow {
  doctor_id: string;
  day_of_week: number;
  start_time: string;
  is_available: boolean;
}

const formatTime = (time: string, amLabel: string, pmLabel: string) => {
  if (!time) return '';
  const [hours, minutes] = time.split(':');
  const hour = Number(hours);
  const suffix = hour >= 12 ? pmLabel : amLabel;
  const displayHour = ((hour + 11) % 12) + 1;
  return `${displayHour}:${minutes} ${suffix}`;
};

const getNextAvailable = (
  schedules: DoctorScheduleRow[] | undefined,
  dayNames: string[],
  amLabel: string,
  pmLabel: string
) => {
  if (!schedules || schedules.length === 0) return null;
  const now = new Date();
  for (let offset = 0; offset < 7; offset += 1) {
    const date = new Date(now);
    date.setDate(now.getDate() + offset);
    const day = date.getDay();
    const daySchedules = schedules.filter((schedule) => schedule.day_of_week === day && schedule.is_available);
    if (daySchedules.length > 0) {
      const first = daySchedules.sort((a, b) => a.start_time.localeCompare(b.start_time))[0];
      return `${dayNames[day]}, ${formatTime(first.start_time, amLabel, pmLabel)}`;
    }
  }
  return null;
};

const getMarketingSlotsLeft = (doctorKey: string): 1 | 2 | 3 => {
  const key = doctorKey || 'doctor';
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = ((hash * 31) + key.charCodeAt(index)) >>> 0;
  }
  return ((hash % 3) + 1) as 1 | 2 | 3;
};

const SPECIALTY_TRANSLATIONS: Record<string, Partial<Record<AppLanguage, string>>> = {
  'general practice': {
    en: 'General Practice',
    ha: 'Babban Magani',
    ig: "Ọgwụ N'ozuzu",
    yo: 'Itoju Gbogbogbo',
    sw: 'Tiba ya Jumla',
    ar: 'طب عام',
    fr: 'Médecine générale',
    es: 'Medicina general',
    pt: 'Clínica geral',
    nl: 'Huisartsgeneeskunde',
    zh: '全科',
    de: 'Allgemeinmedizin',
  },
  'general medicine': {
    en: 'General Medicine',
    ha: 'Babban Magunguna',
    ig: "Ọgwụ N'ozuzu",
    yo: 'Oogun Gbogbogbo',
    sw: 'Tiba ya jumla',
    ar: 'الطب العام',
    fr: 'Médecine générale',
    es: 'Medicina general',
    pt: 'Medicina geral',
    nl: 'Algemene geneeskunde',
    zh: '全科医学',
    de: 'Allgemeinmedizin',
  },
  cardiology: {
    ha: 'Ilimin Zuciya',
    ig: 'Ọrịa Obi',
    yo: 'Amoye ọkan',
    sw: 'Moyo',
    ar: 'أمراض القلب',
    fr: 'Cardiologie',
    es: 'Cardiología',
    pt: 'Cardiologia',
    nl: 'Cardiologie',
    zh: '心脏科',
    de: 'Kardiologie',
  },
  dermatology: {
    ha: 'Ilimin Fata',
    ig: 'Ọrịa Akpụkpọ Ahụ',
    yo: 'Amoye awọ ara',
    sw: 'Ngozi',
    ar: 'الأمراض الجلدية',
    fr: 'Dermatologie',
    es: 'Dermatología',
    pt: 'Dermatologia',
    nl: 'Dermatologie',
    zh: '皮肤科',
    de: 'Dermatologie',
  },
  pediatrics: {
    ha: 'Ilimin Yara',
    ig: 'Ọrịa Ụmụaka',
    yo: 'Amoye ọmọde',
    sw: 'Watoto',
    ar: 'طب الأطفال',
    fr: 'Pédiatrie',
    es: 'Pediatría',
    pt: 'Pediatria',
    nl: 'Kindergeneeskunde',
    zh: '儿科',
    de: 'Pädiatrie',
  },
  gynecology: {
    ha: "Ilimin Mata da Haihuwa",
    ig: 'Ọrịa ụmụnwaanyị',
    yo: 'Amoye obinrin',
    sw: 'Uzazi wa wanawake',
    ar: 'طب النساء',
    fr: 'Gynécologie',
    es: 'Ginecología',
    pt: 'Ginecologia',
    nl: 'Gynaecologie',
    zh: '妇科',
    de: 'Gynäkologie',
  },
  obstetrics: {
    ha: 'Ilimin Juna Biyu',
    ig: 'Nlekọta ime',
    yo: 'Aboyun',
    sw: 'Uzazi',
    ar: 'التوليد',
    fr: 'Obstétrique',
    es: 'Obstetricia',
    pt: 'Obstetrícia',
    nl: 'Verloskunde',
    zh: '产科',
    de: 'Geburtshilfe',
  },
  orthopedics: {
    ha: 'Ilimin Kashi',
    ig: 'Ọkpụkpụ',
    yo: 'Amoye egungun',
    sw: 'Mifupa',
    ar: 'جراحة العظام',
    fr: 'Orthopédie',
    es: 'Ortopedia',
    pt: 'Ortopedia',
    nl: 'Orthopedie',
    zh: '骨科',
    de: 'Orthopädie',
  },
  neurology: {
    ha: 'Ilimin Jijiyoyi',
    ig: 'Akwara ụbụrụ',
    yo: 'Amoye ọpọlọ',
    sw: 'Mishipa ya fahamu',
    ar: 'طب الأعصاب',
    fr: 'Neurologie',
    es: 'Neurología',
    pt: 'Neurologia',
    nl: 'Neurologie',
    zh: '神经科',
    de: 'Neurologie',
  },
  psychiatry: {
    ha: 'Ilimin Kwalwa',
    ig: 'Ahụike uche',
    yo: 'Amoye ọpọlọ',
    sw: 'Afya ya akili',
    ar: 'الطب النفسي',
    fr: 'Psychiatrie',
    es: 'Psiquiatría',
    pt: 'Psiquiatria',
    nl: 'Psychiatrie',
    zh: '精神科',
    de: 'Psychiatrie',
  },
  ophthalmology: {
    ha: 'Ilimin Ido',
    ig: 'Ọrịa anya',
    yo: 'Amoye oju',
    sw: 'Macho',
    ar: 'طب العيون',
    fr: 'Ophtalmologie',
    es: 'Oftalmología',
    pt: 'Oftalmologia',
    nl: 'Oogheelkunde',
    zh: '眼科',
    de: 'Augenheilkunde',
  },
  ent: {
    ha: 'Kunne-Hanci-Makogwaro',
    ig: 'Ntị-Imi-Akpọrọ',
    yo: 'Eti-imu-ọfun',
    sw: 'Sikio-pua-koo',
    ar: 'أنف وأذن وحنجرة',
    fr: 'ORL',
    es: 'Otorrinolaringología',
    pt: 'Otorrinolaringologia',
    nl: 'KNO',
    zh: '耳鼻喉科',
    de: 'HNO',
  },
  'ear nose and throat': {
    ha: 'Kunne-Hanci-Makogwaro',
    ig: 'Ntị-Imi-Akpọrọ',
    yo: 'Eti-imu-ọfun',
    sw: 'Sikio-pua-koo',
    ar: 'أنف وأذن وحنجرة',
    fr: 'ORL',
    es: 'Otorrinolaringología',
    pt: 'Otorrinolaringologia',
    nl: 'KNO',
    zh: '耳鼻喉科',
    de: 'HNO',
  },
  'otorhinolaryngology': {
    ha: 'Kunne-Hanci-Makogwaro',
    ig: 'Ntị-Imi-Akpọrọ',
    yo: 'Eti-imu-ọfun',
    sw: 'Sikio-pua-koo',
    ar: 'أنف وأذن وحنجرة',
    fr: 'ORL',
    es: 'Otorrinolaringología',
    pt: 'Otorrinolaringologia',
    nl: 'KNO',
    zh: '耳鼻喉科',
    de: 'HNO',
  },
  urology: {
    ha: 'Ilimin Fitsari',
    ig: 'Ụzọ mmamịrị',
    yo: 'Amoye ito',
    sw: 'Mkojo',
    ar: 'طب المسالك البولية',
    fr: 'Urologie',
    es: 'Urología',
    pt: 'Urologia',
    nl: 'Urologie',
    zh: '泌尿科',
    de: 'Urologie',
  },
  oncology: {
    ha: 'Ilimin Ciwon daji',
    ig: 'Ọrịa kansa',
    yo: 'Amoye akàn',
    sw: 'Saratani',
    ar: 'طب الأورام',
    fr: 'Oncologie',
    es: 'Oncología',
    pt: 'Oncologia',
    nl: 'Oncologie',
    zh: '肿瘤科',
    de: 'Onkologie',
  },
  nephrology: {
    ha: 'Ilimin Koda',
    ig: 'Akụrụ',
    yo: 'Amoye kidinrin',
    sw: 'Figo',
    ar: 'طب الكلى',
    fr: 'Néphrologie',
    es: 'Nefrología',
    pt: 'Nefrologia',
    nl: 'Nefrologie',
    zh: '肾内科',
    de: 'Nephrologie',
  },
  pulmonology: {
    ha: 'Ilimin Huhu',
    ig: 'Akpa ume',
    yo: 'Amoye ẹdọforo',
    sw: 'Mapafu',
    ar: 'طب الرئة',
    fr: 'Pneumologie',
    es: 'Neumología',
    pt: 'Pneumologia',
    nl: 'Longgeneeskunde',
    zh: '呼吸科',
    de: 'Pneumologie',
  },
  endocrinology: {
    ha: 'Ilimin Hormones',
    ig: 'Endokrinoloji',
    yo: 'Amoye homonu',
    sw: 'Endokrinolojia',
    ar: 'طب الغدد الصماء',
    fr: 'Endocrinologie',
    es: 'Endocrinología',
    pt: 'Endocrinologia',
    nl: 'Endocrinologie',
    zh: '内分泌科',
    de: 'Endokrinologie',
  },
  gastroenterology: {
    ha: 'Ilimin Ciki',
    ig: 'Eriri afọ',
    yo: 'Amoye ikun',
    sw: 'Mfumo wa chakula',
    ar: 'طب الجهاز الهضمي',
    fr: 'Gastro-entérologie',
    es: 'Gastroenterología',
    pt: 'Gastroenterologia',
    nl: 'Gastro-enterologie',
    zh: '消化科',
    de: 'Gastroenterologie',
  },
};

const normalizeSpecialtyKey = (value: string) =>
  value
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/[()]/g, '')
    .replace(/[^\w\s/&-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const GENERAL_PRACTITIONER_SPECIALTY_KEYS = new Set([
  'general',
  'general practitioner',
  'general practice',
  'general medicine',
  'medical officer',
  'medical officers',
]);

const toCanonicalSpecialty = (specialty: string | null | undefined) => {
  const normalized = normalizeSpecialtyKey(specialty || '');
  if (!normalized) return '';
  if (GENERAL_PRACTITIONER_SPECIALTY_KEYS.has(normalized)) {
    return 'general practitioner';
  }
  return normalized;
};

const getLocalizedBio = (registration: Record<string, unknown> | null | undefined, language: AppLanguage) => {
  if (!registration || language === 'en') {
    return (registration?.bio as string | null | undefined) || null;
  }

  const directKey = `bio_${language}`;
  const direct = registration[directKey];
  if (typeof direct === 'string' && direct.trim().length > 0) {
    return direct;
  }

  const translations = registration.bio_translations;
  if (translations && typeof translations === 'object') {
    const localized = (translations as Record<string, unknown>)[language];
    if (typeof localized === 'string' && localized.trim().length > 0) {
      return localized;
    }
  }

  return (registration.bio as string | null | undefined) || null;
};

const getLocalizedSpecialty = (
  registration: Record<string, unknown> | null | undefined,
  specialty: string | null | undefined,
  language: AppLanguage,
  fallbackGeneralPractice: string
) => {
  if (!specialty || specialty.trim().length === 0) {
    return fallbackGeneralPractice;
  }

  if (registration && language !== 'en') {
    const translations = registration.specialty_translations;
    if (translations && typeof translations === 'object') {
      const localized = (translations as Record<string, unknown>)[language];
      if (typeof localized === 'string' && localized.trim().length > 0) {
        return localized.trim();
      }
    }
  }

  const normalized = normalizeSpecialtyKey(specialty);
  const mapped = SPECIALTY_TRANSLATIONS[normalized];
  return (mapped?.[language] || specialty).trim();
};

export default function SpecialistsPage() {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const { data: promotion } = useActivePatientPromotion();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSpecialty, setSelectedSpecialty] = useState('__all__');
  const [expandedBios, setExpandedBios] = useState<Set<string>>(new Set());
  const allSpecialtiesLabel = t('specialists.filters.allSpecialties', 'All Specialties');
  const dayNames = [
    t('specialists.days.sun', 'Sun'),
    t('specialists.days.mon', 'Mon'),
    t('specialists.days.tue', 'Tue'),
    t('specialists.days.wed', 'Wed'),
    t('specialists.days.thu', 'Thu'),
    t('specialists.days.fri', 'Fri'),
    t('specialists.days.sat', 'Sat'),
  ];

  const { data: canViewTestDoctor = false } = useQuery({
    queryKey: ['specialists-can-view-test-doctor', user?.id],
    queryFn: async () => {
      if (!user?.id) return false;
      if (isTestPatientName(user.user_metadata?.full_name)) return true;
      const [patientResult, profileResult] = await Promise.all([
        supabase.from('patient_registrations').select('full_name').eq('user_id', user.id).maybeSingle(),
        supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
      ]);
      return isTestPatientName(patientResult.data?.full_name) || isTestPatientName(profileResult.data?.full_name);
    },
    enabled: !!user?.id,
    staleTime: 60 * 1000,
  });

  const { data: doctors = [], isLoading: doctorsLoading } = useQuery({
    queryKey: ['specialists-doctors', canViewTestDoctor],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_public_doctors', {
        p_limit: 1000,
        p_offset: 0,
      });

      if (error) {
        console.error('Error fetching public doctors:', error);
        throw error;
      }

      return ((data || []) as Array<Record<string, unknown>>)
        .filter((doctor) => !isExcludedDoctorName(String(doctor.full_name || '')) || canViewTestDoctor)
        .map((doctor) => ({
          id: String(doctor.user_id || ''),
          name: String(doctor.full_name || 'Doctor'),
          specialty: String(doctor.specialty || ''),
          avatar_url: String(doctor.profile_picture_url || '') || null,
          bio: (doctor.bio as string | null | undefined) || null,
          experience: (doctor.experience as string | null | undefined) || null,
          rating: Number(doctor.rating || 0),
          total_reviews: Number(doctor.total_reviews || 0),
          registration: {
            specialty_translations: null,
            bio_translations: doctor.bio_translations || null,
          },
        })) as DoctorCard[];
    },
  });

  const { data: schedules = [] } = useQuery({
    queryKey: ['specialists-doctor-schedules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('doctor_schedules')
        .select('doctor_id,day_of_week,start_time,is_available')
        .eq('is_available', true);

      if (error) {
        console.error('Error fetching schedules:', error);
        return [];
      }

      return data || [];
    },
  });

  const schedulesByDoctor = useMemo(() => {
    const map = new Map<string, DoctorScheduleRow[]>();
    schedules.forEach((row: DoctorScheduleRow) => {
      if (!map.has(row.doctor_id)) {
        map.set(row.doctor_id, []);
      }
      map.get(row.doctor_id)!.push(row);
    });
    return map;
  }, [schedules]);

  const specialties = useMemo(() => {
    const values = Array.from(
      new Set(
        doctors
          .map((doctor) => toCanonicalSpecialty(doctor.specialty))
          .filter((specialty) => specialty && specialty.trim().length > 0)
      )
    ).sort();
    return [{ value: '__all__', label: allSpecialtiesLabel }, ...values.map((value) => ({ value, label: value }))];
  }, [doctors, allSpecialtiesLabel]);

  const translateSpecialty = (specialty: string | null | undefined) => {
    return getLocalizedSpecialty(
      null,
      specialty,
      language,
      t('specialists.defaults.generalPractice', 'General Practice')
    );
  };

  const filteredDoctors = doctors.filter((doctor) => {
    const canonicalSpecialty = toCanonicalSpecialty(doctor.specialty);
    const localizedSpecialty = getLocalizedSpecialty(
      doctor.registration,
      canonicalSpecialty || doctor.specialty,
      language,
      t('specialists.defaults.generalPractice', 'General Practice')
    );
    const query = searchQuery.toLowerCase();
    const matchesSearch = doctor.name.toLowerCase().includes(query) ||
      (doctor.specialty || '').toLowerCase().includes(query) ||
      canonicalSpecialty.toLowerCase().includes(query) ||
      localizedSpecialty.toLowerCase().includes(query);
    const matchesSpecialty = selectedSpecialty === '__all__' || canonicalSpecialty === selectedSpecialty;
    return matchesSearch && matchesSpecialty;
  });

  return (
    <Layout>
      {/* Hero */}
      <section className="pt-32 pb-12 gradient-subtle">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center max-w-3xl mx-auto mb-12"
          >
            <span className="text-primary font-medium text-sm uppercase tracking-wider">
              {t('specialists.hero.badge', 'Our Specialists')}
            </span>
            <h1 className="text-4xl md:text-5xl font-bold mt-3 mb-6">
              {t('specialists.hero.title', 'Find Your Perfect Doctor')}
            </h1>
            <p className="text-lg text-muted-foreground">
              {t(
                'specialists.hero.description',
                'Browse our network of certified specialists and book your consultation today'
              )}
            </p>
            {promotion?.isActive ? (
              <div className="mx-auto mt-6 flex max-w-2xl items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-left">
                <Gift className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
                <div>
                  <p className="text-sm font-semibold text-emerald-800">
                    Promotion live: free consultation offer ends in {promotion.countdownText}.
                  </p>
                  <p className="mt-1 text-xs text-emerald-700">
                    Offer ends on {promotion.endDateText}. Complete registration to qualify.
                  </p>
                </div>
              </div>
            ) : null}
          </motion.div>

          {/* Search */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="max-w-2xl mx-auto"
          >
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                type="text"
                placeholder={t('specialists.search.placeholder', 'Search by doctor name or specialty...')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-12 h-14 text-base rounded-2xl shadow-card"
              />
            </div>
          </motion.div>
        </div>
      </section>

      {/* Filters & Results */}
      <section className="py-12">
        <div className="container mx-auto px-4">
          {/* Specialty Tabs */}
          <div className="flex gap-2 overflow-x-auto pb-4 mb-8 scrollbar-hide">
            {specialties.map((specialty) => (
              <button
                key={specialty.value}
                onClick={() => setSelectedSpecialty(specialty.value)}
                className={cn(
                  'px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-200',
                  selectedSpecialty === specialty.value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                )}
              >
                {specialty.label === allSpecialtiesLabel
                  ? allSpecialtiesLabel
                  : formatSpecialtyLabel(translateSpecialty(specialty.value))}
              </button>
            ))}
          </div>

          {/* Results Count */}
          <p className="text-muted-foreground mb-6">
            {t('specialists.results.showing', 'Showing')} {filteredDoctors.length} {t('specialists.results.specialists', 'specialists')}
          </p>

          {/* Doctors Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredDoctors.map((doctor, index) => {
              const rating = (typeof doctor.rating === 'number' && doctor.rating > 0)
                ? Number(doctor.rating.toFixed(1))
                : null;
              const reviews = Number(doctor.total_reviews || 0);
              const nextAvailable = getNextAvailable(
                schedulesByDoctor.get(doctor.id),
                dayNames,
                t('specialists.time.am', 'AM'),
                t('specialists.time.pm', 'PM')
              );
              const isBioExpanded = expandedBios.has(doctor.id);
              const localizedBio = getLocalizedBio(doctor.registration, language);
              const hasLongBio = (localizedBio || '').trim().length > 140;
              const marketingSlotsLeft = getMarketingSlotsLeft(doctor.id);
              const doctorDisplayName = formatDoctorName(doctor.name);

            return (
              <motion.div
                key={doctor.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
                className="bg-card rounded-2xl border border-border p-6 hover:shadow-card hover:border-primary/20 transition-all duration-300"
              >
                <div className="flex flex-col sm:flex-row items-center sm:items-start text-center sm:text-left gap-4 mb-4">
                  <div className="w-20 h-20 rounded-2xl bg-muted overflow-hidden flex-shrink-0 border border-border">
                    <img
                      src={doctor.avatar_url || '/placeholder.svg'}
                      alt={doctor.name}
                      className="w-full h-full object-cover object-top"
                    />
                  </div>
                  <div className="flex-1 min-w-0 w-full">
                    <h3 className="font-semibold truncate w-full">{formatDoctorName(doctor.name)}</h3>
                    <p className="text-sm text-primary">
                      {formatSpecialtyLabel(
                        translateSpecialty(toCanonicalSpecialty(doctor.specialty) || doctor.specialty)
                      )}
                    </p>
                    {doctor.experience && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {t('specialists.card.experience', 'Experience')}: {doctor.experience} {t('specialists.card.years', 'years')}
                      </p>
                    )}
                    <div className="text-xs text-muted-foreground mt-1">
                      <p className={cn(isBioExpanded ? '' : 'line-clamp-2', "text-center sm:text-left")}>
                        {localizedBio || t('specialists.defaults.noBio', 'No bio provided.')}
                      </p>
                      {hasLongBio && (
                        <button
                          type="button"
                          className="mt-1 text-[11px] font-medium text-primary hover:underline mx-auto sm:mx-0 block"
                          onClick={() => {
                            setExpandedBios((prev) => {
                              const next = new Set(prev);
                              if (next.has(doctor.id)) {
                                next.delete(doctor.id);
                              } else {
                                next.add(doctor.id);
                              }
                              return next;
                            });
                          }}
                        >
                          {isBioExpanded
                            ? t('specialists.card.readLess', 'Read less')
                            : t('specialists.card.readMore', 'Read more')}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-center sm:justify-start gap-4 mb-4 text-sm">
                  <div className="flex items-center gap-1">
                    <Star className="w-4 h-4 text-warning fill-warning" />
                    <span className="font-medium">{rating ?? t('specialists.defaults.notAvailable', 'N/A')}</span>
                    <span className="text-muted-foreground">({reviews})</span>
                  </div>
                </div>

                <div className="flex items-center justify-center sm:justify-start gap-2 text-sm text-muted-foreground mb-4">
                  <Clock className="w-4 h-4" />
                  <span>
                    {t('specialists.card.next', 'Next')}: {nextAvailable || t('specialists.card.checkAvailability', 'Check availability')}
                  </span>
                </div>

                <div className="mb-4 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-center sm:text-left">
                  <p className="text-xs font-semibold text-orange-700">
                    Only {marketingSlotsLeft} slot{marketingSlotsLeft === 1 ? '' : 's'} left for booking with {doctorDisplayName}
                  </p>
                </div>

                <div className="flex items-center justify-center sm:justify-end pt-4 border-t border-border">
                  <Link to={`/booking/${doctor.id}`} className="w-full sm:w-auto">
                    <Button variant="gradient" size="sm" className="w-full sm:w-auto">
                      <Video className="w-4 h-4" />
                      {t('common.bookNow', 'Book Now')}
                    </Button>
                  </Link>
                </div>
              </motion.div>
            );
            })}
          </div>

          {doctorsLoading && (
            <div className="text-center py-16">
              <p className="text-muted-foreground">
                {t('specialists.states.loading', 'Loading specialists...')}
              </p>
            </div>
          )}

          {!doctorsLoading && filteredDoctors.length === 0 && (
            <div className="text-center py-16">
              <p className="text-muted-foreground">
                {t('specialists.states.noResults', 'No specialists found matching your criteria.')}
              </p>
            </div>
          )}
        </div>
      </section>
    </Layout>
  );
}
