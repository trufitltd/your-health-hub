import { useRef, useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Stethoscope, Mail, Lock, User, Eye, EyeOff, ArrowRight, Check, Phone, MapPin, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/use-toast';
import { createDefaultSchedule } from '@/services/scheduleService';
import { smsService } from '@/services/smsService';
import logoImage from '@/assets/MyE-DoctorLogo.png';
import { useLocaleFormatter } from '@/lib/locale';
import { useLanguage } from '@/contexts/LanguageContext';

type AuthMode = 'login' | 'register' | 'verify' | 'reset';
type UserRole = 'patient' | 'doctor';
type CountryPhoneCode = { iso: string; name: string; dialCode: string };

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
  const navigate = useNavigate();

  // Patient registration fields
  const [gender, setGender] = useState('');
  const [age, setAge] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [country, setCountry] = useState('');
  const [maritalStatus, setMaritalStatus] = useState('');
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');
  const [identificationType, setIdentificationType] = useState('');
  const [identificationNumber, setIdentificationNumber] = useState('');
  const [consentAgreed, setConsentAgreed] = useState(false);

  // Doctor registration fields
  const [hospitalAffiliation, setHospitalAffiliation] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [otherSpecialty, setOtherSpecialty] = useState('');
  const [profilePicture, setProfilePicture] = useState<File | null>(null);
  const [medicalLicense, setMedicalLicense] = useState<File | null>(null);
  const [doctorIdType, setDoctorIdType] = useState('');
  const [doctorIdNumber, setDoctorIdNumber] = useState('');
  const [doctorExperience, setDoctorExperience] = useState('');
  const [consultationRate, setConsultationRate] = useState('');
  const [doctorConsentAgreed, setDoctorConsentAgreed] = useState(false);
  const [consultationLanguages, setConsultationLanguages] = useState<string[]>([]);
  const profilePictureInputRef = useRef<HTMLInputElement | null>(null);
  const medicalLicenseInputRef = useRef<HTMLInputElement | null>(null);
  const { formatCurrency, formatNumber } = useLocaleFormatter();
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
    `${t('auth.benefits.specialistsAccessPrefix', 'Access to')} ${formatNumber(50)}+ ${t('auth.benefits.certifiedSpecialists', 'certified specialists')}`,
    t('auth.benefits.secureConsultations', 'Secure video & audio consultations'),
    t('auth.benefits.easyBooking', 'Easy appointment booking'),
    t('auth.benefits.digitalRecords', 'Digital prescriptions & records'),
  ];

  const isGeneralPracticeSpecialty = (value: string) => {
    const normalized = value.trim().toLowerCase();
    return normalized === 'general_practitioner' || normalized === 'general practitioner' || normalized === 'general practice';
  };
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
  const toggleConsultationLanguage = (language: string) => {
    setConsultationLanguages((prev) =>
      prev.includes(language) ? prev.filter((item) => item !== language) : [...prev, language]
    );
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

        const cleanedLocalPhone = phoneLocalNumber.replace(/\D/g, '').replace(/^0+/, '');
        const normalizedPhone = `${selectedPhoneDialCode}${cleanedLocalPhone}`;
        const phoneDigits = normalizedPhone.replace(/\D/g, '');
        if (!cleanedLocalPhone || phoneDigits.length < 8) {
          toast({ title: 'Phone number required', description: 'Please enter a valid phone number.' });
          setIsLoading(false);
          return;
        }

        // Validate patient registration fields if role is patient
        if (role === 'patient') {
          if (!gender || !age || !city || !state || !country || !maritalStatus || 
              !emergencyContactName || !emergencyContactPhone || !identificationType || !identificationNumber) {
            toast({ title: 'Missing information', description: 'Please fill in all required fields.' });
            setIsLoading(false);
            return;
          }
          if (!consentAgreed) {
            toast({ title: 'Consent required', description: 'Please agree to the patient consent to continue.' });
            setIsLoading(false);
            return;
          }
        }
        // Validate doctor registration fields if role is doctor
        if (role === 'doctor') {
          if (!gender || !age || !city || !state || !country || !maritalStatus || 
              !hospitalAffiliation || !specialty || !medicalLicense || !doctorIdType || !doctorIdNumber || !doctorExperience) {
            toast({ title: 'Missing information', description: 'Please fill in all required fields and upload medical license.' });
            setIsLoading(false);
            return;
          }
          if (consultationLanguages.length === 0) {
            toast({
              title: t('auth.toast.consultationLanguagesRequiredTitle', 'Consultation languages required'),
              description: t('auth.toast.consultationLanguagesRequiredDescription', 'Please select at least one consultation language.')
            });
            setIsLoading(false);
            return;
          }
          if (specialty === 'others' && !otherSpecialty) {
            toast({ title: 'Specialty required', description: 'Please specify your specialty.' });
            setIsLoading(false);
            return;
          }

          const resolvedSpecialty = specialty === 'others' ? otherSpecialty : specialty;
          const parsedRate = parseConsultationRate(consultationRate);

          if (specialistRequiresRate && !parsedRate) {
            toast({ title: 'Consultation rate required', description: 'Please enter a valid consultation rate for specialist registration.' });
            setIsLoading(false);
            return;
          }

          if (!doctorConsentAgreed) {
            toast({ title: 'Consent required', description: 'Please agree to the doctor consent and revenue sharing terms.' });
            setIsLoading(false);
            return;
          }
        }

        // Sign up with Supabase using email - keep metadata minimal to debug 500 error
        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
        });

        if (error) {
          // Check if user already exists
          if (error.message.includes('already registered') || error.message.includes('already been registered')) {
            toast({ 
              title: 'Email already in use', 
              description: 'This email is already registered. Please use a different email or try logging in.' 
            });
            setMode('login');
          } else if (error.message.toLowerCase().includes('rate limit')) {
            toast({
              title: 'Email rate limit exceeded',
              description: 'Too many verification emails were sent recently. Please wait a few minutes and check your inbox (including spam/junk) before trying again.',
              variant: 'destructive',
            });
          } else {
            toast({ title: 'Registration failed', description: error.message });
          }
          setIsLoading(false);
          return;
        }

        // Immediately save doctor registration data if role is doctor
        if (role === 'doctor' && data.user?.id) {
          try {
            // Upload files first
            let profilePictureUrl = null;
            let medicalLicenseUrl = null;

            if (profilePicture) {
              const profileExt = profilePicture.name.split('.').pop();
              const profilePath = `${data.user.id}/profile-pictures/profile.${profileExt}`;
              const { error: profileError } = await supabase.storage
                .from('doctor-files')
                .upload(profilePath, profilePicture, { upsert: true });
              if (!profileError) {
                profilePictureUrl = supabase.storage.from('doctor-files').getPublicUrl(profilePath).data.publicUrl;
              }
            }

            if (medicalLicense) {
              const licenseExt = medicalLicense.name.split('.').pop();
              const licensePath = `${data.user.id}/credentials/medical-license.${licenseExt}`;
              const { error: licenseError } = await supabase.storage
                .from('doctor-files')
                .upload(licensePath, medicalLicense, { upsert: true });
              if (!licenseError) {
                medicalLicenseUrl = supabase.storage.from('doctor-files').getPublicUrl(licensePath).data.publicUrl;
              }
            }

            const resolvedSpecialty = specialty === 'others' ? otherSpecialty : specialty;
            const parsedRate = parseConsultationRate(consultationRate);
            const doctorPayload = {
              user_id: data.user.id,
              full_name: name,
              gender,
              age: parseInt(age),
              phone_number: normalizedPhone,
              email,
              city,
              state,
              country,
              marital_status: maritalStatus,
              hospital_affiliation: hospitalAffiliation,
              specialty: resolvedSpecialty,
              preferred_consultation_languages: consultationLanguages,
              experience: doctorExperience,
              rate_per_consultation: isGeneralPracticeSpecialty(resolvedSpecialty || '') || !parsedRate
                ? null
                : parsedRate,
              profile_picture_url: profilePictureUrl,
              medical_license_url: medicalLicenseUrl,
              identification_type: doctorIdType,
              identification_number: doctorIdNumber,
              verification_status: 'pending'
            };

            await supabase.from('doctor_registrations').insert([doctorPayload]);
            await createDefaultSchedule(data.user.id);
          } catch (err) {
            console.error('Failed to save doctor registration:', err);
          }
        }

        // Immediately save patient registration if role is patient so data exists in DB
        if (role === 'patient' && data.user?.id) {
          try {
            const patientPayload = {
              user_id: data.user.id,
              full_name: name,
              gender,
              age: parseInt(age || '0') || 18,
              phone_number: normalizedPhone,
              email: normalizedEmail,
              identification_type: identificationType,
              identification_number: identificationNumber,
            };

            // Direct upsert to avoid RPC complexity
            const { error: patientUpsertError } = await supabase
              .from('patient_registrations')
              .upsert([patientPayload], { onConflict: 'user_id' });

            if (patientUpsertError) {
              console.error('Patient upsert error on signup:', patientUpsertError);
            } else {
              console.log('Patient registration created/updated on signup for user:', data.user.id);
            }
          } catch (err) {
            console.error('Failed to upsert patient registration on signup:', err);
          }
        }

        // Store registration data for after verification
        const registrationData = {
          role,
          name,
          email,
          phoneNumber: normalizedPhone,
          gender,
          age,
          city,
          state,
          country,
          maritalStatus,
          emergencyContactName,
          emergencyContactPhone,
          identificationType,
          identificationNumber,
          hospitalAffiliation,
          specialty,
          otherSpecialty,
          consultationLanguages,
          doctorExperience,
          consultationRate,
          doctorConsentAgreed,
          profilePicture,
          medicalLicense,
          doctorIdType,
          doctorIdNumber,
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
        setMode('verify');
      } else if (mode === 'verify') {
        // Verify email with code
        if (!verificationCode) {
          toast({ title: 'Verification code required', description: 'Please enter the verification code.' });
          setIsLoading(false);
          return;
        }

        const { data, error } = await supabase.auth.verifyOtp({
          email,
          token: verificationCode,
          type: 'email'
        });

        if (error) {
          toast({ title: 'Verification failed', description: error.message });
          setIsLoading(false);
          return;
        }

        // Now complete the registration process
        if (pendingUserData && data.user?.id) {
          try {
            console.log('Completing registration for user:', data.user.id, 'Role:', pendingUserData.role);
            
            if (pendingUserData.role === 'patient') {
              const registrationPayload = {
                user_id: data.user.id,
                full_name: pendingUserData.name,
                gender: pendingUserData.gender,
                age: parseInt(pendingUserData.age),
                phone_number: pendingUserData.phoneNumber,
                email: pendingUserData.email || null,
                city: pendingUserData.city,
                state: pendingUserData.state,
                country: pendingUserData.country,
                marital_status: pendingUserData.maritalStatus,
                emergency_contact_name: pendingUserData.emergencyContactName,
                emergency_contact_phone: pendingUserData.emergencyContactPhone,
                identification_type: pendingUserData.identificationType,
                identification_number: pendingUserData.identificationNumber
              };

              // Direct upsert to ensure patient record exists
              const { error: patientError } = await supabase
                .from('patient_registrations')
                .upsert([registrationPayload], { onConflict: 'user_id' });
              
              if (patientError) {
                console.error('Patient registration error:', patientError);
              } else {
                console.log('Patient registration confirmed/updated after verification');
              }
              
              // Send welcome SMS
              try {
                await smsService.sendWelcomeSMS(pendingUserData.phoneNumber, pendingUserData.name);
              } catch (smsError) {
                console.error('SMS sending failed:', smsError);
              }
            } else if (pendingUserData.role === 'doctor') {
              // Upload files
              let profilePictureUrl = null;
              let medicalLicenseUrl = null;

              if (pendingUserData.profilePicture) {
                const profileExt = pendingUserData.profilePicture.name.split('.').pop();
                const profilePath = `${data.user.id}/profile-pictures/profile.${profileExt}`;
                const { error: profileError } = await supabase.storage
                  .from('doctor-files')
                  .upload(profilePath, pendingUserData.profilePicture, { upsert: true });
                if (profileError) {
                  console.error('Profile picture upload error:', profileError);
                } else {
                  profilePictureUrl = supabase.storage.from('doctor-files').getPublicUrl(profilePath).data.publicUrl;
                }
              }

              if (pendingUserData.medicalLicense) {
                const licenseExt = pendingUserData.medicalLicense.name.split('.').pop();
                const licensePath = `${data.user.id}/credentials/medical-license.${licenseExt}`;
                const { error: licenseError } = await supabase.storage
                  .from('doctor-files')
                  .upload(licensePath, pendingUserData.medicalLicense, { upsert: true });
                if (licenseError) {
                  console.error('Medical license upload error:', licenseError);
                } else {
                  medicalLicenseUrl = supabase.storage.from('doctor-files').getPublicUrl(licensePath).data.publicUrl;
                }
              }

              const resolvedSpecialty = pendingUserData.specialty === 'others'
                ? pendingUserData.otherSpecialty
                : pendingUserData.specialty;
              const parsedRate = parseConsultationRate(String(pendingUserData.consultationRate || ''));
              const doctorPayload = {
                user_id: data.user.id,
                full_name: pendingUserData.name,
                gender: pendingUserData.gender,
                age: parseInt(pendingUserData.age),
                phone_number: pendingUserData.phoneNumber,
                email: pendingUserData.email || null,
                city: pendingUserData.city,
                state: pendingUserData.state,
                country: pendingUserData.country,
                marital_status: pendingUserData.maritalStatus,
                hospital_affiliation: pendingUserData.hospitalAffiliation,
                specialty: resolvedSpecialty,
                preferred_consultation_languages: pendingUserData.consultationLanguages || [],
                experience: pendingUserData.doctorExperience,
                rate_per_consultation: isGeneralPracticeSpecialty(resolvedSpecialty || '')
                  ? null
                  : parsedRate,
                profile_picture_url: profilePictureUrl,
                medical_license_url: medicalLicenseUrl,
                identification_type: pendingUserData.doctorIdType,
                identification_number: pendingUserData.doctorIdNumber,
                verification_status: 'pending', //Todo: Implement set status from backend, dont trust user input for process flow
              };

              console.log('Inserting doctor registration:', doctorPayload);
              const { error: doctorError } = await supabase.from('doctor_registrations').insert([doctorPayload]);
              if (doctorError) {
                console.error('Doctor registration error:', doctorError);
                throw doctorError;
              }

              // Keep public.doctors in sync for discovery/booking
              const { error: doctorProfileError } = await supabase
                .from('doctors')
                .update({
                  name: doctorPayload.full_name,
                  specialty: doctorPayload.specialty,
                  rate_per_consultation: doctorPayload.rate_per_consultation,
                  preferred_consultation_languages: doctorPayload.preferred_consultation_languages,
                  phone: pendingUserData.phoneNumber,
                  avatar_url: profilePictureUrl || null,
                })
                .eq('id', data.user.id);

              if (doctorProfileError) {
                console.error('Doctor profile sync error:', doctorProfileError);
              }
              
              console.log('Creating default schedule for doctor:', data.user.id);
              await createDefaultSchedule(data.user.id);
              console.log('Doctor registration completed successfully');
            }
          } catch (regError) {
            console.error('Registration completion error:', regError);
            toast({ title: 'Registration incomplete', description: 'Account verified but registration data failed to save. Please contact support.' });
          }
        } else {
          console.error('Missing pending user data or user ID');
        }

        // Get user role from pendingUserData (set during signup)
        const userRole = pendingUserData?.role || 'patient';
        localStorage.setItem('userRole', userRole);

        // Check if user session is valid
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session) {
          toast({ title: 'Session error', description: 'Please try logging in again.' });
          setIsLoading(false);
          return;
        }

        toast({ title: 'Email verified', description: 'Welcome to MyEdoctor!' });
        setIsLoading(false);

        // Redirect based on role
        navigate(userRole === 'doctor' ? '/doctor-portal' : '/patient-portal');
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
          toast({ title: 'Sign in failed', description: error.message });
          setIsLoading(false);
          return;
        }

        console.log('Login successful, user:', data.user?.id);

        // Determine user role by checking if they have a doctor registration
        let userRole = 'patient';
        if (data.user?.id) {
          const { data: doctorReg } = await supabase
            .from('doctor_registrations')
            .select('id')
            .eq('user_id', data.user.id)
            .single();
          
          if (doctorReg) {
            userRole = 'doctor';
            // Backfill default availability for existing doctors who have no schedules yet.
            await createDefaultSchedule(data.user.id);
          }
        }
        localStorage.setItem('userRole', userRole);

        toast({ title: 'Signed in', description: 'Welcome back!' });
        setIsLoading(false);

        // Redirect based on role
        navigate(userRole === 'doctor' ? '/doctor-portal' : '/patient-portal');
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
            <img src={logoImage} alt="MyE-Doctor Logo" className="h-10 w-auto" />
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
              ? t('auth.resetPassword.subtitle', 'Enter your new password below')
              : t('auth.subtitle.joinPatients', 'Join thousands of patients getting quality healthcare')}
          </p>

          {/* Role Selection (Register only) */}
          {mode === 'register' && (
            <div className="mb-6">
              <Label className="text-sm font-medium mb-3 block">{t('auth.role.iAmA', 'I am a:')}</Label>
              <div className="flex gap-3">
                {(['patient', 'doctor'] as UserRole[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    className={cn(
                      'flex-1 p-4 rounded-xl border-2 transition-all duration-200',
                      role === r
                        ? 'border-primary bg-primary-light'
                        : 'border-border hover:border-primary/50'
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
                {mode === 'register' && (
                  <div>
                    <Label htmlFor="name">{t('common.fullName', 'Full Name')}</Label>
                    <div className="relative mt-1.5">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                      <Input
                        id="name"
                        type="text"
                        placeholder={t('auth.fields.fullNamePlaceholder', 'Enter your full name')}
                        className="pl-10 h-12"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </div>
                  </div>
                )}

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
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>

                {mode !== 'login' && (
                  <div>
                    <Label htmlFor="phoneLocalNumber">{mode === 'register' ? `${t('auth.fields.phoneNumber', 'Phone Number')} *` : t('auth.fields.phoneNumber', 'Phone Number')}</Label>
                    <div className="mt-1.5 grid grid-cols-[170px_1fr] gap-2">
                      <Select value={phoneCountryIso} onValueChange={setPhoneCountryIso}>
                        <SelectTrigger className="h-12">
                          <SelectValue placeholder={t('auth.fields.countryCode', 'Code')} />
                        </SelectTrigger>
                        <SelectContent className="max-h-80">
                          {COUNTRY_PHONE_CODES.map((countryCode) => (
                            <SelectItem key={countryCode.iso} value={countryCode.iso}>
                              {`${countryCode.name} (${countryCode.dialCode})`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                        <Input
                          id="phoneLocalNumber"
                          type="tel"
                          placeholder={t('auth.fields.phoneLocalPlaceholder', 'Enter phone number')}
                          className="pl-10 h-12"
                          required={mode === 'register'}
                          value={phoneLocalNumber}
                          onChange={(e) => setPhoneLocalNumber(e.target.value.replace(/[^\d]/g, ''))}
                        />
                      </div>
                    </div>
                  </div>
                )}

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

                {/* Patient Registration Fields */}
                {mode === 'register' && role === 'patient' && (
                  <div className="space-y-4 pt-4 border-t border-border">
                    <h3 className="text-lg font-semibold">{t('auth.sections.patientInfo', 'Patient Information')}</h3>
                    
                    {/* Gender & Age */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label>{t('auth.fields.gender', 'Gender')} *</Label>
                        <Select value={gender} onValueChange={setGender}>
                          <SelectTrigger className="h-12">
                            <SelectValue placeholder={t('auth.fields.selectGender', 'Select gender')} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="male">{t('auth.values.gender.male', 'Male')}</SelectItem>
                            <SelectItem value="female">{t('auth.values.gender.female', 'Female')}</SelectItem>
                            <SelectItem value="other">{t('auth.values.gender.other', 'Other')}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="age">{t('common.age', 'Age')} *</Label>
                        <Input
                          id="age"
                          type="number"
                          placeholder={t('common.age', 'Age')}
                          className="h-12"
                          required
                          value={age}
                          onChange={(e) => setAge(e.target.value)}
                        />
                      </div>
                    </div>

                    {/* Location */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <Label htmlFor="city">{t('auth.fields.city', 'City')} *</Label>
                        <Input
                          id="city"
                          placeholder={t('auth.fields.city', 'City')}
                          className="h-12"
                          required
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="state">{t('auth.fields.state', 'State')} *</Label>
                        <Input
                          id="state"
                          placeholder={t('auth.fields.state', 'State')}
                          className="h-12"
                          required
                          value={state}
                          onChange={(e) => setState(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="country">{t('auth.fields.country', 'Country')} *</Label>
                        <Input
                          id="country"
                          placeholder={t('auth.fields.country', 'Country')}
                          className="h-12"
                          required
                          value={country}
                          onChange={(e) => setCountry(e.target.value)}
                        />
                      </div>
                    </div>

                    {/* Marital Status */}
                    <div>
                      <Label>{t('auth.fields.maritalStatus', 'Marital Status')} *</Label>
                      <Select value={maritalStatus} onValueChange={setMaritalStatus}>
                        <SelectTrigger className="h-12">
                          <SelectValue placeholder={t('auth.fields.selectMaritalStatus', 'Select marital status')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="single">{t('auth.values.marital.single', 'Single')}</SelectItem>
                          <SelectItem value="married">{t('auth.values.marital.married', 'Married')}</SelectItem>
                          <SelectItem value="divorced">{t('auth.values.marital.divorced', 'Divorced')}</SelectItem>
                          <SelectItem value="widowed">{t('auth.values.marital.widowed', 'Widowed')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Emergency Contact */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="emergencyContactName">{t('auth.fields.emergencyContactName', 'Emergency Contact Name')} *</Label>
                        <Input
                          id="emergencyContactName"
                          placeholder={t('auth.fields.contactName', 'Contact name')}
                          className="h-12"
                          required
                          value={emergencyContactName}
                          onChange={(e) => setEmergencyContactName(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="emergencyContactPhone">{t('auth.fields.emergencyContactPhone', 'Emergency Contact Phone')} *</Label>
                        <Input
                          id="emergencyContactPhone"
                          type="tel"
                          placeholder={t('auth.fields.contactPhone', 'Contact phone')}
                          className="h-12"
                          required
                          value={emergencyContactPhone}
                          onChange={(e) => setEmergencyContactPhone(e.target.value)}
                        />
                      </div>
                    </div>

                    {/* Identification */}
                    <div className="space-y-4">
                      <div>
                        <Label>{t('auth.fields.identificationType', 'Identification Type')} *</Label>
                        <Select value={identificationType} onValueChange={setIdentificationType}>
                          <SelectTrigger className="h-12">
                            <SelectValue placeholder={t('auth.fields.selectIdType', 'Select ID type')} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="nin">{t('auth.values.id.nin', 'National Identification Number (NIN)')}</SelectItem>
                            <SelectItem value="student_id">{t('auth.values.id.studentId', 'Student ID Card')}</SelectItem>
                            <SelectItem value="passport">{t('auth.values.id.passport', 'International Passport')}</SelectItem>
                            <SelectItem value="drivers_license">{t('auth.values.id.driversLicense', "National Driver's License")}</SelectItem>
                            <SelectItem value="voters_card">{t('auth.values.id.votersCard', "Voter's Card")}</SelectItem>
                            <SelectItem value="hospital_id">{t('auth.values.id.hospitalCard', 'Hospital / HMO ID Card')}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="identificationNumber">{t('auth.fields.identificationNumber', 'Identification Number')} *</Label>
                        <Input
                          id="identificationNumber"
                          placeholder={t('auth.fields.idNumberPlaceholder', 'Enter ID number')}
                          className="h-12"
                          required
                          value={identificationNumber}
                          onChange={(e) => setIdentificationNumber(e.target.value)}
                        />
                      </div>
                    </div>

                    {/* Patient Consent */}
                    <div className="p-4 border border-border rounded-lg bg-muted/30">
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={consentAgreed}
                          onChange={(e) => setConsentAgreed(e.target.checked)}
                          className="mt-1 rounded border-border"
                          required
                        />
                        <span className="text-sm">
                          <strong>{t('auth.consent.patientTitle', 'Patient Consent:')}</strong>{' '}
                          {t(
                            'auth.consent.patientBody',
                            "I agree to participate in a virtual consultation with My E-Doctor. I understand that my information will be kept confidential and securely used for medical care. I acknowledge the limitations of virtual consultations and agree to follow my healthcare provider's instructions."
                          )}
                        </span>
                      </label>
                    </div>
                  </div>
                )}

                {/* Doctor Registration Fields */}
                {mode === 'register' && role === 'doctor' && (
                  <div className="space-y-4 pt-4 border-t border-border">
                    <h3 className="text-lg font-semibold">{t('auth.sections.doctorInfo', 'Doctor Information')}</h3>
                    
                    {/* Profile Picture */}
                    <div>
                      <Label htmlFor="profilePicture">{t('auth.fields.profilePictureOptional', 'Profile Picture (Optional)')}</Label>
                      <div className="mt-1.5 space-y-2">
                        <input
                          id="profilePicture"
                          ref={profilePictureInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => setProfilePicture(e.target.files?.[0] || null)}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full justify-start gap-2 h-12"
                          onClick={() => profilePictureInputRef.current?.click()}
                        >
                          <Upload className="w-4 h-4" />
                          {t('auth.fields.chooseFileToUpload', 'Choose file to upload')}
                        </Button>
                        <p className="text-xs text-muted-foreground">
                          {profilePicture?.name || t('auth.fields.noFileSelected', 'No file selected')}
                        </p>
                      </div>
                    </div>

                    {/* Gender & Age */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label>{t('auth.fields.gender', 'Gender')} *</Label>
                        <Select value={gender} onValueChange={setGender}>
                          <SelectTrigger className="h-12">
                            <SelectValue placeholder={t('auth.fields.selectGender', 'Select gender')} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="male">{t('auth.values.gender.male', 'Male')}</SelectItem>
                            <SelectItem value="female">{t('auth.values.gender.female', 'Female')}</SelectItem>
                            <SelectItem value="other">{t('auth.values.gender.other', 'Other')}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="age">{t('common.age', 'Age')} *</Label>
                        <Input
                          id="age"
                          type="number"
                          placeholder={t('common.age', 'Age')}
                          className="h-12"
                          required
                          value={age}
                          onChange={(e) => setAge(e.target.value)}
                        />
                      </div>
                    </div>

                    {/* Location */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <Label htmlFor="city">{t('auth.fields.city', 'City')} *</Label>
                        <Input
                          id="city"
                          placeholder={t('auth.fields.city', 'City')}
                          className="h-12"
                          required
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="state">{t('auth.fields.state', 'State')} *</Label>
                        <Input
                          id="state"
                          placeholder={t('auth.fields.state', 'State')}
                          className="h-12"
                          required
                          value={state}
                          onChange={(e) => setState(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="country">{t('auth.fields.country', 'Country')} *</Label>
                        <Input
                          id="country"
                          placeholder={t('auth.fields.country', 'Country')}
                          className="h-12"
                          required
                          value={country}
                          onChange={(e) => setCountry(e.target.value)}
                        />
                      </div>
                    </div>

                    {/* Marital Status */}
                    <div>
                      <Label>{t('auth.fields.maritalStatus', 'Marital Status')} *</Label>
                      <Select value={maritalStatus} onValueChange={setMaritalStatus}>
                        <SelectTrigger className="h-12">
                          <SelectValue placeholder={t('auth.fields.selectMaritalStatus', 'Select marital status')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="single">{t('auth.values.marital.single', 'Single')}</SelectItem>
                          <SelectItem value="married">{t('auth.values.marital.married', 'Married')}</SelectItem>
                          <SelectItem value="divorced">{t('auth.values.marital.divorced', 'Divorced')}</SelectItem>
                          <SelectItem value="widowed">{t('auth.values.marital.widowed', 'Widowed')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Hospital Affiliation */}
                    <div>
                      <Label htmlFor="hospitalAffiliation">{t('auth.fields.hospitalAffiliations', 'Hospital Affiliation(s)')} *</Label>
                      <Input
                        id="hospitalAffiliation"
                        placeholder={t('auth.fields.hospitalAffiliationsPlaceholder', 'Enter hospital affiliations')}
                        className="h-12"
                        required
                        value={hospitalAffiliation}
                        onChange={(e) => setHospitalAffiliation(e.target.value)}
                      />
                    </div>

                    {/* Specialty */}
                    <div>
                      <Label>{t('common.specialty', 'Specialty')} *</Label>
                      <Select value={specialty} onValueChange={setSpecialty}>
                        <SelectTrigger className="h-12">
                          <SelectValue placeholder={t('auth.fields.selectSpecialty', 'Select your specialty')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="general_practitioner">{t('auth.values.specialty.general_practitioner', 'General Practitioner')}</SelectItem>
                          <SelectItem value="pediatrics">{t('auth.values.specialty.pediatrics', 'Pediatrics')}</SelectItem>
                          <SelectItem value="obstetrics_gynecology">{t('auth.values.specialty.obstetrics_gynecology', 'Obstetrics & Gynecology')}</SelectItem>
                          <SelectItem value="psychiatry">{t('auth.values.specialty.psychiatry', 'Psychiatry / Mental Health')}</SelectItem>
                          <SelectItem value="dermatology">{t('auth.values.specialty.dermatology', 'Dermatology')}</SelectItem>
                          <SelectItem value="endocrinology">{t('auth.values.specialty.endocrinology', 'Endocrinology')}</SelectItem>
                          <SelectItem value="rheumatology">{t('auth.values.specialty.rheumatology', 'Rheumatology')}</SelectItem>
                          <SelectItem value="cardiology">{t('auth.values.specialty.cardiology', 'Cardiology')}</SelectItem>
                          <SelectItem value="oncology">{t('auth.values.specialty.oncology', 'Oncology')}</SelectItem>
                          <SelectItem value="infectious_diseases">{t('auth.values.specialty.infectious_diseases', 'Infectious Diseases')}</SelectItem>
                          <SelectItem value="family_medicine">{t('auth.values.specialty.family_medicine', 'Family Medicine')}</SelectItem>
                          <SelectItem value="urology">{t('auth.values.specialty.urology', 'Urology')}</SelectItem>
                          <SelectItem value="orthopedics">{t('auth.values.specialty.orthopedics', 'Orthopedics')}</SelectItem>
                          <SelectItem value="ent">{t('auth.values.specialty.ent', 'ENT (Ear, Nose & Throat)')}</SelectItem>
                          <SelectItem value="ophthalmology">{t('auth.values.specialty.ophthalmology', 'Ophthalmology')}</SelectItem>
                          <SelectItem value="neurology">{t('auth.values.specialty.neurology', 'Neurology')}</SelectItem>
                          <SelectItem value="radiology">{t('auth.values.specialty.radiology', 'Radiology')}</SelectItem>
                          <SelectItem value="others">{t('auth.values.specialty.others', 'Others (Please specify)')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Other Specialty */}
                    {specialty === 'others' && (
                      <div>
                        <Label htmlFor="otherSpecialty">{t('auth.fields.specifySpecialty', 'Please specify your specialty')} *</Label>
                        <Input
                          id="otherSpecialty"
                          placeholder={t('auth.fields.specialtyPlaceholder', 'Enter your specialty')}
                          className="h-12"
                          required
                          value={otherSpecialty}
                          onChange={(e) => setOtherSpecialty(e.target.value)}
                        />
                      </div>
                    )}

                    {/* Experience */}
                    <div>
                      <Label htmlFor="doctorExperience">{t('auth.fields.yearsOfExperience', 'Years of Experience')} *</Label>
                      <Input
                        id="doctorExperience"
                        type="number"
                        min="0"
                        placeholder={t('auth.fields.yearsExample', 'e.g. 7')}
                        className="h-12"
                        required
                        value={doctorExperience}
                        onChange={(e) => setDoctorExperience(e.target.value)}
                      />
                    </div>

                    {/* Consultation Languages */}
                    <div className="space-y-2">
                      <Label>{t('auth.fields.consultationLanguages', 'Preferred Consultation Languages')} *</Label>
                      <p className="text-xs text-muted-foreground">
                        {t('auth.fields.consultationLanguagesHint', 'Select all languages you can use to consult patients.')}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-lg border border-border p-3 max-h-56 overflow-y-auto">
                        {consultationLanguageOptions.map((language) => (
                          <label key={language.value} className="flex items-center gap-2 text-sm cursor-pointer">
                            <input
                              type="checkbox"
                              checked={consultationLanguages.includes(language.value)}
                              onChange={() => toggleConsultationLanguage(language.value)}
                              className="rounded border-border"
                            />
                            <span>{language.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Specialist Rate */}
                    {specialistRequiresRate && (
                      <div className="space-y-2">
                        <Label htmlFor="consultationRate">{t('auth.fields.consultationRateNgn', 'Consultation Rate (NGN)')} *</Label>
                        <Input
                          id="consultationRate"
                          type="text"
                          inputMode="decimal"
                          placeholder={t('auth.fields.consultationRatePlaceholder', 'Enter your rate per consultation')}
                          className="h-12"
                          required
                          value={consultationRate}
                          onChange={(e) => setConsultationRate(e.target.value.replace(/[^0-9.,]/g, ''))}
                        />
                        <p className="text-xs text-muted-foreground">
                          Revenue sharing: You receive 70% and MyE-Doctor receives 30%.
                          {parsedConsultationRate && (
                            <> You keep {formatCurrency(parsedConsultationRate * 0.7)} and MyE-Doctor gets {formatCurrency(parsedConsultationRate * 0.3)}.</>
                          )}
                        </p>
                      </div>
                    )}

                    {/* General Practitioner Fixed Rate */}
                    {generalPractitionerSelected && (
                      <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
                        <p className="text-xs text-foreground">
                          General Practitioner consultations are fixed at <strong>{formatCurrency(5000)}</strong> per session. You receive <strong>60%</strong> ({formatCurrency(3000)}) and MyE-Doctor receives <strong>40%</strong> ({formatCurrency(2000)}).
                        </p>
                      </div>
                    )}

                    {/* Medical License */}
                    <div>
                      <Label htmlFor="medicalLicense">{t('auth.fields.medicalLicense', 'Medical License / Registration Certificate')} *</Label>
                      <div className="mt-1.5 space-y-2">
                        <input
                          id="medicalLicense"
                          ref={medicalLicenseInputRef}
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          className="hidden"
                          onChange={(e) => setMedicalLicense(e.target.files?.[0] || null)}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full justify-start gap-2 h-12"
                          onClick={() => medicalLicenseInputRef.current?.click()}
                        >
                          <Upload className="w-4 h-4" />
                          {t('auth.fields.chooseFileToUpload', 'Choose file to upload')}
                        </Button>
                        <p className="text-xs text-muted-foreground">
                          {medicalLicense?.name || t('auth.fields.noFileSelected', 'No file selected')}
                        </p>
                      </div>
                    </div>

                    {/* Identification */}
                    <div className="space-y-4">
                      <div>
                        <Label>{t('auth.fields.meansOfIdentification', 'Means of Identification')} *</Label>
                        <Select value={doctorIdType} onValueChange={setDoctorIdType}>
                          <SelectTrigger className="h-12">
                            <SelectValue placeholder={t('auth.fields.selectIdType', 'Select ID type')} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="nin">{t('auth.values.id.nin', 'National Identification Number (NIN)')}</SelectItem>
                            <SelectItem value="passport">{t('auth.values.id.passport', 'International Passport')}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="doctorIdNumber">{t('auth.fields.identificationNumber', 'Identification Number')} *</Label>
                        <Input
                          id="doctorIdNumber"
                          placeholder={t('auth.fields.idNumberPlaceholder', 'Enter ID number')}
                          className="h-12"
                          required
                          value={doctorIdNumber}
                          onChange={(e) => setDoctorIdNumber(e.target.value)}
                        />
                      </div>
                    </div>

                    {/* Doctor Consent */}
                    <div className="p-4 border border-border rounded-lg bg-muted/30">
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={doctorConsentAgreed}
                          onChange={(e) => setDoctorConsentAgreed(e.target.checked)}
                          className="mt-1 rounded border-border"
                          required
                        />
                        <span className="text-sm">
                          <strong>{t('auth.consent.doctorTitle', 'Doctor Consent & Agreement:')}</strong>{' '}
                          {t(
                            'auth.consent.doctorBody',
                            "I agree to provide virtual medical consultations through My E-Doctor in accordance with applicable laws and professional standards. I commit to maintaining patient confidentiality and securely handling all health information. I acknowledge the limitations of telemedicine and will exercise appropriate clinical judgment while delivering care through this platform. I further confirm that I have read, understood, and agree to MyE-Doctor's Terms and Conditions."
                          )}
                        </span>
                      </label>
                    </div>
                  </div>
                )}
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
      <div className="hidden lg:flex flex-1 gradient-hero items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 right-20 w-64 h-64 bg-primary-foreground rounded-full blur-3xl" />
          <div className="absolute bottom-20 left-20 w-96 h-96 bg-primary-foreground rounded-full blur-3xl" />
        </div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="relative z-10 max-w-md"
        >
          <h2 className="text-3xl font-bold text-primary-foreground mb-6">
            {mode === 'register' && role === 'patient'
              ? t('auth.rightPanel.completeRegistration', 'Complete Your Registration')
              : t('auth.rightPanel.tagline', '-Your Doctor, Anytime, Anywhere')}
          </h2>
          <p className="text-primary-foreground/80 mb-8">
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
                <div className="w-6 h-6 rounded-full bg-primary-foreground/20 flex items-center justify-center">
                  <Check className="w-4 h-4 text-primary-foreground" />
                </div>
                <span className="text-primary-foreground">{benefit}</span>
              </motion.li>
            ))}
          </ul>
        </motion.div>
      </div>
    </div>
  );
}
