import { useState, useMemo, useEffect } from 'react';
import { MIN_SPECIALIST_RATE_NGN, GP_RATE_NGN } from '@/services/marketplaceTypes';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useDoctorPresence } from '@/hooks/useDoctorPresence';
import { formatSpecialtyLabel, formatDoctorName, cn } from '@/lib/utils';
import {
  isBlockingAppointmentRow,
  isTimePointBusyByAppointments,
  normalizeTimeHHMM,
  timeToMinutes,
} from '@/lib/appointmentIntervals';
import { useLanguage } from '@/contexts/LanguageContext';
import { useLocaleFormatter } from '@/lib/locale';
import {
  Star, Search, Filter, Clock, MapPin, Award, Heart,
  ChevronRight, Loader
} from 'lucide-react';

interface Doctor {
  id: string;
  user_id: string;
  full_name: string;
  specialty: string;
  experience?: string | null;
  rate_per_consultation?: number | null;
  hospital_affiliation: string;
  profile_picture_url?: string;
  medical_license_url?: string | null;
  age: number;
  verification_status: string;
  city: string;
  state: string;
  rating?: number;
  total_reviews?: number;
  experience_years?: number;
  bio?: string;
  bio_translations?: Record<string, string> | null;
  preferred_consultation_languages?: string[] | null;
  is_active?: boolean;
  online_status?: 'online' | 'away' | 'offline';
}

type SlotStatusRow = {
  time: string | null;
  duration_minutes: number | null;
  status: string | null;
  slot_locked_until: string | null;
};

const SUPPORTED_CONSULTATION_LANGUAGES = [
  'english',
  'hausa',
  'igbo',
  'yoruba',
  'arabic',
  'swahili',
  'fulfulde',
  'tiv',
  'pidgin_english',
  'french',
  'spanish',
  'portuguese',
] as const;

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

const normalizeConsultationLanguage = (value: string | null | undefined) => {
  if (!value) return '';
  return value.trim().toLowerCase().replace(/[\s-]+/g, '_');
};

const formatConsultationLanguageLabel = (value: string) => {
  const normalized = normalizeConsultationLanguage(value);
  if (!normalized) return 'Unknown';
  return CONSULTATION_LANGUAGE_LABELS[normalized]
    || normalized
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
};

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

const isDoctorVisibleInDiscovery = (doctorName: string | null | undefined, canViewTestDoctor: boolean) => {
  if (!isExcludedDoctorName(doctorName)) return true;
  return canViewTestDoctor;
};

const URL_PARAM_DOCTOR_TYPE_VALUES = new Set(['all', 'general', 'specialist']);
const URL_PARAM_AVAILABILITY_MODE_VALUES = new Set(['none', 'now', 'exact', 'range']);
const DOCTOR_DISCOVERY_MANAGED_URL_PARAMS = [
  'q',
  'type',
  'specialty',
  'minRating',
  'state',
  'experienceRange',
  'hospital',
  'consultationLanguage',
  'availability',
  'date',
  'time',
  'startDate',
  'startTime',
  'endDate',
  'endTime',
];

const areDoctorDiscoveryFiltersEqual = (
  left: DoctorDiscoveryFilters,
  right: DoctorDiscoveryFilters,
) => (
  left.specialty === right.specialty
  && left.minRating === right.minRating
  && left.state === right.state
  && left.experienceRange === right.experienceRange
  && left.hospital === right.hospital
  && left.consultationLanguage === right.consultationLanguage
);

const areDoctorDiscoveryAvailabilityFiltersEqual = (
  left: DoctorDiscoveryAvailabilityFilters,
  right: DoctorDiscoveryAvailabilityFilters,
) => (
  left.date === right.date
  && left.time === right.time
  && left.startDate === right.startDate
  && left.startTime === right.startTime
  && left.endDate === right.endDate
  && left.endTime === right.endTime
);

const parseNonNegativeNumber = (value: string | null, fallback: number) => {
  if (value === null) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
};

type DiscoveryStartingPrices = {
  gp: number | null;
  specialist: number | null;
  currency: string;
  variation: {
    gp: {
      duration: boolean;
      consultationType: boolean;
      tier: boolean;
    };
    specialist: {
      duration: boolean;
      consultationType: boolean;
      tier: boolean;
    };
  };
};

export default function DoctorDiscovery() {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { formatDate, formatTime, formatNumber, formatCurrency } = useLocaleFormatter();
  const queryClient = useQueryClient();
  const { presenceMap } = useDoctorPresence();
  const [doctorTypeFilter, setDoctorTypeFilter] = useState<'all' | 'general' | 'specialist'>('all');
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({
    specialty: '',
    minRating: 0,
    state: '',
    experienceRange: '',
    hospital: '',
    consultationLanguage: '',
  });
  const [availabilityMode, setAvailabilityMode] = useState<'none' | 'now' | 'exact' | 'range'>('none');
  const [availabilityFilters, setAvailabilityFilters] = useState({
    date: '',
    time: '',
    startDate: '',
    startTime: '',
    endDate: '',
    endTime: '',
  });
  const [showAvailabilityDialog, setShowAvailabilityDialog] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);

  const { data: canViewTestDoctor = false } = useQuery({
    queryKey: ['doctor-discovery-can-view-test-doctor', user?.id],
    queryFn: async () => {
      if (!user?.id) return false;

      if (isTestPatientName(user.user_metadata?.full_name)) {
        return true;
      }

      const [patientRegistrationResult, profileResult] = await Promise.all([
        supabase
          .from('patient_registrations')
          .select('full_name')
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .maybeSingle(),
      ]);

      const registrationName = patientRegistrationResult.data?.full_name;
      const profileName = profileResult.data?.full_name;

      return isTestPatientName(registrationName) || isTestPatientName(profileName);
    },
    enabled: !!user?.id,
    staleTime: 60 * 1000,
  });

  // Handle scroll to show/hide filters
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;

      if (window.innerWidth < 768) {
        setShowFilters(true);
        setLastScrollY(currentScrollY);
        return;
      }
      
      if (currentScrollY < 50) {
        setShowFilters(true);
      } else if (currentScrollY > lastScrollY) {
        // Scrolling down
        setShowFilters(false);
      } else {
        // Scrolling up
        setShowFilters(true);
      }
      
      setLastScrollY(currentScrollY);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [lastScrollY]);

  // Helper: Get current date/time in correct format
  const getNowDatetime = () => {
    const now = new Date();
    const date = now.toISOString().split('T')[0];
    const time = now.toTimeString().slice(0, 5);
    return { date, time };
  };

  const { data: discoveryStartingPrices = {
    gp: null,
    specialist: null,
    currency: 'NGN',
    variation: {
      gp: { duration: false, consultationType: false, tier: false },
      specialist: { duration: false, consultationType: false, tier: false },
    },
  } } = useQuery({
    queryKey: ['doctor-discovery-starting-prices'],
    queryFn: async (): Promise<DiscoveryStartingPrices> => {
      try {
        const { data, error } = await supabase.functions.invoke('discovery-starting-prices');
        if (error) throw error;

        const payload = (data || {}) as {
          gp?: number | null;
          specialist?: number | null;
          currency?: string | null;
          variation?: {
            gp?: {
              duration?: boolean;
              consultationType?: boolean;
              tier?: boolean;
            };
            specialist?: {
              duration?: boolean;
              consultationType?: boolean;
              tier?: boolean;
            };
          };
        };

        const gp = typeof payload.gp === 'number' && Number.isFinite(payload.gp) && payload.gp >= 0
          ? payload.gp
          : null;
        const specialist = typeof payload.specialist === 'number' && Number.isFinite(payload.specialist) && payload.specialist >= 0
          ? payload.specialist
          : null;
        const currency = typeof payload.currency === 'string' && payload.currency.trim()
          ? payload.currency.trim().toUpperCase()
          : 'NGN';

        const variation = {
          gp: {
            duration: !!payload.variation?.gp?.duration,
            consultationType: !!payload.variation?.gp?.consultationType,
            tier: !!payload.variation?.gp?.tier,
          },
          specialist: {
            duration: !!payload.variation?.specialist?.duration,
            consultationType: !!payload.variation?.specialist?.consultationType,
            tier: !!payload.variation?.specialist?.tier,
          },
        };

        return { gp, specialist, currency, variation };
      } catch (error) {
        console.warn('[DoctorDiscovery] Unable to load discovery starting prices from edge function', error);
        return {
          gp: null,
          specialist: null,
          currency: 'NGN',
          variation: {
            gp: { duration: false, consultationType: false, tier: false },
            specialist: { duration: false, consultationType: false, tier: false },
          },
        };
      }
    },
    staleTime: 60 * 1000,
  });

  // Fetch doctors who have an available schedule based on mode (excluding booked slots)
  const { data: availableDoctorIds = [] } = useQuery({
    queryKey: ['available-doctors', availabilityMode, availabilityFilters, canViewTestDoctor],
    queryFn: async () => {
      const checkTimes: Array<{ date: string; time: string; dayIndex: number }> = [];

      if (availabilityMode === 'now') {
        const { date, time } = getNowDatetime();
        const normalizedTime = normalizeTimeHHMM(time);
        if (!normalizedTime) return [];
        const dayIndex = new Date(date).getDay();
        checkTimes.push({ date, time: normalizedTime, dayIndex });
      } else if (availabilityMode === 'exact') {
        if (!availabilityFilters.date || !availabilityFilters.time) return [];
        const normalizedTime = normalizeTimeHHMM(availabilityFilters.time);
        if (!normalizedTime) return [];
        const dayIndex = new Date(availabilityFilters.date).getDay();
        checkTimes.push({ 
          date: availabilityFilters.date, 
          time: normalizedTime, 
          dayIndex 
        });
      } else if (availabilityMode === 'range') {
        if (!availabilityFilters.startDate || !availabilityFilters.startTime) return [];
        const endD = availabilityFilters.endDate || availabilityFilters.startDate;
        const startTime = normalizeTimeHHMM(availabilityFilters.startTime);
        if (!startTime) return [];
        const endTime = normalizeTimeHHMM(availabilityFilters.endTime || '23:59') || '23:59';
        
        const current = new Date(availabilityFilters.startDate);
        const end = new Date(endD);
        
        while (current <= end) {
          const dateStr = current.toISOString().split('T')[0];
          const dayIndex = current.getDay();
          checkTimes.push({ date: dateStr, time: startTime, dayIndex });
          if (endTime !== startTime) {
            checkTimes.push({ date: dateStr, time: endTime, dayIndex });
          }
          current.setDate(current.getDate() + 1);
        }
      }

      if (checkTimes.length === 0) return [];
      const uniqueDates = Array.from(new Set(checkTimes.map(({ date }) => date)));

      const { data: approvedDoctors, error: approvedError } = await supabase.rpc('list_public_doctors', {
        p_limit: 5000,
        p_offset: 0,
      });

      if (approvedError) throw approvedError;
      if (!approvedDoctors || approvedDoctors.length === 0) return [];

      const activeDoctorIds = approvedDoctors
        .filter((doctor) =>
          isDoctorVisibleInDiscovery((doctor as any).full_name, canViewTestDoctor)
        )
        .map((doctor) => doctor.user_id)
        .filter(Boolean) as string[];
      const doctorSet = new Set<string>();

      // Check each doctor
      for (const doctorId of activeDoctorIds) {
        let hasAvailableSlot = false;

        // Get all schedules for this doctor
        const { data: schedules, error: scheduleError } = await supabase
          .from('doctor_schedules')
          .select('day_of_week, start_time, end_time, slot_duration_minutes')
          .eq('doctor_id', doctorId)
          .eq('is_available', true);

        if (scheduleError) throw scheduleError;
        if (!schedules || schedules.length === 0) continue;

        const appointmentsByDate = new Map<string, SlotStatusRow[]>();
        for (const date of uniqueDates) {
          const { data: appointments, error: appointmentsError } = await supabase.rpc(
            'public_list_doctor_booked_slots',
            {
              p_doctor_id: doctorId,
              p_date: date,
            }
          );

          if (appointmentsError) throw appointmentsError;

          const blockingAppointments = (appointments || [])
            .filter((row) => isBlockingAppointmentRow(row as SlotStatusRow))
            .map((row) => row as SlotStatusRow);
          appointmentsByDate.set(date, blockingAppointments);
        }

        // Check each requested time
        for (const { date, time, dayIndex } of checkTimes) {
          const daySchedules = schedules.filter((schedule) => Number(schedule.day_of_week) === dayIndex);
          if (daySchedules.length === 0) continue;

          const requestedMinute = timeToMinutes(time);
          if (requestedMinute === null) continue;

          const appointmentsForDate = appointmentsByDate.get(date) || [];
          if (isTimePointBusyByAppointments(time, appointmentsForDate)) {
            continue;
          }

          const coveredBySchedule = daySchedules.some((schedule) => {
            const scheduleStart = timeToMinutes(String(schedule.start_time).slice(0, 5));
            const scheduleEnd = timeToMinutes(String(schedule.end_time).slice(0, 5));
            if (scheduleStart === null || scheduleEnd === null) return false;
            return requestedMinute >= scheduleStart && requestedMinute < scheduleEnd;
          });

          if (coveredBySchedule) {
            hasAvailableSlot = true;
          }

          if (hasAvailableSlot) break;
        }

        if (hasAvailableSlot) {
          doctorSet.add(doctorId);
        }
      }

      return Array.from(doctorSet);
    },
    enabled: availabilityMode !== 'none',
  });

  // Fetch doctors
  const { data: doctors = [], isLoading: doctorsLoading } = useQuery({
    queryKey: ['doctors-discovery', canViewTestDoctor],
    queryFn: async () => {
      const doctorsQuery = await supabase.rpc('list_public_doctors', {
        p_limit: 5000,
        p_offset: 0,
      });
      if (doctorsQuery.error) throw doctorsQuery.error;

      let registrationRows = ((doctorsQuery.data || []) as Array<{
        user_id: string;
        full_name: string;
        specialty: string;
        rate_per_consultation?: number | null;
        hospital_affiliation: string;
        profile_picture_url?: string | null;
        city: string;
        state: string;
        bio?: string | null;
        bio_translations?: Record<string, unknown> | null;
        experience?: string | null;
        preferred_consultation_languages?: string[] | null;
        rating?: number | null;
        total_reviews?: number | null;
      }>)
        .filter((doctor) => isDoctorVisibleInDiscovery(doctor.full_name, canViewTestDoctor));

      const doctorIds = registrationRows.map((doctor) => doctor.user_id).filter(Boolean);
      const { data: schedules } = doctorIds.length > 0
        ? await supabase
            .from('doctor_schedules')
            .select('doctor_id')
            .in('doctor_id', doctorIds)
            .eq('is_available', true)
        : { data: [] };
      const doctorsWithSchedules = new Set((schedules || []).map((row: any) => String(row.doctor_id || '')));

      const doctorsWithRatings = registrationRows.map((doctor) => {
        const hasAvailableSchedules = doctorsWithSchedules.has(String(doctor.user_id || ''));
        const preferredConsultationLanguages = Array.isArray(doctor.preferred_consultation_languages)
          ? doctor.preferred_consultation_languages
            .map((language) => normalizeConsultationLanguage(String(language)))
            .filter(Boolean)
          : [];
        const localizedBioTranslations = (doctor.bio_translations && typeof doctor.bio_translations === 'object')
          ? Object.entries(doctor.bio_translations as Record<string, unknown>).reduce<Record<string, string>>(
            (acc, [code, value]) => {
              if (typeof value !== 'string') return acc;
              const trimmed = value.trim();
              if (!trimmed) return acc;
              acc[code.toLowerCase()] = trimmed;
              return acc;
            },
            {}
          )
          : {};

        return {
          ...doctor,
          id: doctor.user_id,
          age: 0,
          verification_status: 'approved',
          medical_license_url: null,
          rating: Number(doctor.rating || 0),
          total_reviews: Number(doctor.total_reviews || 0),
          experience_years: doctor.experience ? Number(doctor.experience) : null,
          rate_per_consultation: doctor.rate_per_consultation ? Number(doctor.rate_per_consultation) : null,
          bio_translations: localizedBioTranslations,
          preferred_consultation_languages: preferredConsultationLanguages,
          is_active: hasAvailableSchedules,
        };
      });

      return doctorsWithRatings.filter((doctor) => doctor.is_active !== false);
    }
  });

  // Merge presence data with doctors
  const doctorsWithPresence = useMemo(() => {
    console.log('[DoctorDiscovery] Current presence map:', presenceMap);
    console.log('[DoctorDiscovery] Doctors:', doctors.map(d => ({ user_id: d.user_id, name: d.full_name })));
    return doctors.map(doctor => {
      // Use user_id which matches the auth user ID
      const status = presenceMap[doctor.user_id] || 'offline';
      console.log(`[DoctorDiscovery] Doctor ${doctor.full_name} (user_id: ${doctor.user_id}): ${status}`);
      return {
        ...doctor,
        online_status: status as 'online' | 'away' | 'offline',
      };
    });
  }, [doctors, presenceMap]);

  // Real-time subscription for doctor schedules and availability
  useEffect(() => {
    const channel = supabase
      .channel('doctor-discovery-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'doctor_schedules' },
        (payload) => {
          console.log('Doctor schedule changed:', payload);
          queryClient.invalidateQueries({ queryKey: ['doctors-discovery'] });
          queryClient.invalidateQueries({ queryKey: ['available-doctors'] });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'doctors' },
        (payload) => {
          console.log('Doctor status changed:', payload);
          queryClient.invalidateQueries({ queryKey: ['doctors-discovery'] });
          queryClient.invalidateQueries({ queryKey: ['available-doctors'] });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointments' },
        (payload) => {
          console.log('Appointment changed:', payload);
          queryClient.invalidateQueries({ queryKey: ['available-doctors'] });
        }
      )
      .subscribe((status) => {
        console.log('Subscription status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const isGeneralPracticeSpecialty = (specialty: string) => {
    const normalized = specialty?.toLowerCase().replace(/_/g, ' ').trim();
    return normalized === 'general practice' || normalized === 'general practitioner';
  };

  const matchesExperienceRange = (experienceYears: number | null | undefined, selectedRange: string) => {
    if (!selectedRange) return true;
    const years = Number(experienceYears || 0);
    if (!Number.isFinite(years)) return false;

    if (selectedRange === '2-5') return years >= 2 && years < 5;
    if (selectedRange === '5-10') return years >= 5 && years < 10;
    if (selectedRange === '10+') return years >= 10;
    return true;
  };

  // Filter doctors based on search and filters
  const filteredDoctors = useMemo(() => {
    return doctorsWithPresence.filter(doctor => {
      const matchesSearch = 
        doctor.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        doctor.specialty.toLowerCase().includes(searchQuery.toLowerCase()) ||
        doctor.hospital_affiliation.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesDoctorType =
        doctorTypeFilter === 'all' ? true :
        doctorTypeFilter === 'general' ? isGeneralPracticeSpecialty(doctor.specialty || '') :
        doctorTypeFilter === 'specialist' ? !isGeneralPracticeSpecialty(doctor.specialty || '') : true;

      const matchesSpecialty = !filters.specialty || doctor.specialty.toLowerCase().includes(filters.specialty.toLowerCase());
      const matchesRating = !filters.minRating || (doctor.rating || 0) >= filters.minRating;
      const matchesState = !filters.state || doctor.state.toLowerCase() === filters.state.toLowerCase();
      const matchesExperience = matchesExperienceRange(doctor.experience_years, filters.experienceRange);
      const matchesHospital = !filters.hospital || doctor.hospital_affiliation.toLowerCase().includes(filters.hospital.toLowerCase());
      const matchesLanguage = !filters.consultationLanguage
        || (doctor.preferred_consultation_languages || []).includes(filters.consultationLanguage);
      const matchesAvailability = availabilityMode === 'none' || availableDoctorIds.includes(doctor.user_id);

      return matchesSearch
        && matchesDoctorType
        && matchesSpecialty
        && matchesRating
        && matchesState
        && matchesExperience
        && matchesHospital
        && matchesLanguage
        && matchesAvailability;
    });
  }, [searchQuery, filters, doctorsWithPresence, availabilityMode, availableDoctorIds, doctorTypeFilter]);

  // Get unique specialties and hospitals for filter dropdowns
  const specialties = useMemo(() => 
    [...new Set(doctorsWithPresence.map(d => d.specialty))].sort(), [doctorsWithPresence]
  );

  const hospitals = useMemo(() =>
    [...new Set(doctorsWithPresence.map(d => d.hospital_affiliation))].sort(), [doctorsWithPresence]
  );

  const states = useMemo(() =>
    [...new Set(doctorsWithPresence.map((doctor) => String(doctor.state || '').trim()).filter(Boolean))].sort(),
  [doctorsWithPresence]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (doctorTypeFilter !== 'all') count += 1;
    if (filters.specialty) count += 1;
    if (filters.minRating > 0) count += 1;
    if (filters.state) count += 1;
    if (filters.experienceRange) count += 1;
    if (filters.hospital) count += 1;
    if (filters.consultationLanguage) count += 1;
    if (availabilityMode !== 'none') count += 1;
    return count;
  }, [doctorTypeFilter, filters, availabilityMode]);

  const hasActiveSearch = searchQuery.trim().length > 0;
  const hasAnyActiveControls = hasActiveSearch || activeFilterCount > 0;

  const clearAllFilters = () => {
    setFilters({ specialty: '', minRating: 0, state: '', experienceRange: '', hospital: '', consultationLanguage: '' });
    setSearchQuery('');
    setDoctorTypeFilter('all');
    setAvailabilityMode('none');
    setAvailabilityFilters({ date: '', time: '', startDate: '', startTime: '', endDate: '', endTime: '' });
  };

  const consultationLanguageOptions = useMemo(() => {
    const languageValues = new Set<string>(SUPPORTED_CONSULTATION_LANGUAGES);

    doctorsWithPresence.forEach((doctor) => {
      (doctor.preferred_consultation_languages || []).forEach((language) => {
        const normalizedLanguage = normalizeConsultationLanguage(language);
        if (normalizedLanguage) {
          languageValues.add(normalizedLanguage);
        }
      });
    });

    return Array.from(languageValues)
      .map((value) => ({ value, label: formatConsultationLanguageLabel(value) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [doctorsWithPresence]);

  const handleViewProfile = (doctor: Doctor) => {
    setSelectedDoctor(doctor);
    setProfileOpen(true);
  };

  // Legacy fallback used only when discovery pricing config cannot be loaded.
  const getFallbackConsultationFee = (doctor: Doctor) => {
    const isSpecialist = !isGeneralPracticeSpecialty(doctor.specialty || '');
    const parsedRate = Number(doctor.rate_per_consultation);
    if (isSpecialist && Number.isFinite(parsedRate) && parsedRate > 0) {
      return parsedRate;
    }
    return isSpecialist ? MIN_SPECIALIST_RATE_NGN : GP_RATE_NGN;
  };

  const getStartingPriceForDoctor = (doctor: Doctor) => {
    const doctorTypeKey = isGeneralPracticeSpecialty(doctor.specialty || '') ? 'gp' : 'specialist';
    const configuredStartingPrice = discoveryStartingPrices[doctorTypeKey];
    if (typeof configuredStartingPrice === 'number' && Number.isFinite(configuredStartingPrice) && configuredStartingPrice > 0) {
      return configuredStartingPrice;
    }
    return getFallbackConsultationFee(doctor);
  };

  const getPricingVariationMessage = (doctor: Doctor) => {
    const doctorTypeKey = isGeneralPracticeSpecialty(doctor.specialty || '') ? 'gp' : 'specialist';
    const variation = discoveryStartingPrices.variation[doctorTypeKey];
    const factors: string[] = [];

    if (variation.duration) factors.push('duration');
    if (variation.consultationType) factors.push('mode');
    if (variation.tier) factors.push('doctor tier');

    if (factors.length === 0) {
      return 'Fixed price.';
    }
    if (factors.length === 1) {
      return `Final price varies by ${factors[0]}.`;
    }
    if (factors.length === 2) {
      return `Final price varies by ${factors[0]} and ${factors[1]}.`;
    }
    return `Final price varies by ${factors[0]}, ${factors[1]}, and ${factors[2]}.`;
  };

  // Helper: Get status color and label
  const getStatusColor = (status?: 'online' | 'away' | 'offline') => {
    switch (status) {
      case 'online':
        return { bg: 'bg-green-500', text: 'Online', ring: 'ring-green-500' };
      case 'away':
        return { bg: 'bg-amber-500', text: 'Away', ring: 'ring-amber-500' };
      case 'offline':
      default:
        return { bg: 'bg-gray-400', text: 'Offline', ring: 'ring-gray-400' };
    }
  };

  // Helper: Format date for display
  const formatDateForDisplay = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr + 'T00:00:00');
    return formatDate(date, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Helper: Format time for display
  const formatTimeForDisplay = (timeStr: string) => {
    if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':');
    return formatTime(new Date(`2000-01-01T${hours}:${minutes}:00`), {
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  // Helper: Get availability filter display text
  const getAvailabilityFilterText = () => {
    if (availabilityMode === 'now') {
      return 'Available now';
    } else if (availabilityMode === 'exact' && availabilityFilters.date && availabilityFilters.time) {
      return `${formatDateForDisplay(availabilityFilters.date)} at ${formatTimeForDisplay(availabilityFilters.time)}`;
    } else if (availabilityMode === 'range' && availabilityFilters.startDate && availabilityFilters.startTime) {
      const startText = `${formatDateForDisplay(availabilityFilters.startDate)} ${formatTimeForDisplay(availabilityFilters.startTime)}`;
      if (availabilityFilters.endDate && availabilityFilters.endTime) {
        const endText = `${formatDateForDisplay(availabilityFilters.endDate)} ${formatTimeForDisplay(availabilityFilters.endTime)}`;
        return `${startText} - ${endText}`;
      }
      return `From ${startText}`;
    }
    return null;
  };

  const getLocalizedDoctorBio = (doctor: Doctor) => {
    const fallbackBio = doctor.bio?.trim() || '';
    if (language === 'en') return fallbackBio;
    const translations = doctor.bio_translations;
    if (!translations || typeof translations !== 'object') return fallbackBio;
    const localized = translations[language];
    if (typeof localized === 'string' && localized.trim().length > 0) {
      return localized.trim();
    }
    const englishTranslation = translations.en;
    if (typeof englishTranslation === 'string' && englishTranslation.trim().length > 0) {
      return englishTranslation.trim();
    }
    return fallbackBio;
  };

  const handleBookNow = (doctor: Doctor) => {
    if (!user) {
      toast({ title: 'Please sign in', description: 'You must be signed in to book appointments.' });
      navigate(`/auth?redirect=/booking/${doctor.user_id}`);
      return;
    }
    if (!doctor.is_active) {
      toast({ 
        title: 'Doctor Unavailable', 
        description: `${doctor.full_name} is currently unavailable. Please choose another doctor.` 
      });
      return;
    }

    navigate(`/booking/${doctor.user_id}`);
  };

  const renderStars = (rating: number, count: number = 5) => {
    return [...Array(count)].map((_, i) => (
      <Star
        key={i}
        className={`w-4 h-4 ${i < Math.round(rating)
          ? 'text-warning fill-warning'
          : 'text-muted'
        }`}
      />
    ));
  };

  return (
    <Layout>
      <div className="min-h-screen bg-muted/30 py-8 md:py-12">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            {/* Header */}
            <div className="mb-6 mt-16">
              <h1 className="text-4xl font-bold mb-2">Find a Doctor</h1>
              <p className="text-lg text-muted-foreground">Browse our network of qualified healthcare professionals</p>
            </div>

            {/* Mobile Search + Filters */}
            <div className="md:hidden sticky top-12 z-30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-y border-border py-3 mb-4 -mx-4 px-4">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search doctors..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="relative gap-2"
                  onClick={() => setMobileFiltersOpen(true)}
                >
                  <Filter className="w-4 h-4" />
                  Filters
                  {activeFilterCount > 0 && (
                    <span className="inline-flex min-w-5 h-5 px-1 items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] leading-none">
                      {activeFilterCount}
                    </span>
                  )}
                </Button>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground truncate">
                  <span className="font-semibold text-foreground">{filteredDoctors.length}</span> doctors
                  {activeFilterCount > 0 ? ` • ${activeFilterCount} active` : ''}
                </p>
                {hasAnyActiveControls && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={clearAllFilters}
                  >
                    Clear
                  </Button>
                )}
              </div>
            </div>

            <Dialog open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
              <DialogContent className="md:hidden w-[calc(100%-1rem)] max-w-lg rounded-2xl p-0 overflow-hidden">
                <DialogHeader className="px-4 pt-4 pb-2">
                  <DialogTitle>Filter Doctors</DialogTitle>
                  <DialogDescription>Refine results by specialty, language, and availability.</DialogDescription>
                </DialogHeader>

                <div className="px-4 pb-4 space-y-4 max-h-[70vh] overflow-y-auto">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Doctor Type</label>
                    <select
                      value={doctorTypeFilter}
                      onChange={(e) => setDoctorTypeFilter(e.target.value as 'all' | 'general' | 'specialist')}
                      className="mt-1 w-full px-3 py-2 border rounded-lg bg-background hover:bg-muted transition-colors cursor-pointer text-sm"
                    >
                      <option value="all">All Doctors</option>
                      <option value="general">General Practice</option>
                      <option value="specialist">Specialists</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Specialty</label>
                    <select
                      value={filters.specialty}
                      onChange={(e) => setFilters({ ...filters, specialty: e.target.value })}
                      className="mt-1 w-full px-3 py-2 border rounded-lg bg-background hover:bg-muted transition-colors cursor-pointer text-sm"
                    >
                      <option value="">All Specialties</option>
                      {specialties.map(specialty => (
                        <option key={specialty} value={specialty}>{specialty}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Consultation Language</label>
                    <select
                      value={filters.consultationLanguage}
                      onChange={(e) => setFilters({ ...filters, consultationLanguage: e.target.value })}
                      className="mt-1 w-full px-3 py-2 border rounded-lg bg-background hover:bg-muted transition-colors cursor-pointer text-sm"
                    >
                      <option value="">Any Language</option>
                      {consultationLanguageOptions.map((languageOption) => (
                        <option key={languageOption.value} value={languageOption.value}>
                          {languageOption.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Minimum Rating</label>
                      <select
                        value={filters.minRating}
                        onChange={(e) => setFilters({ ...filters, minRating: parseFloat(e.target.value) })}
                        className="mt-1 w-full px-3 py-2 border rounded-lg bg-background hover:bg-muted transition-colors cursor-pointer text-sm"
                      >
                        <option value={0}>Any Rating</option>
                        <option value={3}>3+ ⭐</option>
                        <option value={4}>4+ ⭐</option>
                        <option value={4.5}>4.5+ ⭐</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Experience</label>
                      <select
                        value={filters.experienceRange}
                        onChange={(e) => setFilters({ ...filters, experienceRange: e.target.value })}
                        className="mt-1 w-full px-3 py-2 border rounded-lg bg-background hover:bg-muted transition-colors cursor-pointer text-sm"
                      >
                        <option value="">Any Experience</option>
                        <option value="2-5">2 - 5 Years</option>
                        <option value="5-10">5 - 10 Years</option>
                        <option value="10+">10+ Years</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-muted-foreground">State</label>
                    <select
                      value={filters.state}
                      onChange={(e) => setFilters({ ...filters, state: e.target.value })}
                      className="mt-1 w-full px-3 py-2 border rounded-lg bg-background hover:bg-muted transition-colors cursor-pointer text-sm"
                    >
                      <option value="">All States</option>
                      {states.map((stateValue) => (
                        <option key={stateValue} value={stateValue}>{stateValue}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Hospital</label>
                    <select
                      value={filters.hospital}
                      onChange={(e) => setFilters({ ...filters, hospital: e.target.value })}
                      className="mt-1 w-full px-3 py-2 border rounded-lg bg-background hover:bg-muted transition-colors cursor-pointer text-sm"
                    >
                      <option value="">All Hospitals</option>
                      {hospitals.map(hospital => (
                        <option key={hospital} value={hospital}>{hospital}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2 rounded-lg border border-border p-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={availabilityMode === 'now'}
                        onChange={(e) => setAvailabilityMode(e.target.checked ? 'now' : 'none')}
                        className="w-4 h-4 cursor-pointer"
                      />
                      <span className="text-sm font-medium">Available Now</span>
                    </label>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setMobileFiltersOpen(false);
                        setShowAvailabilityDialog(true);
                      }}
                      className="w-full justify-start gap-2"
                    >
                      <Clock className="w-4 h-4" />
                      {getAvailabilityFilterText() || 'Choose date/time'}
                    </Button>
                    {(availabilityMode === 'exact' || availabilityMode === 'range') && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setAvailabilityMode('none');
                          setAvailabilityFilters({ date: '', time: '', startDate: '', startTime: '', endDate: '', endTime: '' });
                        }}
                        className="w-full justify-start text-xs"
                      >
                        Clear date/time filter
                      </Button>
                    )}
                  </div>
                </div>

                <div className="border-t border-border px-4 py-3 flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={clearAllFilters}
                  >
                    Clear All
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={() => setMobileFiltersOpen(false)}
                  >
                    Show {filteredDoctors.length}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            {/* Sticky Filter Bar */}
            <div className={`hidden md:block sticky top-12 z-30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-y border-border py-4 mb-6 -mx-4 px-4 transition-transform duration-300 ${showFilters ? 'translate-y-0' : '-translate-y-full'}`}>
              <div className="space-y-4">
                {/* Primary Filters */}
                <div className="flex flex-wrap gap-3">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search doctors, specialties..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  
                  <select
                    value={doctorTypeFilter}
                    onChange={(e) => setDoctorTypeFilter(e.target.value as 'all' | 'general' | 'specialist')}
                    className="px-4 py-2 border rounded-lg bg-background hover:bg-muted transition-colors cursor-pointer"
                  >
                    <option value="all">All Doctors</option>
                    <option value="general">General Practice</option>
                    <option value="specialist">Specialists</option>
                  </select>

                  <select
                    value={filters.specialty}
                    onChange={(e) => setFilters({ ...filters, specialty: e.target.value })}
                    className="px-4 py-2 border rounded-lg bg-background hover:bg-muted transition-colors cursor-pointer"
                  >
                    <option value="">All Specialties</option>
                    {specialties.map(specialty => (
                      <option key={specialty} value={specialty}>{formatSpecialtyLabel(specialty)}</option>
                    ))}
                  </select>

                  <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:bg-muted transition-colors cursor-pointer">
                    <input
                      type="checkbox"
                      checked={availabilityMode === 'now'}
                      onChange={(e) => setAvailabilityMode(e.target.checked ? 'now' : 'none')}
                      className="w-4 h-4 cursor-pointer"
                    />
                    <span className="text-sm font-medium">Available Now</span>
                  </label>

                  <Button
                    variant="outline"
                    size="default"
                    onClick={() => setShowAvailabilityDialog(true)}
                    className="gap-2"
                  >
                    <Clock className="w-4 h-4" />
                    {getAvailabilityFilterText() || 'Availability'}
                  </Button>
                </div>

                {/* Secondary Filters */}
                <div className="flex flex-wrap gap-3 items-center">
                  <select
                    value={filters.minRating}
                    onChange={(e) => setFilters({ ...filters, minRating: parseFloat(e.target.value) })}
                    className="px-3 py-2 border rounded-lg bg-background hover:bg-muted transition-colors cursor-pointer text-sm"
                  >
                    <option value={0}>Any Rating</option>
                    <option value={3}>3+ ⭐</option>
                    <option value={4}>4+ ⭐</option>
                    <option value={4.5}>4.5+ ⭐</option>
                  </select>

                  <select
                    value={filters.experienceRange}
                    onChange={(e) => setFilters({ ...filters, experienceRange: e.target.value })}
                    className="px-3 py-2 border rounded-lg bg-background hover:bg-muted transition-colors cursor-pointer text-sm"
                  >
                    <option value="">Any Experience</option>
                    <option value="2-5">2 - 5 Years</option>
                    <option value="5-10">5 - 10 Years</option>
                    <option value="10+">10+ Years</option>
                  </select>

                  <select
                    value={filters.state}
                    onChange={(e) => setFilters({ ...filters, state: e.target.value })}
                    className="px-3 py-2 border rounded-lg bg-background hover:bg-muted transition-colors cursor-pointer text-sm"
                  >
                    <option value="">All States</option>
                    {states.map((stateValue) => (
                      <option key={stateValue} value={stateValue}>{stateValue}</option>
                    ))}
                  </select>

                  <select
                    value={filters.hospital}
                    onChange={(e) => setFilters({ ...filters, hospital: e.target.value })}
                    className="px-3 py-2 border rounded-lg bg-background hover:bg-muted transition-colors cursor-pointer text-sm"
                  >
                    <option value="">All Hospitals</option>
                    {hospitals.map(hospital => (
                      <option key={hospital} value={hospital}>{hospital}</option>
                    ))}
                  </select>

                  <select
                    value={filters.consultationLanguage}
                    onChange={(e) => setFilters({ ...filters, consultationLanguage: e.target.value })}
                    className="px-3 py-2 border rounded-lg bg-background hover:bg-muted transition-colors cursor-pointer text-sm"
                  >
                    <option value="">Any Language</option>
                    {consultationLanguageOptions.map((languageOption) => (
                      <option key={languageOption.value} value={languageOption.value}>
                        {languageOption.label}
                      </option>
                    ))}
                  </select>

                  {(availabilityMode === 'exact' || availabilityMode === 'range') && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setAvailabilityMode('none');
                        setAvailabilityFilters({ date: '', time: '', startDate: '', startTime: '', endDate: '', endTime: '' });
                      }}
                      className="gap-1"
                    >
                      <span>Clear Date Filter</span>
                      <span className="text-lg">✕</span>
                    </Button>
                  )}

                  {hasAnyActiveControls && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearAllFilters}
                      className="gap-1 text-destructive hover:text-destructive"
                    >
                      <Filter className="w-4 h-4" />
                      Clear All
                    </Button>
                  )}
                </div>

                {/* Results Count */}
                <div className="flex items-center justify-between text-sm">
                  <p className="text-muted-foreground">
                    <span className="font-semibold text-foreground">{filteredDoctors.length}</span> doctors found
                  </p>
                </div>
              </div>
            </div>

            {/* Doctor Cards */}
            {doctorsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : filteredDoctors.length === 0 ? (
              <Card className="text-center py-12">
                <CardContent>
                  <Search className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-lg font-semibold mb-2">No doctors found</p>
                  <p className="text-muted-foreground mb-4">Try adjusting your filters or search query</p>
                  <Button
                    variant="outline"
                    onClick={clearAllFilters}
                  >
                    Clear All Filters
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid md:grid-cols-3 gap-6">
                {filteredDoctors.map(doctor => {
                  const localizedDoctorBio = getLocalizedDoctorBio(doctor);
                  const isGeneralPracticeDoctor = isGeneralPracticeSpecialty(doctor.specialty || '');
                  const startingPrice = getStartingPriceForDoctor(doctor);
                  const pricingVariationMessage = getPricingVariationMessage(doctor);
                  return (
                    <motion.div
                      key={doctor.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      <Card className={`h-full flex flex-col hover:shadow-lg transition-shadow ${!doctor.is_active ? 'opacity-60' : ''}`}>
                        <CardContent className="p-6 flex-1 flex flex-col">
                          <div className="flex items-start justify-between mb-4">
                              <div className="relative">
                                <Avatar className="w-20 h-20 border border-border shadow-sm">
                                  <AvatarImage src={doctor.profile_picture_url} className="object-cover object-top" />
                                  <AvatarFallback className="bg-primary/10 text-primary text-xl">
                                    {doctor.full_name.split(' ').map(n => n[0]).join('')}
                                  </AvatarFallback>
                                </Avatar>
                                <div className={`absolute bottom-0 right-0 w-4 h-4 rounded-full ${getStatusColor(doctor.online_status).bg} ring-2 ring-white z-10`} title={getStatusColor(doctor.online_status).text} />
                              </div>                              <div className="flex gap-2 flex-col">
                                <Badge variant="outline" className="text-xs">
                                  {doctor.experience_years
                                    ? `${doctor.experience_years}y exp`
                                    : `${t('specialists.card.experience', 'Experience')} ${t('specialists.defaults.notAvailable', 'N/A')}`}
                                </Badge>
                                <Badge className="text-xs bg-blue-100 text-blue-800">
                                  {isGeneralPracticeDoctor ? 'General' : 'Specialist'}
                                </Badge>
                                {!doctor.is_active && (
                                  <Badge className="text-xs bg-destructive/10 text-destructive border-destructive/20">
                                    Unavailable
                                  </Badge>
                                )}
                              </div>
                            </div>

                            <h3 className="font-bold text-lg mb-1">{formatDoctorName(doctor.full_name)}</h3>
                            <p className="text-sm text-primary font-medium mb-2">{formatSpecialtyLabel(doctor.specialty)}</p>
                            {localizedDoctorBio && (
                              <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{localizedDoctorBio}</p>
                            )}
                            {doctor.preferred_consultation_languages && doctor.preferred_consultation_languages.length > 0 && (
                              <div className="mb-3">
                                <p className="text-xs text-muted-foreground mb-2">Consultation Languages</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {doctor.preferred_consultation_languages.slice(0, 3).map((language, index) => (
                                    <Badge key={`${doctor.id}-language-${language}-${index}`} variant="secondary" className="text-[11px]">
                                      {formatConsultationLanguageLabel(language)}
                                    </Badge>
                                  ))}
                                  {doctor.preferred_consultation_languages.length > 3 && (
                                    <Badge variant="outline" className="text-[11px]">
                                      +{doctor.preferred_consultation_languages.length - 3}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            )}

                            <div className="space-y-2 mb-4 flex-1">
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <MapPin className="w-4 h-4" />
                                {doctor.city}, {doctor.state}
                              </div>
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Award className="w-4 h-4" />
                                {doctor.hospital_affiliation}
                              </div>
                            </div>

                            {doctor.rating !== undefined && (
                              <div className="flex items-center gap-2 mb-4">
                                <div className="flex gap-1">
                                  {renderStars(doctor.rating)}
                                </div>
                                <span className="text-sm font-medium">{doctor.rating?.toFixed(1)}</span>
                                <span className="text-xs text-muted-foreground">({doctor.total_reviews})</span>
                              </div>
                            )}

                            <div className="mb-4 p-3 rounded-lg bg-success/10 border border-success/20">
                              <p className="text-sm font-semibold text-success">
                                {`From ${formatCurrency(startingPrice, discoveryStartingPrices.currency)}`}
                              </p>
                              <p className="text-xs text-muted-foreground">{pricingVariationMessage}</p>
                            </div>

                            <div className="flex gap-2 pt-4 border-t">
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex-1"
                                onClick={() => handleViewProfile(doctor)}
                                disabled={!doctor.is_active}
                              >
                                View Profile
                              </Button>
                              <Button
                                size="sm"
                                className="flex-1"
                                onClick={() => handleBookNow(doctor)}
                                disabled={!doctor.is_active}
                              >
                                {doctor.is_active ? 'Book Now' : 'Unavailable'}
                              </Button>
                            </div>
                          </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </motion.div>
        </div>

        {/* Doctor Profile Modal */}
        <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            {selectedDoctor && (
              <>
                <DialogHeader>
                  <DialogTitle>Doctor Profile</DialogTitle>
                </DialogHeader>

                <div className="space-y-6">
                  {/* Header */}
                  <div className="flex flex-col sm:flex-row gap-6">
                    <div className="relative mx-auto sm:mx-0">
                      <Avatar className="w-28 h-28 border-2 border-primary/10 shadow-md">
                        <AvatarImage src={selectedDoctor.profile_picture_url} className="object-cover object-top" />
                        <AvatarFallback className="bg-primary/10 text-primary text-3xl">
                          {selectedDoctor.full_name.split(' ').map(n => n[0]).join('')}
                        </AvatarFallback>
                      </Avatar>
                      <div className={`absolute bottom-0 right-1 w-6 h-6 rounded-full ${getStatusColor(selectedDoctor.online_status).bg} ring-2 ring-white z-10`} title={getStatusColor(selectedDoctor.online_status).text} />
                    </div>
                    <div className="flex-1 text-center sm:text-left">
                      <div className="flex flex-col sm:flex-row items-center sm:items-baseline gap-2 mb-2">
                        <h2 className="text-2xl font-bold">{formatDoctorName(selectedDoctor.full_name)}</h2>
                        <Badge variant="outline" className="text-xs">{getStatusColor(selectedDoctor.online_status).text}</Badge>
                      </div>
                        <p className="text-lg text-primary font-medium mb-3">{formatSpecialtyLabel(selectedDoctor.specialty)}</p>
                        {selectedDoctor.preferred_consultation_languages && selectedDoctor.preferred_consultation_languages.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-3">
                          {selectedDoctor.preferred_consultation_languages.map((language, index) => (
                            <Badge key={`profile-language-${language}-${index}`} variant="secondary" className="text-xs">
                              {formatConsultationLanguageLabel(language)}
                            </Badge>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center gap-4 mb-4">
                        {selectedDoctor.rating !== undefined && (
                          <div className="flex items-center gap-2">
                            <div className="flex gap-1">
                              {renderStars(selectedDoctor.rating)}
                            </div>
                            <span className="font-medium">{selectedDoctor.rating?.toFixed(1)}</span>
                            <span className="text-sm text-muted-foreground">({selectedDoctor.total_reviews} reviews)</span>
                          </div>
                        )}
                      </div>

                      <Badge className="bg-success/10 text-success border-success/20">Verified Doctor</Badge>
                    </div>
                  </div>

                  {/* Info Grid */}
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-lg bg-muted/50">
                      <p className="text-sm text-muted-foreground mb-1">Experience</p>
                      <p className="font-semibold">{selectedDoctor.experience_years ? `${selectedDoctor.experience_years} Years` : 'Not specified'}</p>
                    </div>
                    <div className="p-4 rounded-lg bg-muted/50">
                      <p className="text-sm text-muted-foreground mb-1">Hospital</p>
                      <p className="font-semibold text-sm">{selectedDoctor.hospital_affiliation}</p>
                    </div>
                    <div className="p-4 rounded-lg bg-muted/50">
                      <p className="text-sm text-muted-foreground mb-1">Location</p>
                      <p className="font-semibold">{selectedDoctor.city}, {selectedDoctor.state}</p>
                    </div>
                  </div>

                  {/* Biography */}
                  <div>
                    <h3 className="font-semibold mb-3">Professional Biography</h3>
                    <p className="text-muted-foreground leading-relaxed">
                        {getLocalizedDoctorBio(selectedDoctor) || `Dr. ${selectedDoctor.full_name} is a highly skilled ${formatSpecialtyLabel(selectedDoctor.specialty)} with ${selectedDoctor.experience_years ?? 'several'} years of professional experience. Currently practicing at ${selectedDoctor.hospital_affiliation}, dedicated to providing excellent patient care and maintaining the highest standards of medical practice.`}
                    </p>
                  </div>

                  {/* Reviews Section */}
                  <div>
                    <h3 className="font-semibold mb-3">Recent Reviews</h3>
                    <div className="space-y-3">
                      <div className="p-4 rounded-lg border border-border">
                        <div className="flex items-start justify-between mb-2">
                          <p className="font-medium">Patient Name</p>
                          <div className="flex gap-1">
                            {renderStars(5, 5)}
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground">Professional and caring doctor. Highly recommended.</p>
                        <p className="text-xs text-muted-foreground mt-2">2 weeks ago</p>
                      </div>
                      <p className="text-center text-sm text-muted-foreground py-4">View full reviews after booking</p>
                    </div>
                  </div>

                  {/* Availability */}
                  <div>
                    <h3 className="font-semibold mb-3">Availability</h3>
                    <Button
                      className="w-full"
                      onClick={() => {
                        setProfileOpen(false);
                        handleBookNow(selectedDoctor!);
                      }}
                    >
                      Select Available Time Slot
                    </Button>
                  </div>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Availability Selection Dialog */}
        <Dialog open={showAvailabilityDialog} onOpenChange={setShowAvailabilityDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Select Date & Time</DialogTitle>
              <DialogDescription>
                Choose when you'd like to see a doctor
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Specific Date & Time */}
              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="radio"
                    checked={availabilityMode === 'exact'}
                    onChange={() => setAvailabilityMode('exact')}
                    className="w-4 h-4"
                  />
                  <span className="font-medium">Specific date & time</span>
                </label>
                {availabilityMode === 'exact' && (
                  <div className="ml-7">
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="text-xs text-muted-foreground mb-1 block">Date</label>
                        <Input
                          type="date"
                          value={availabilityFilters.date}
                          onChange={(e) => setAvailabilityFilters({ ...availabilityFilters, date: e.target.value })}
                          className="px-3 py-2"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="text-xs text-muted-foreground mb-1 block">Time</label>
                        <Input
                          type="time"
                          step={1800}
                          value={availabilityFilters.time}
                          onChange={(e) => setAvailabilityFilters({ ...availabilityFilters, time: e.target.value })}
                          className="px-3 py-2"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Date & Time Range */}
              <div className="space-y-3 pt-4 border-t">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="radio"
                    checked={availabilityMode === 'range'}
                    onChange={() => setAvailabilityMode('range')}
                    className="w-4 h-4"
                  />
                  <span className="font-medium">Date & time range</span>
                </label>
                {availabilityMode === 'range' && (
                  <div className="ml-7 space-y-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">From</label>
                      <div className="flex gap-2">
                        <Input
                          type="date"
                          value={availabilityFilters.startDate}
                          onChange={(e) => setAvailabilityFilters({ ...availabilityFilters, startDate: e.target.value })}
                          className="px-3 py-2 flex-1"
                        />
                        <Input
                          type="time"
                          step={1800}
                          value={availabilityFilters.startTime}
                          onChange={(e) => setAvailabilityFilters({ ...availabilityFilters, startTime: e.target.value })}
                          className="px-3 py-2 flex-1"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">To (optional)</label>
                      <div className="flex gap-2">
                        <Input
                          type="date"
                          value={availabilityFilters.endDate}
                          onChange={(e) => setAvailabilityFilters({ ...availabilityFilters, endDate: e.target.value })}
                          className="px-3 py-2 flex-1"
                        />
                        <Input
                          type="time"
                          step={1800}
                          value={availabilityFilters.endTime}
                          onChange={(e) => setAvailabilityFilters({ ...availabilityFilters, endTime: e.target.value })}
                          className="px-3 py-2 flex-1"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowAvailabilityDialog(false)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={() => setShowAvailabilityDialog(false)}
                disabled={
                  (availabilityMode === 'exact' && (!availabilityFilters.date || !availabilityFilters.time)) ||
                  (availabilityMode === 'range' && (!availabilityFilters.startDate || !availabilityFilters.startTime))
                }
              >
                Apply Filter
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
