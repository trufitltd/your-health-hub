import { useRef, useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Stethoscope, Mail, Lock, User, Eye, EyeOff, ArrowRight, Check, Phone, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/use-toast';
import { createDefaultSchedule } from '@/services/scheduleService';
import logoImage from '@/assets/MyE-DoctorLogo.png';
import { useLocaleFormatter } from '@/lib/locale';
import { useLanguage } from '@/contexts/LanguageContext';
import { useActivePatientPromotion } from '@/hooks/useActivePatientPromotion';

type AuthMode = 'login' | 'register' | 'verify' | 'reset';
type UserRole = 'patient' | 'doctor' | 'agent';
type SignInRole = UserRole | 'healthlink';
type CountryPhoneCode = { iso: string; name: string; dialCode: string };
import { MIN_SPECIALIST_RATE_NGN } from '@/services/marketplaceTypes';

const COUNTRY_PHONE_CODES: CountryPhoneCode[] = [
  { iso: 'AF', name: 'Afghanistan', dialCode: '+93' },
  { iso: 'AL', name: 'Albania', dialCode: '+355' },
  { iso: 'DZ', name: 'Algeria', dialCode: '+213' },
  { iso: 'AD', name: 'Andorra', dialCode: '+376' },
  { iso: 'AO', name: 'Angola', dialCode: '+244' },
  { iso: 'AR', name: 'Argentina', dialCode: '+54' },
  { iso: 'AM', name: 'Armenia', dialCode: '+374' },
  { iso: 'AU', name: 'Australia', dialCode: '+61' },
  { iso: 'AT', name: 'Austria', dialCode: '+43' },
  { iso: 'AZ', name: 'Azerbaijan', dialCode: '+994' },
  { iso: 'BH', name: 'Bahrain', dialCode: '+973' },
  { iso: 'BD', name: 'Bangladesh', dialCode: '+880' },
  { iso: 'BY', name: 'Belarus', dialCode: '+375' },
  { iso: 'BE', name: 'Belgium', dialCode: '+32' },
  { iso: 'BZ', name: 'Belize', dialCode: '+501' },
  { iso: 'BJ', name: 'Benin', dialCode: '+229' },
  { iso: 'BT', name: 'Bhutan', dialCode: '+975' },
  { iso: 'BO', name: 'Bolivia', dialCode: '+591' },
  { iso: 'BA', name: 'Bosnia and Herzegovina', dialCode: '+387' },
  { iso: 'BW', name: 'Botswana', dialCode: '+267' },
  { iso: 'BR', name: 'Brazil', dialCode: '+55' },
  { iso: 'BN', name: 'Brunei', dialCode: '+673' },
  { iso: 'BG', name: 'Bulgaria', dialCode: '+359' },
  { iso: 'BF', name: 'Burkina Faso', dialCode: '+226' },
  { iso: 'BI', name: 'Burundi', dialCode: '+257' },
  { iso: 'KH', name: 'Cambodia', dialCode: '+855' },
  { iso: 'CM', name: 'Cameroon', dialCode: '+237' },
  { iso: 'CA', name: 'Canada', dialCode: '+1' },
  { iso: 'CV', name: 'Cape Verde', dialCode: '+238' },
  { iso: 'CF', name: 'Central African Republic', dialCode: '+236' },
  { iso: 'TD', name: 'Chad', dialCode: '+235' },
  { iso: 'CL', name: 'Chile', dialCode: '+56' },
  { iso: 'CN', name: 'China', dialCode: '+86' },
  { iso: 'CO', name: 'Colombia', dialCode: '+57' },
  { iso: 'KM', name: 'Comoros', dialCode: '+269' },
  { iso: 'CG', name: 'Congo', dialCode: '+242' },
  { iso: 'CD', name: 'Congo (DRC)', dialCode: '+243' },
  { iso: 'CR', name: 'Costa Rica', dialCode: '+506' },
  { iso: 'CI', name: "Cote d'Ivoire", dialCode: '+225' },
  { iso: 'HR', name: 'Croatia', dialCode: '+385' },
  { iso: 'CU', name: 'Cuba', dialCode: '+53' },
  { iso: 'CY', name: 'Cyprus', dialCode: '+357' },
  { iso: 'CZ', name: 'Czech Republic', dialCode: '+420' },
  { iso: 'DK', name: 'Denmark', dialCode: '+45' },
  { iso: 'DJ', name: 'Djibouti', dialCode: '+253' },
  { iso: 'DO', name: 'Dominican Republic', dialCode: '+1' },
  { iso: 'EC', name: 'Ecuador', dialCode: '+593' },
  { iso: 'EG', name: 'Egypt', dialCode: '+20' },
  { iso: 'SV', name: 'El Salvador', dialCode: '+503' },
  { iso: 'GQ', name: 'Equatorial Guinea', dialCode: '+240' },
  { iso: 'ER', name: 'Eritrea', dialCode: '+291' },
  { iso: 'EE', name: 'Estonia', dialCode: '+372' },
  { iso: 'SZ', name: 'Eswatini', dialCode: '+268' },
  { iso: 'ET', name: 'Ethiopia', dialCode: '+251' },
  { iso: 'FJ', name: 'Fiji', dialCode: '+679' },
  { iso: 'FI', name: 'Finland', dialCode: '+358' },
  { iso: 'FR', name: 'France', dialCode: '+33' },
  { iso: 'GA', name: 'Gabon', dialCode: '+241' },
  { iso: 'GM', name: 'Gambia', dialCode: '+220' },
  { iso: 'GE', name: 'Georgia', dialCode: '+995' },
  { iso: 'DE', name: 'Germany', dialCode: '+49' },
  { iso: 'GH', name: 'Ghana', dialCode: '+233' },
  { iso: 'GR', name: 'Greece', dialCode: '+30' },
  { iso: 'GT', name: 'Guatemala', dialCode: '+502' },
  { iso: 'GN', name: 'Guinea', dialCode: '+224' },
  { iso: 'GW', name: 'Guinea-Bissau', dialCode: '+245' },
  { iso: 'GY', name: 'Guyana', dialCode: '+592' },
  { iso: 'HT', name: 'Haiti', dialCode: '+509' },
  { iso: 'HN', name: 'Honduras', dialCode: '+504' },
  { iso: 'HK', name: 'Hong Kong', dialCode: '+852' },
  { iso: 'HU', name: 'Hungary', dialCode: '+36' },
  { iso: 'IS', name: 'Iceland', dialCode: '+354' },
  { iso: 'IN', name: 'India', dialCode: '+91' },
  { iso: 'ID', name: 'Indonesia', dialCode: '+62' },
  { iso: 'IR', name: 'Iran', dialCode: '+98' },
  { iso: 'IQ', name: 'Iraq', dialCode: '+964' },
  { iso: 'IE', name: 'Ireland', dialCode: '+353' },
  { iso: 'IL', name: 'Israel', dialCode: '+972' },
  { iso: 'IT', name: 'Italy', dialCode: '+39' },
  { iso: 'JM', name: 'Jamaica', dialCode: '+1' },
  { iso: 'JP', name: 'Japan', dialCode: '+81' },
  { iso: 'JO', name: 'Jordan', dialCode: '+962' },
  { iso: 'KZ', name: 'Kazakhstan', dialCode: '+7' },
  { iso: 'KE', name: 'Kenya', dialCode: '+254' },
  { iso: 'KI', name: 'Kiribati', dialCode: '+686' },
  { iso: 'KW', name: 'Kuwait', dialCode: '+965' },
  { iso: 'KG', name: 'Kyrgyzstan', dialCode: '+996' },
  { iso: 'LA', name: 'Laos', dialCode: '+856' },
  { iso: 'LV', name: 'Latvia', dialCode: '+371' },
  { iso: 'LB', name: 'Lebanon', dialCode: '+961' },
  { iso: 'LS', name: 'Lesotho', dialCode: '+266' },
  { iso: 'LR', name: 'Liberia', dialCode: '+231' },
  { iso: 'LY', name: 'Libya', dialCode: '+218' },
  { iso: 'LI', name: 'Liechtenstein', dialCode: '+423' },
  { iso: 'LT', name: 'Lithuania', dialCode: '+370' },
  { iso: 'LU', name: 'Luxembourg', dialCode: '+352' },
  { iso: 'MO', name: 'Macau', dialCode: '+853' },
  { iso: 'MG', name: 'Madagascar', dialCode: '+261' },
  { iso: 'MW', name: 'Malawi', dialCode: '+265' },
  { iso: 'MY', name: 'Malaysia', dialCode: '+60' },
  { iso: 'MV', name: 'Maldives', dialCode: '+960' },
  { iso: 'ML', name: 'Mali', dialCode: '+223' },
  { iso: 'MT', name: 'Malta', dialCode: '+356' },
  { iso: 'MH', name: 'Marshall Islands', dialCode: '+692' },
  { iso: 'MR', name: 'Mauritania', dialCode: '+222' },
  { iso: 'MU', name: 'Mauritius', dialCode: '+230' },
  { iso: 'MX', name: 'Mexico', dialCode: '+52' },
  { iso: 'FM', name: 'Micronesia', dialCode: '+691' },
  { iso: 'MD', name: 'Moldova', dialCode: '+373' },
  { iso: 'MC', name: 'Monaco', dialCode: '+377' },
  { iso: 'MN', name: 'Mongolia', dialCode: '+976' },
  { iso: 'ME', name: 'Montenegro', dialCode: '+382' },
  { iso: 'MA', name: 'Morocco', dialCode: '+212' },
  { iso: 'MZ', name: 'Mozambique', dialCode: '+258' },
  { iso: 'MM', name: 'Myanmar', dialCode: '+95' },
  { iso: 'NA', name: 'Namibia', dialCode: '+264' },
  { iso: 'NR', name: 'Nauru', dialCode: '+674' },
  { iso: 'NP', name: 'Nepal', dialCode: '+977' },
  { iso: 'NL', name: 'Netherlands', dialCode: '+31' },
  { iso: 'NZ', name: 'New Zealand', dialCode: '+64' },
  { iso: 'NI', name: 'Nicaragua', dialCode: '+505' },
  { iso: 'NE', name: 'Niger', dialCode: '+227' },
  { iso: 'NG', name: 'Nigeria', dialCode: '+234' },
  { iso: 'KP', name: 'North Korea', dialCode: '+850' },
  { iso: 'MK', name: 'North Macedonia', dialCode: '+389' },
  { iso: 'NO', name: 'Norway', dialCode: '+47' },
  { iso: 'OM', name: 'Oman', dialCode: '+968' },
  { iso: 'PK', name: 'Pakistan', dialCode: '+92' },
  { iso: 'PW', name: 'Palau', dialCode: '+680' },
  { iso: 'PS', name: 'Palestine', dialCode: '+970' },
  { iso: 'PA', name: 'Panama', dialCode: '+507' },
  { iso: 'PG', name: 'Papua New Guinea', dialCode: '+675' },
  { iso: 'PY', name: 'Paraguay', dialCode: '+595' },
  { iso: 'PE', name: 'Peru', dialCode: '+51' },
  { iso: 'PH', name: 'Philippines', dialCode: '+63' },
  { iso: 'PL', name: 'Poland', dialCode: '+48' },
  { iso: 'PT', name: 'Portugal', dialCode: '+351' },
  { iso: 'QA', name: 'Qatar', dialCode: '+974' },
  { iso: 'RO', name: 'Romania', dialCode: '+40' },
  { iso: 'RU', name: 'Russia', dialCode: '+7' },
  { iso: 'RW', name: 'Rwanda', dialCode: '+250' },
  { iso: 'KN', name: 'Saint Kitts and Nevis', dialCode: '+1' },
  { iso: 'LC', name: 'Saint Lucia', dialCode: '+1' },
  { iso: 'VC', name: 'Saint Vincent and the Grenadines', dialCode: '+1' },
  { iso: 'WS', name: 'Samoa', dialCode: '+685' },
  { iso: 'SM', name: 'San Marino', dialCode: '+378' },
  { iso: 'ST', name: 'Sao Tome and Principe', dialCode: '+239' },
  { iso: 'SA', name: 'Saudi Arabia', dialCode: '+966' },
  { iso: 'SN', name: 'Senegal', dialCode: '+221' },
  { iso: 'RS', name: 'Serbia', dialCode: '+381' },
  { iso: 'SC', name: 'Seychelles', dialCode: '+248' },
  { iso: 'SL', name: 'Sierra Leone', dialCode: '+232' },
  { iso: 'SG', name: 'Singapore', dialCode: '+65' },
  { iso: 'SK', name: 'Slovakia', dialCode: '+421' },
  { iso: 'SI', name: 'Slovenia', dialCode: '+386' },
  { iso: 'SB', name: 'Solomon Islands', dialCode: '+677' },
  { iso: 'SO', name: 'Somalia', dialCode: '+252' },
  { iso: 'ZA', name: 'South Africa', dialCode: '+27' },
  { iso: 'KR', name: 'South Korea', dialCode: '+82' },
  { iso: 'SS', name: 'South Sudan', dialCode: '+211' },
  { iso: 'ES', name: 'Spain', dialCode: '+34' },
  { iso: 'LK', name: 'Sri Lanka', dialCode: '+94' },
  { iso: 'SD', name: 'Sudan', dialCode: '+249' },
  { iso: 'SR', name: 'Suriname', dialCode: '+597' },
  { iso: 'SE', name: 'Sweden', dialCode: '+46' },
  { iso: 'CH', name: 'Switzerland', dialCode: '+41' },
  { iso: 'SY', name: 'Syria', dialCode: '+963' },
  { iso: 'TW', name: 'Taiwan', dialCode: '+886' },
  { iso: 'TJ', name: 'Tajikistan', dialCode: '+992' },
  { iso: 'TZ', name: 'Tanzania', dialCode: '+255' },
  { iso: 'TH', name: 'Thailand', dialCode: '+66' },
  { iso: 'TL', name: 'Timor-Leste', dialCode: '+670' },
  { iso: 'TG', name: 'Togo', dialCode: '+228' },
  { iso: 'TO', name: 'Tonga', dialCode: '+676' },
  { iso: 'TT', name: 'Trinidad and Tobago', dialCode: '+1' },
  { iso: 'TN', name: 'Tunisia', dialCode: '+216' },
  { iso: 'TR', name: 'Turkey', dialCode: '+90' },
  { iso: 'TM', name: 'Turkmenistan', dialCode: '+993' },
  { iso: 'TV', name: 'Tuvalu', dialCode: '+688' },
  { iso: 'UG', name: 'Uganda', dialCode: '+256' },
  { iso: 'UA', name: 'Ukraine', dialCode: '+380' },
  { iso: 'AE', name: 'United Arab Emirates', dialCode: '+971' },
  { iso: 'GB', name: 'United Kingdom', dialCode: '+44' },
  { iso: 'US', name: 'United States', dialCode: '+1' },
  { iso: 'UY', name: 'Uruguay', dialCode: '+598' },
  { iso: 'UZ', name: 'Uzbekistan', dialCode: '+998' },
  { iso: 'VU', name: 'Vanuatu', dialCode: '+678' },
  { iso: 'VA', name: 'Vatican City', dialCode: '+379' },
  { iso: 'VE', name: 'Venezuela', dialCode: '+58' },
  { iso: 'VN', name: 'Vietnam', dialCode: '+84' },
  { iso: 'YE', name: 'Yemen', dialCode: '+967' },
  { iso: 'ZM', name: 'Zambia', dialCode: '+260' },
  { iso: 'ZW', name: 'Zimbabwe', dialCode: '+263' },
];

export default function AuthPage() {
  const { t } = useLanguage();
  const [searchParams] = useSearchParams();
  const initialMode = searchParams.get('mode') === 'register' ? 'register' : searchParams.get('mode') === 'reset' ? 'reset' : 'login';

  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [role, setRole] = useState<UserRole>('patient');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phoneCountryIso, setPhoneCountryIso] = useState('NG');
  const [phoneLocalNumber, setPhoneLocalNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [pendingUserData, setPendingUserData] = useState<any>(null);
  const [rateLimitBlockedUntil, setRateLimitBlockedUntil] = useState<number | null>(null);
  const [isCheckingDoctorSignup, setIsCheckingDoctorSignup] = useState(false);
  const [doctorSignupBlockedMessage, setDoctorSignupBlockedMessage] = useState('');
  const [isCheckingPatientSignup, setIsCheckingPatientSignup] = useState(false);
  const [patientSignupBlockedMessage, setPatientSignupBlockedMessage] = useState('');
  const handledSignupRedirectRef = useRef(false);
  const navigate = useNavigate();

  // Doctor registration fields
  const [hospitalAffiliation, setHospitalAffiliation] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [otherSpecialty, setOtherSpecialty] = useState('');
  const [doctorIdType, setDoctorIdType] = useState('');
  const [doctorIdNumber, setDoctorIdNumber] = useState('');
  const [doctorExperience, setDoctorExperience] = useState('');
  const [consultationRate, setConsultationRate] = useState('');
  const [doctorConsentAgreed, setDoctorConsentAgreed] = useState(false);
  const [consultationLanguages, setConsultationLanguages] = useState<string[]>([]);
  const { formatCurrency, formatNumber } = useLocaleFormatter();
  const { data: promotion } = useActivePatientPromotion();
  const consultationLanguageOptions = [
    { value: 'english', label: t('auth.values.languages.english', 'English') },
    { value: 'hausa', label: t('auth.values.languages.hausa', 'Hausa') },
    { value: 'igbo', label: t('auth.values.languages.igbo', 'Igbo') },
    { value: 'yoruba', label: t('auth.values.languages.yoruba', 'Yoruba') },
    { value: 'arabic', label: t('auth.values.languages.arabic', 'Arabic') },
    { value: 'swahili', label: t('auth.values.languages.swahili', 'Swahili') },
    { value: 'fulfulde', label: t('auth.values.languages.fulfulde', 'Fulfulde') },
    { value: 'tiv', label: t('auth.values.languages.tiv', 'Tiv') },
    { value: 'pidgin_english', label: t('auth.values.languages.pidgin_english', 'Pidgin English') },
    { value: 'french', label: t('auth.values.languages.french', 'French') },
    { value: 'spanish', label: t('auth.values.languages.spanish', 'Spanish') },
    { value: 'portuguese', label: t('auth.values.languages.portuguese', 'Portuguese') },
  ];
  const benefits = [
    `${t('auth.benefits.specialistsAccessPrefix', 'Access to')} ${formatNumber(100)}+ ${t('auth.benefits.certifiedSpecialists', 'certified specialists')}`,
    t('auth.benefits.secureConsultations', 'Secure video & audio consultations'),
    t('auth.benefits.easyBooking', 'Easy appointment booking'),
    t('auth.benefits.digitalRecords', 'Digital prescriptions & records'),
  ];

  const isGeneralPracticeSpecialty = (value: string) => {
    const normalized = value.trim().toLowerCase();
    return normalized === 'general_practitioner' || normalized === 'general practitioner' || normalized === 'general practice';
  };
  const isFilled = (value: string | null | undefined) => !!String(value || '').trim();
  const parseConsultationRate = (value: string): number | null => {
    const normalized = value.replace(/,/g, '').trim();
    if (!normalized) return null;
    if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return parsed;
  };
  const selectedDoctorSpecialty = specialty === 'others' ? otherSpecialty : specialty;
  const specialistRequiresRate = !!selectedDoctorSpecialty && !isGeneralPracticeSpecialty(selectedDoctorSpecialty);
  const generalPractitionerSelected = !!selectedDoctorSpecialty && isGeneralPracticeSpecialty(selectedDoctorSpecialty);
  const parsedConsultationRate = parseConsultationRate(consultationRate);
  const selectedPhoneCountry = COUNTRY_PHONE_CODES.find((countryCode) => countryCode.iso === phoneCountryIso);
  const selectedPhoneDialCode = selectedPhoneCountry?.dialCode || '+234';
  const activeSignupBlockedMessage = role === 'doctor' ? doctorSignupBlockedMessage : patientSignupBlockedMessage;
  const promotionHeadline = promotion
    ? `Free consultation promotion ends in ${promotion.countdownText}`
    : '';
  const promotionSubtext = promotion
    ? `Offer ends on ${promotion.endDateText}. New patients must sign up and complete registration to qualify.`
    : '';

  const RATE_LIMIT_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
  const RATE_LIMIT_STORAGE_KEY = 'authRateLimitBlockedUntil';

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const value = window.localStorage.getItem(RATE_LIMIT_STORAGE_KEY);
    const parsed = value ? Number(value) : NaN;
    if (!Number.isNaN(parsed) && parsed > Date.now()) {
      setRateLimitBlockedUntil(parsed);
    }
  }, []);

  useEffect(() => {
    if (mode !== 'register') return;
    (async () => {
      const status = await getPatientSignupStatus();
      if (!status.open) {
        setPatientSignupBlockedMessage(status.message);
      }
    })();
  }, [mode]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (handledSignupRedirectRef.current) return;

    const queryMode = (searchParams.get('mode') || '').toLowerCase();
    const queryType = (searchParams.get('type') || '').toLowerCase();
    const queryVerified = searchParams.get('verified') === '1';
    const hash = window.location.hash || '';
    const hashParams = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
    const hashType = (hashParams.get('type') || '').toLowerCase();
    const isRecoveryLinkReturn = queryMode === 'reset' || queryType === 'recovery' || hashType === 'recovery';

    if (isRecoveryLinkReturn) {
      setMode('reset');
      return;
    }

    const isSignupLinkReturn = queryVerified || queryType === 'signup' || hashType === 'signup';
    if (!isSignupLinkReturn) return;

    handledSignupRedirectRef.current = true;
    (async () => {
      await supabase.auth.signOut();
      localStorage.removeItem('userRole');
      setPendingUserData(null);
      setVerificationCode('');
      setMode('login');

      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('verified');
      cleanUrl.searchParams.delete('type');
      cleanUrl.searchParams.delete('code');
      cleanUrl.searchParams.delete('token_hash');
      window.history.replaceState({}, '', `${cleanUrl.pathname}${cleanUrl.search}`);
      if (window.location.hash) {
        window.history.replaceState({}, '', `${cleanUrl.pathname}${cleanUrl.search}`);
      }

      toast({
        title: 'Email confirmed',
        description: 'Please sign in to continue.',
      });
    })();
  }, [searchParams]);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setMode('reset');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const setRateLimitBlock = (until: number) => {
    setRateLimitBlockedUntil(until);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(RATE_LIMIT_STORAGE_KEY, String(until));
    }
  };

  const getRateLimitRemainingMs = () => {
    if (!rateLimitBlockedUntil) return 0;
    return Math.max(0, rateLimitBlockedUntil - Date.now());
  };

  const formatRemaining = (ms: number) => {
    const seconds = Math.ceil(ms / 1000);
    if (seconds <= 60) return `${seconds}s`;
    const minutes = Math.ceil(seconds / 60);
    return `${minutes}m`;
  };

  const toggleConsultationLanguage = (language: string) => {
    setConsultationLanguages((prev) =>
      prev.includes(language) ? prev.filter((item) => item !== language) : [...prev, language]
    );
  };

  const getMetadataRole = (user: any): SignInRole | null => {
    const rawRole = String(user?.user_metadata?.role || user?.app_metadata?.role || '').toLowerCase();
    if (rawRole === 'doctor') return 'doctor';
    if (rawRole === 'patient') return 'patient';
    if (rawRole === 'healthlink') return 'healthlink';
    return null;
  };

  const getMetadataFullName = (user: any): string => {
    const candidate = String(user?.user_metadata?.full_name || user?.user_metadata?.name || '').trim();
    if (!candidate || candidate.includes('@')) {
      return 'User';
    }
    return candidate;
  };

  const getMetadataString = (user: any, key: string, fallback = ''): string => {
    const raw = user?.user_metadata?.[key];
    if (raw === null || raw === undefined) return fallback;
    const value = String(raw).trim();
    return value || fallback;
  };

  const getMetadataInt = (user: any, key: string, fallback: number): number => {
    const raw = user?.user_metadata?.[key];
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.floor(parsed);
  };

  const getDoctorSignupStatus = async () => {
    const fallbackMessage = 'Doctor sign up has been closed for this round and will resume soon. Please keep checking the site.';
    const { data, error } = await supabase.rpc('get_doctor_signup_status');
    if (error) {
      console.warn('Doctor signup status lookup failed:', error);
      return { open: true, message: fallbackMessage };
    }
    const row = Array.isArray(data) ? data[0] : null;
    return {
      open: row?.doctor_signup_open !== false,
      message: String(row?.doctor_signup_closed_message || '').trim() || fallbackMessage,
    };
  };

  const getPatientSignupStatus = async () => {
    const fallbackMessage = 'Patient sign up has been closed for this round and will resume soon. Please keep checking the site.';
    const { data, error } = await supabase.rpc('get_patient_signup_status');
    if (error) {
      console.warn('Patient signup status lookup failed:', error);
      return { open: true, message: fallbackMessage };
    }
    const row = Array.isArray(data) ? data[0] : null;
    return {
      open: row?.patient_signup_open !== false,
      message: String(row?.patient_signup_closed_message || '').trim() || fallbackMessage,
    };
  };

  const handleRoleSelection = async (nextRole: UserRole) => {
    if (nextRole === 'patient') {
      setIsCheckingPatientSignup(true);
      try {
        const patientSignupStatus = await getPatientSignupStatus();
        if (!patientSignupStatus.open) {
          setPatientSignupBlockedMessage(patientSignupStatus.message);
          setDoctorSignupBlockedMessage('');
          toast({
            title: 'Patient sign up is currently closed',
            description: patientSignupStatus.message,
            variant: 'destructive',
          });
          return;
        }
        setPatientSignupBlockedMessage('');
        setRole('patient');
      } finally {
        setIsCheckingPatientSignup(false);
      }
      return;
    }

    setIsCheckingDoctorSignup(true);
    try {
      const doctorSignupStatus = await getDoctorSignupStatus();
      if (!doctorSignupStatus.open) {
        setRole('doctor');
        setDoctorSignupBlockedMessage(doctorSignupStatus.message);
        setPatientSignupBlockedMessage('');
        toast({
          title: 'Doctor sign up is currently closed',
          description: doctorSignupStatus.message,
          variant: 'destructive',
        });
        return;
      }

      setDoctorSignupBlockedMessage('');
      setRole('doctor');
    } finally {
      setIsCheckingDoctorSignup(false);
    }
  };

  const ensurePatientRegistrationFallback = async (user: any) => {
    if (!user?.id) return;

    const { data: existingPatient } = await supabase
      .from('patient_registrations')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (existingPatient?.id) return;

    const fullName = getMetadataFullName(user);
    const gender = getMetadataString(user, 'gender', 'other');
    const age = getMetadataInt(user, 'age', 18);
    const phoneNumber = getMetadataString(user, 'phone_number', user.phone || 'not provided');
    const city = getMetadataString(user, 'city', 'not provided');
    const state = getMetadataString(user, 'state', 'not provided');
    const country = getMetadataString(user, 'country', 'not provided');
    const maritalStatus = getMetadataString(user, 'marital_status', 'single');
    const emergencyContactName = getMetadataString(user, 'emergency_contact_name', 'not provided');
    const emergencyContactPhone = getMetadataString(user, 'emergency_contact_phone', phoneNumber);
    const identificationType = getMetadataString(user, 'identification_type', 'hospital_id');
    const identificationNumber = getMetadataString(user, 'identification_number', user.id);
    const { error } = await supabase
      .from('patient_registrations')
      .upsert(
        [{
          user_id: user.id,
          full_name: fullName,
          gender,
          age,
          phone_number: phoneNumber,
          email: user.email || null,
          city,
          state,
          country,
          marital_status: maritalStatus,
          emergency_contact_name: emergencyContactName,
          emergency_contact_phone: emergencyContactPhone,
          identification_type: identificationType,
          identification_number: identificationNumber,
        }],
        { onConflict: 'user_id' }
      );
    if (error) {
      console.error('Failed ensuring patient registration fallback:', error);
    }
  };

  const ensureDoctorRegistrationFallback = async (user: any) => {
    if (!user?.id) return;

    const { data: existingDoctor } = await supabase
      .from('doctor_registrations')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (existingDoctor?.id) return;

    const fullName = getMetadataFullName(user);
    const gender = getMetadataString(user, 'gender', 'other');
    const age = getMetadataInt(user, 'age', 18);
    const phoneNumber = getMetadataString(user, 'phone_number', user.phone || 'not provided');
    const city = getMetadataString(user, 'city', 'not provided');
    const state = getMetadataString(user, 'state', 'not provided');
    const country = getMetadataString(user, 'country', 'not provided');
    const maritalStatus = getMetadataString(user, 'marital_status', 'single');
    const hospitalAffiliation = getMetadataString(user, 'hospital_affiliation', 'not provided');
    const specialty = getMetadataString(user, 'specialty', 'general_practitioner');
    const experience = getMetadataString(user, 'doctor_experience', 'not provided');
    const doctorIdType = getMetadataString(user, 'doctor_id_type', 'nin');
    const doctorIdNumber = getMetadataString(user, 'doctor_id_number', String(user.id).slice(0, 16));
    const metadataRateRaw = getMetadataString(user, 'rate_per_consultation', '');
    const metadataParsedRate = parseConsultationRate(metadataRateRaw);
    const profilePictureUrl = getMetadataString(user, 'profile_picture_url', '') || null;
    const medicalLicenseUrl = getMetadataString(user, 'medical_license_url', '') || '';
    const fallbackDoctorPayload = {
      user_id: user.id,
      full_name: fullName,
      gender,
      age,
      phone_number: phoneNumber,
      email: user.email || null,
      city,
      state,
      country,
      marital_status: maritalStatus,
      hospital_affiliation: hospitalAffiliation,
      specialty,
      experience,
      rate_per_consultation: (metadataParsedRate && metadataParsedRate > 0) ? metadataParsedRate : null,
      profile_picture_url: profilePictureUrl,
      medical_license_url: medicalLicenseUrl || '',
      identification_type: doctorIdType === 'passport' ? 'passport' : 'nin',
      identification_number: doctorIdNumber,
      verification_status: 'pending' as const,
    };

    const { error: doctorInsertError } = await supabase
      .from('doctor_registrations')
      .insert([fallbackDoctorPayload]);

    if (doctorInsertError) {
      console.error('Failed ensuring doctor registration fallback:', doctorInsertError);
      return;
    }

    await createDefaultSchedule(user.id);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (mode === 'reset') {
        // Handle password reset - first establish session if needed
        if (!password) {
          toast({ title: 'Password required', description: 'Please enter a new password.' });
          setIsLoading(false);
          return;
        }

        // For password reset, Supabase should have automatically established the session
        // from URL parameters via detectSessionInUrl. Just verify we have a session.
        const { data: sessionData } = await supabase.auth.getSession();
        
        console.log('Password reset - checking session:', { 
          hasSession: !!sessionData.session, 
          hasUser: !!sessionData.session?.user,
          userId: sessionData.session?.user?.id 
        });

        if (!sessionData.session) {
          console.error('No session found for password reset');
          toast({
            title: 'Session expired',
            description: 'Your password reset session has expired. Please request a new reset link.',
          });
          setIsLoading(false);
          return;
        }

        // Clear URL parameters for security
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.delete('access_token');
        newUrl.searchParams.delete('refresh_token');
        newUrl.searchParams.delete('type');
        newUrl.searchParams.delete('code');
        window.history.replaceState({}, '', newUrl.toString());

        // Now update the password
        const { error } = await supabase.auth.updateUser({ password });

        if (error) {
          console.error('Password reset error:', error);
          toast({ title: 'Password reset failed', description: error.message });
          setIsLoading(false);
          return;
        }

        toast({ title: 'Password updated', description: 'Your password has been successfully updated.' });
        setIsLoading(false);
        setMode('login');
        return;
      }

      if (mode === 'register') {
        // Validate email for all users
        const normalizedEmail = String(email || '').trim();
        if (!normalizedEmail) {
          toast({ title: 'Email required', description: 'Please enter your email address.' });
          setIsLoading(false);
          return;
        }
        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(normalizedEmail)) {
          toast({ title: 'Invalid email', description: 'Please enter a valid email address.' });
          setIsLoading(false);
          return;
        }

        // Authoritative pre-check against auth.users via SECURITY DEFINER RPC.
        const normalizedEmailLower = normalizedEmail.toLowerCase();
        const { data: authEmailExists, error: authEmailExistsError } = await supabase
          .rpc('is_email_registered', { p_email: normalizedEmailLower });

        if (authEmailExistsError) {
          console.warn('Auth email existence RPC warning:', authEmailExistsError);
        }
        if (authEmailExists === true) {
          toast({
            title: 'Email already in use',
            description: 'This email already exists. Please use a different email.',
          });
          setIsLoading(false);
          return;
        }

        // Fallback pre-check on registration tables (useful if RPC migration is not yet applied).
        const [{ data: existingDoctorByEmail, error: existingDoctorByEmailError }, { data: existingPatientByEmail, error: existingPatientByEmailError }] = await Promise.all([
          supabase.from('doctor_registrations').select('user_id').ilike('email', normalizedEmailLower).limit(1).maybeSingle(),
          supabase.from('patient_registrations').select('user_id').ilike('email', normalizedEmailLower).limit(1).maybeSingle(),
        ]);

        if (existingDoctorByEmailError) {
          console.warn('Doctor email pre-check warning:', existingDoctorByEmailError);
        }
        if (existingPatientByEmailError) {
          console.warn('Patient email pre-check warning:', existingPatientByEmailError);
        }
        if (existingDoctorByEmail || existingPatientByEmail) {
          toast({
            title: 'Email already in use',
            description: 'This email already exists. Please use a different email.',
          });
          setIsLoading(false);
          return;
        }

        // Validate doctor signup status
        if (role === 'doctor') {
          const doctorSignupStatus = await getDoctorSignupStatus();
          if (!doctorSignupStatus.open) {
            toast({
              title: 'Doctor sign up is currently closed',
              description: doctorSignupStatus.message,
              variant: 'destructive',
            });
            setIsLoading(false);
            return;
          }
        }

        // Sign up with Supabase using email - keep metadata minimal to debug 500 error
        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth?mode=login&verified=1`,
            data: {
              role,
            },
          },
        });

        const isExistingEmailMessage = (message: string) => {
          const normalized = message.toLowerCase();
          return (
            normalized.includes('already registered')
            || normalized.includes('already been registered')
            || normalized.includes('user already registered')
            || normalized.includes('email already')
            || normalized.includes('already exists')
          );
        };

        if (error) {
          // Check if user already exists
          if (isExistingEmailMessage(error.message)) {
            toast({ 
              title: 'Email already in use', 
              description: 'This email already exists. Please use a different email.'
            });
          } else if (error.message.toLowerCase().includes('rate limit')) {
            const blockedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
            setRateLimitBlock(blockedUntil);
            const remaining = formatRemaining(blockedUntil - Date.now());

            toast({
              title: 'Email rate limit exceeded',
              description: `Too many verification emails were sent recently. Try again in ${remaining}.`,
              variant: 'destructive',
            });
          } else {
            const errorMessage = String(error.message || '');
            const isDoctorSignupClosed = errorMessage.toLowerCase().includes('doctor signup is currently closed');
            toast({
              title: isDoctorSignupClosed ? 'Doctor sign up is currently closed' : 'Registration failed',
              description: isDoctorSignupClosed
                ? 'Doctor sign up has been closed for this round and will resume soon. Please keep checking the site.'
                : errorMessage,
            });
          }
          setIsLoading(false);
          return;
        }

        // Supabase may return a "successful" obfuscated response for existing users.
        // In that case, the user has no identities and should be treated as duplicate.
        if (Array.isArray(data.user?.identities) && data.user.identities.length === 0) {
          toast({
            title: 'Email already in use',
            description: 'This email already exists. Please use a different email.',
          });
          setIsLoading(false);
          return;
        }

        const canWriteRegistrationImmediately = !!data.session;

        // Immediately save doctor registration stub (email only) when session exists.
        if (role === 'doctor' && data.user?.id && canWriteRegistrationImmediately) {
          try {
            await supabase.from('doctor_registrations')
              .upsert([{ user_id: data.user.id, email, verification_status: 'pending' }], { onConflict: 'user_id' });
            await createDefaultSchedule(data.user.id);
          } catch (err) {
            console.error('Failed to save doctor registration stub:', err);
          }
        }

        // Immediately save patient registration only when a valid session exists.
        if (role === 'patient' && data.user?.id && canWriteRegistrationImmediately) {
          try {
            const patientPayload = {
              user_id: data.user.id,
              email: normalizedEmail,
            };
            const { error: patientUpsertError } = await supabase
              .from('patient_registrations')
              .upsert([patientPayload], { onConflict: 'user_id' });
            if (patientUpsertError) {
              console.error('Patient upsert error on signup:', patientUpsertError);
            }
          } catch (err) {
            console.error('Failed to upsert patient registration on signup:', err);
          }
        }

        // Store registration data for after verification
        const registrationData = {
          role,
          email,
          userId: data.user?.id
        };
        setPendingUserData(registrationData);

        toast({
          title: 'Verification link sent',
          description: 'Check your email for the verification link.',
        });

        // Check if user is already confirmed (email verification disabled)
        if (data.user?.email_confirmed_at) {
          console.log('Email verification disabled - user auto-confirmed');
          localStorage.setItem('userRole', role);
          toast({ title: 'Account created', description: 'Welcome to MyE-Doctor!' });
          setIsLoading(false);
          navigate(role === 'doctor' ? '/doctor-portal' : '/patient-portal');
          return;
        }

        setIsLoading(false);
        // Supabase is configured for email confirmation links, not OTP codes.
        // Send users straight to login after they click the email link.
        setMode('login');
        toast({
          title: 'Confirm your email',
          description: 'Open the confirmation link in your email, then sign in.',
        });
      } else if (mode === 'verify') {
        setIsLoading(false);
        toast({
          title: 'Use verification link',
          description: 'Your project uses email links. Please confirm from email and sign in.',
        });
        setMode('login');
        navigate('/auth?mode=login');
        return;
      } else {
        // Validate email for login
        if (!email) {
          toast({ title: 'Email required', description: 'Please enter your email address.' });
          setIsLoading(false);
          return;
        }

        console.log('Attempting login with email:', email);

        // Sign in with Supabase using email
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          console.error('Login error:', error);
          const normalizedError = String(error.message || '').toLowerCase();
          
          if (normalizedError.includes('invalid login credentials') || normalizedError.includes('invalid credentials')) {
            // Check if the email exists to provide a more specific error
            try {
              const { data: emailExists, error: checkError } = await supabase.rpc('is_email_registered', {
                p_email: email.trim().toLowerCase()
              });

              if (!checkError && emailExists === true) {
                // Email exists, so it's a wrong password
                toast({
                  title: 'Incorrect password',
                  description: 'The password you entered is incorrect. Please try again or reset your password.',
                  variant: 'destructive',
                });
                setIsLoading(false);
                return;
              }
            } catch (err) {
              console.error('Error checking email existence:', err);
            }

            // Either email doesn't exist or check failed - treat as unregistered
            toast({
              title: 'Account not found',
              description: 'We could not find an account with this email. Please check your spelling or click Get Started to create an account.',
            });
            setMode('register');
            navigate('/auth?mode=register');
            setIsLoading(false);
            return;
          }

          if (normalizedError.includes('email not confirmed')) {
            toast({
              title: 'Email not verified',
              description: 'Please check your inbox and verify your email address before signing in.',
            });
            setIsLoading(false);
            return;
          }

          if (normalizedError.includes('user not found')) {
            toast({
              title: 'Account not found',
              description: 'We could not find an account with this email address.',
            });
            setMode('register');
            navigate('/auth?mode=register');
            setIsLoading(false);
            return;
          }

          toast({ 
            title: 'Sign in failed', 
            description: error.message,
            variant: 'destructive'
          });
          setIsLoading(false);
          return;
        }

        console.log('Login successful, user:', data.user?.id);

        // Determine user role from auth metadata only (strict single-role login).
        const metadataRole = getMetadataRole(data.user);
        if (!metadataRole) {
          await supabase.auth.signOut();
          toast({
            title: 'Sign in blocked',
            description: 'Your account role is missing. Please contact support.',
          });
          setIsLoading(false);
          return;
        }

        if (metadataRole !== role) {
          if (metadataRole === 'doctor' || metadataRole === 'patient') {
            setRole(metadataRole);
          }
          toast({
            title: 'Portal updated',
            description: metadataRole === 'doctor'
              ? 'Doctor account detected. Redirecting to Doctor Portal.'
              : metadataRole === 'healthlink'
              ? 'HealthLink account detected. Redirecting to HealthLink Portal.'
              : 'Patient account detected. Redirecting to Patient Portal.',
          });
        }

        const userRole: SignInRole = metadataRole;
        let shouldCompleteRegistration = false;
        if (data.user?.id) {
          if (userRole === 'doctor') {
            // Backfill default availability for existing doctors who have no schedules yet.
            await createDefaultSchedule(data.user.id);
            // Metadata says doctor but row is missing: recreate fallback so admin sees verification request.
            await ensureDoctorRegistrationFallback(data.user);
            const { data: doctorRow } = await supabase
              .from('doctor_registrations')
              .select('medical_license_url')
              .eq('user_id', data.user.id)
              .maybeSingle();
            shouldCompleteRegistration = !isFilled((doctorRow as { medical_license_url?: string | null } | null)?.medical_license_url);
          } else if (userRole === 'patient') {
            // Ensure patient users always have a patient registration row.
            await ensurePatientRegistrationFallback(data.user);
            const { data: patientRow } = await supabase
              .from('patient_registrations')
              .select('profile_picture_url, post_auth_prompt_completed')
              .eq('user_id', data.user.id)
              .maybeSingle();
            const profileFilled = isFilled((patientRow as { profile_picture_url?: string | null } | null)?.profile_picture_url);
            const promptCompleted = Boolean((patientRow as { post_auth_prompt_completed?: boolean | null } | null)?.post_auth_prompt_completed);
            shouldCompleteRegistration = !(profileFilled || promptCompleted);
          }
        }
        localStorage.setItem('userRole', userRole);

        toast({ title: 'Signed in', description: 'Welcome back!' });
        setIsLoading(false);

        if (shouldCompleteRegistration && (userRole === 'doctor' || userRole === 'patient')) {
          navigate(`/complete-registration?role=${userRole}`);
          return;
        }

        const redirectPath = searchParams.get('redirect');
        if (redirectPath && userRole === 'patient') {
          navigate(redirectPath);
          return;
        }

        // Redirect based on role
        navigate(
          userRole === 'doctor'
            ? '/doctor-portal'
            : userRole === 'healthlink'
            ? '/healthlink'
            : '/patient-portal'
        );
      }
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'message' in err ? (err as { message?: string }).message : String(err);
      toast({ title: 'Error', description: message });
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Form */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-8 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md max-h-screen overflow-y-auto py-4"
        >
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 mb-8">
            <img src={logoImage} alt="MyE-Doctor Logo" className="h-10 w-auto shrink-0 object-contain" />
            <div className="flex flex-col">
              <span className="text-xl font-bold leading-tight">
                MyE-<span className="text-primary">Doctor</span>
              </span>
              <span className="text-[10px] text-muted-foreground leading-tight">Powered by HealthLink</span>
            </div>
          </Link>

          {/* Title */}
          <h1 className="text-2xl md:text-3xl font-bold mb-2">
            {mode === 'login'
              ? t('auth.title.welcomeBack', 'Welcome back')
              : mode === 'verify'
              ? t('auth.title.verifyEmail', 'Verify your email')
              : mode === 'reset'
              ? t('auth.resetPassword.title', 'Reset your password')
              : t('auth.title.createAccount', 'Create your account')}
          </h1>
          <p className="text-muted-foreground mb-8">
            {mode === 'login'
              ? t('auth.subtitle.signIn', 'Sign in with your email to access your health dashboard')
              : mode === 'verify'
              ? `${t('auth.subtitle.enterVerificationCode', 'Enter the verification code sent to')} ${email}`
              : mode === 'reset'
              ? t('auth.resetPassword.newPasswordSubtitle', 'Enter your new password below')
              : t('auth.subtitle.joinPatients', 'Join thousands of patients getting quality healthcare')}
          </p>

          {promotion?.isActive ? (
            <div className="mb-6 rounded-xl border-2 border-red-300 bg-gradient-to-r from-red-50 via-rose-50 to-orange-50 px-5 py-4 shadow-md">
              <p className="text-base font-extrabold text-red-700">{promotionHeadline}</p>
              <p className="mt-1 text-sm font-semibold text-red-600">{promotionSubtext}</p>
            </div>
          ) : null}

          {/* Role Selection (Register only) */}
          {mode === 'register' && (
            <div className="mb-6">
              <Label className="text-sm font-medium mb-3 block">{t('auth.role.iAmA', 'I am a:')}</Label>
              <div className="flex gap-3">
                {(['patient', 'doctor'] as UserRole[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => {
                      void handleRoleSelection(r);
                    }}
                    disabled={(isCheckingDoctorSignup && r === 'doctor') || (isCheckingPatientSignup && r === 'patient')}
                    className={cn(
                      'flex-1 p-4 rounded-xl border-2 transition-all duration-200',
                      role === r
                        ? 'border-primary bg-primary-light'
                        : 'border-border hover:border-primary/50',
                      (isCheckingDoctorSignup && r === 'doctor') || (isCheckingPatientSignup && r === 'patient') ? 'opacity-60 cursor-not-allowed' : ''
                    )}
                  >
                    <p className="font-semibold capitalize">
                      {r === 'patient' ? t('portal.patient', 'Patient') : t('portal.doctor', 'Doctor')}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {r === 'patient'
                        ? t('auth.role.patientDescription', 'Book consultations')
                        : t('auth.role.doctorDescription', 'Provide consultations')}
                    </p>
                  </button>
                ))}
              </div>
              {!!activeSignupBlockedMessage && (
                <p className="mt-3 text-sm text-destructive">
                  {activeSignupBlockedMessage}
                </p>
              )}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
            {mode === 'verify' ? (
              <div>
                <Label htmlFor="verificationCode">{t('auth.verification.code', 'Verification Code')}</Label>
                <Input
                  id="verificationCode"
                  type="text"
                  placeholder={t('auth.verification.placeholder', 'Enter 6-digit code')}
                  className="h-12 text-center text-2xl tracking-widest"
                  maxLength={6}
                  required
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                />
                <div className="flex flex-col gap-2 mt-2">
                  <p className="text-sm text-muted-foreground">
                    {t('auth.verification.notReceived', "Didn't receive the code?")}{' '}
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await supabase.auth.resend({ type: 'signup', email });
                          toast({ title: 'Code resent', description: 'A new verification code has been sent to your email.' });
                        } catch (error) {
                          toast({ title: 'Resend failed', description: 'Please try again.' });
                        }
                      }}
                      className="text-primary hover:underline"
                    >
                      {t('auth.verification.resend', 'Resend code')}
                    </button>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t('auth.verification.havingIssues', 'Having issues?')}{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setMode('register');
                        setVerificationCode('');
                        setPendingUserData(null);
                        toast({ title: 'Registration reset', description: 'Please register again with a different email or contact support.' });
                      }}
                      className="text-destructive hover:underline"
                    >
                      {t('auth.verification.startOver', 'Start over')}
                    </button>
                  </p>
                </div>
              </div>
            ) : mode === 'reset' ? (
              <div>
                <Label htmlFor="password">{t('auth.fields.password', 'Password')}</Label>
                <div className="relative mt-1.5">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder={t('auth.fields.passwordPlaceholderRegister', 'Create a password')}
                    className="pl-10 pr-10 h-12"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div>
                  <Label htmlFor="email">{mode === 'login' ? t('auth.fields.emailAddress', 'Email Address') : `${t('auth.fields.emailAddress', 'Email Address')} *`}</Label>
                  <div className="relative mt-1.5">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder={mode === 'login' ? t('auth.fields.emailPlaceholderLogin', 'Enter your email') : t('auth.fields.emailPlaceholderRegister', 'Enter your email address')}
                      className="pl-10 h-12"
                      required={mode !== 'login' || mode === 'login'}
                      disabled={mode === 'register' && !!activeSignupBlockedMessage}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="password">{t('auth.fields.password', 'Password')}</Label>
                  <div className="relative mt-1.5">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder={mode === 'register' ? t('auth.fields.passwordPlaceholderRegister', 'Create a password') : t('auth.fields.passwordPlaceholderLogin', 'Enter your password')}
                      className="pl-10 pr-10 h-12"
                      required
                      disabled={mode === 'register' && !!activeSignupBlockedMessage}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

              </>
            )}

            {mode === 'login' && (
              <div className="flex items-center justify-between text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="rounded border-border" />
                  <span className="text-muted-foreground">{t('auth.rememberMe', 'Remember me')}</span>
                </label>
                <Link to="/forgot-password" className="text-primary hover:underline">
                  {t('auth.forgotPassword', 'Forgot password?')}
                </Link>
              </div>
            )}

            <Button
              type="submit"
              variant="gradient"
              size="lg"
              className="w-full mt-6"
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  {mode === 'login' ? `${t('common.login', 'Login')}...` : mode === 'verify' ? t('auth.verifying', 'Verifying...') : mode === 'reset' ? `${t('auth.resetPassword.title', 'Reset your password')}...` : `${t('common.getStarted', 'Get Started')}...`}
                </span>
              ) : (
                <>
                  {mode === 'login' ? t('common.login', 'Login') : mode === 'verify' ? t('auth.verifyCode', 'Verify Code') : mode === 'reset' ? t('auth.resetPassword.title', 'Reset your password') : t('common.getStarted', 'Get Started')}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </form>

          {/* Toggle Mode */}
          {mode !== 'verify' && mode !== 'reset' && (
            <p className="text-center text-sm text-muted-foreground mt-6">
              {mode === 'login' ? `${t('common.getStarted', 'Get Started')}? ` : `${t('common.login', 'Login')}? `}
              <button
                type="button"
                onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
                className="text-primary font-medium hover:underline"
              >
                {mode === 'login' ? t('common.getStarted', 'Get Started') : t('common.login', 'Login')}
              </button>
            </p>
          )}
        </motion.div>
      </div>

      {/* Right Panel - Benefits */}
      <div className="hidden lg:flex flex-1 items-center justify-center p-12 relative overflow-hidden bg-gradient-to-br from-[#0d9d7e] via-[#0c8870] to-[#065f4a]">
        {/* Decorative blobs */}
        <div className="absolute top-0 right-0 w-80 h-80 rounded-full bg-white/5 -mr-32 -mt-32 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-64 rounded-full bg-white/5 -ml-24 -mb-24 pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-white/[0.03] pointer-events-none" />

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="relative z-10 max-w-md w-full"
        >
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 text-white/90 text-sm font-medium mb-6">
            <Stethoscope className="w-4 h-4" />
            {mode === 'register' && role === 'patient'
              ? t('auth.rightPanel.completeRegistration', 'Complete Your Registration')
              : 'MyE-Doctor Platform'}
          </span>

          <h2 className="text-3xl xl:text-4xl font-bold text-white mb-5 leading-tight">
            {mode === 'register' && role === 'patient'
              ? t('auth.rightPanel.taglineRegister', 'Your health journey\nstarts here.')
              : t('auth.rightPanel.tagline', 'Your Doctor,\nAnytime, Anywhere.')}
          </h2>
          <p className="text-white/70 mb-10 leading-relaxed">
            {mode === 'register' && role === 'patient'
              ? t('auth.rightPanel.completeRegistrationDescription', 'Fill in your details to create your patient profile and start accessing quality healthcare services.')
              : t('auth.rightPanel.generalDescription', 'Join MyEdoctor and experience healthcare reimagined. Connect with top specialists, manage appointments, and access your health records — all in one place.')}
          </p>

          <ul className="space-y-4">
            {benefits.map((benefit, index) => (
              <motion.li
                key={benefit}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: 0.4 + index * 0.1 }}
                className="flex items-center gap-3"
              >
                <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                  <Check className="w-4 h-4 text-white" />
                </div>
                <span className="text-white/90 text-sm font-medium">{benefit}</span>
              </motion.li>
            ))}
          </ul>

          {/* Bottom trust badge */}
          <div className="mt-12 pt-6 border-t border-white/10 flex items-center gap-3">
            <div className="flex -space-x-2">
              {[
                { initials: 'AK', bg: '#059669' },
                { initials: 'FM', bg: '#0d9d7e' },
                { initials: 'NB', bg: '#0891b2' },
              ].map(({ initials, bg }) => (
                <div
                  key={initials}
                  className="w-8 h-8 rounded-full border-2 border-white/30 flex items-center justify-center text-white text-[10px] font-bold"
                  style={{ background: bg }}
                >
                  {initials}
                </div>
              ))}
            </div>
            <p className="text-sm text-white/70">
              Trusted by <span className="text-white font-semibold">1,000+</span> patients
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
