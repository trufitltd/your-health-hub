import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, User, FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/use-toast';

type AppRole = 'patient' | 'doctor';

type DoctorRow = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone_number: string | null;
  gender: string | null;
  age: number | null;
  city: string | null;
  state: string | null;
  country: string | null;
  marital_status: string | null;
  hospital_affiliation: string | null;
  specialty: string | null;
  experience: string | null;
  rate_per_consultation: number | null;
  preferred_consultation_languages: string[] | null;
  profile_picture_url: string | null;
  medical_license_url: string | null;
  identification_type: string | null;
  identification_number: string | null;
  verification_status: string | null;
};

type PatientRow = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone_number: string | null;
  gender: string | null;
  age: number | null;
  city: string | null;
  state: string | null;
  country: string | null;
  marital_status: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  profile_picture_url: string | null;
  post_auth_prompt_completed: boolean | null;
  identification_type: string | null;
  identification_number: string | null;
};

const isFilled = (value: string | null | undefined) => !!String(value || '').trim();
const normalizeSpecialtyValue = (value: string) =>
  value
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const DOCTOR_SPECIALTY_OPTIONS = [
  'General Practice',
  'Cardiology',
  'Dermatology',
  'Endocrinology',
  'Family Medicine',
  'Gastroenterology',
  'General Surgery',
  'Hematology',
  'Internal Medicine',
  'Nephrology',
  'Neurology',
  'Neurosurgery',
  'Obstetrics and Gynecology',
  'Oncology',
  'Ophthalmology',
  'Orthopedics',
  'Otolaryngology (ENT)',
  'Pediatrics',
  'Psychiatry',
  'Pulmonology',
  'Radiology',
  'Rheumatology',
  'Urology',
] as const;

const DOCTOR_SPECIALTY_OTHER_VALUE = '__other__';
const GENERAL_PRACTITIONER_SPECIALTY_KEYS = new Set([
  'general practice',
  'general practitioner',
  'general medicine',
  'gp',
]);
const CONSULTATION_LANGUAGE_OPTIONS = [
  { value: 'english', label: 'English' },
  { value: 'hausa', label: 'Hausa' },
  { value: 'igbo', label: 'Igbo' },
  { value: 'yoruba', label: 'Yoruba' },
  { value: 'arabic', label: 'Arabic' },
  { value: 'swahili', label: 'Swahili' },
  { value: 'fulfulde', label: 'Fulfulde' },
  { value: 'tiv', label: 'Tiv' },
  { value: 'pidgin_english', label: 'Pidgin English' },
  { value: 'french', label: 'French' },
  { value: 'spanish', label: 'Spanish' },
  { value: 'portuguese', label: 'Portuguese' },
] as const;

const DOCTOR_SPECIALTY_NORMALIZED_MAP = new Map(
  DOCTOR_SPECIALTY_OPTIONS.map((specialty) => [normalizeSpecialtyValue(specialty), specialty] as const)
);

const isPlaceholderValue = (value: string | null | undefined, placeholders: string[]) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return true;
  return placeholders.some((placeholder) => normalized === placeholder);
};

const sanitizePatientTextPrefill = (value: string | null | undefined, placeholders: string[]) => (
  isPlaceholderValue(value, placeholders) ? '' : String(value || '').trim()
);

const sanitizeDoctorTextPrefill = (value: string | null | undefined, placeholders: string[]) => (
  isPlaceholderValue(value, placeholders) ? '' : String(value || '').trim()
);

export default function CompleteRegistration() {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [doctorRow, setDoctorRow] = useState<DoctorRow | null>(null);
  const [patientRow, setPatientRow] = useState<PatientRow | null>(null);
  const [role, setRole] = useState<AppRole>('patient');

  const [profileFile, setProfileFile] = useState<File | null>(null);
  const [licenseFile, setLicenseFile] = useState<File | null>(null);

  // Doctor profile fields
  const [doctorFullName, setDoctorFullName] = useState('');
  const [doctorPhoneNumber, setDoctorPhoneNumber] = useState('');
  const [doctorGender, setDoctorGender] = useState('');
  const [doctorAge, setDoctorAge] = useState('');
  const [doctorCity, setDoctorCity] = useState('');
  const [doctorState, setDoctorState] = useState('');
  const [doctorCountry, setDoctorCountry] = useState('');
  const [doctorMaritalStatus, setDoctorMaritalStatus] = useState('');
  const [doctorHospitalAffiliation, setDoctorHospitalAffiliation] = useState('');
  const [doctorSpecialtySelection, setDoctorSpecialtySelection] = useState('');
  const [doctorSpecialtyOther, setDoctorSpecialtyOther] = useState('');
  const [doctorConsultationRate, setDoctorConsultationRate] = useState('');
  const [doctorExperience, setDoctorExperience] = useState('');
  const [doctorConsultationLanguages, setDoctorConsultationLanguages] = useState<string[]>([]);
  const [doctorIdentificationType, setDoctorIdentificationType] = useState('');
  const [doctorIdentificationNumber, setDoctorIdentificationNumber] = useState('');

  // Patient profile fields
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [gender, setGender] = useState('');
  const [age, setAge] = useState('');
  const [city, setCity] = useState('');
  const [patientState, setPatientState] = useState('');
  const [country, setCountry] = useState('');
  const [maritalStatus, setMaritalStatus] = useState('');
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');
  const [identificationType, setIdentificationType] = useState('');
  const [identificationNumber, setIdentificationNumber] = useState('');
  const [consentAgreed, setConsentAgreed] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate('/auth?mode=login', { replace: true });
      return;
    }

    const fetchRows = async () => {
      setLoading(true);
      const [{ data: doctorData, error: doctorError }, { data: patientData, error: patientError }] = await Promise.all([
        supabase.from('doctor_registrations').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('patient_registrations').select('*').eq('user_id', user.id).maybeSingle(),
      ]);

      if (doctorError) console.warn('CompleteRegistration doctor row fetch warning:', doctorError);
      if (patientError) console.warn('CompleteRegistration patient row fetch warning:', patientError);

      setDoctorRow((doctorData as DoctorRow | null) ?? null);
      setPatientRow((patientData as PatientRow | null) ?? null);

      const metadataRole = (String(user.user_metadata?.role || '').toLowerCase() === 'doctor' ? 'doctor' : 'patient') as AppRole;
      setRole(metadataRole);

      const doctorComplete = !!doctorData && isFilled((doctorData as DoctorRow).medical_license_url);
      const patientComplete = !!patientData && (
        isFilled((patientData as PatientRow).profile_picture_url)
        || Boolean((patientData as PatientRow).post_auth_prompt_completed)
      );

      if (metadataRole === 'doctor' && doctorComplete) {
        setLoading(false);
        navigate('/doctor-portal', { replace: true });
        return;
      }
      if (metadataRole === 'patient' && patientComplete) {
        setLoading(false);
        navigate('/patient-portal', { replace: true });
        return;
      }

      // Pre-fill patient fields from existing row or metadata
      if (metadataRole === 'patient') {
        const p = patientData as PatientRow | null;
        const safeFullName = sanitizePatientTextPrefill(p?.full_name, ['user']);
        const safePhoneNumber = sanitizePatientTextPrefill(p?.phone_number, ['n/a', 'na']);
        const safeGender = sanitizePatientTextPrefill(p?.gender, []);
        const safeAge = Number(p?.age || 0) === 18 ? '' : (p?.age ? String(p.age) : '');
        const safeCity = sanitizePatientTextPrefill(p?.city, ['unknown']);
        const safeState = sanitizePatientTextPrefill(p?.state, ['unknown']);
        const safeCountry = sanitizePatientTextPrefill(p?.country, ['unknown']);
        const safeMaritalStatus = sanitizePatientTextPrefill(p?.marital_status, []);
        const safeEmergencyContactName = sanitizePatientTextPrefill(p?.emergency_contact_name, ['not provided', 'not-provided']);
        const safeEmergencyContactPhone = sanitizePatientTextPrefill(p?.emergency_contact_phone, ['n/a', 'na']);
        const safeIdentificationType = sanitizePatientTextPrefill(p?.identification_type, []);
        const safeIdentificationNumberRaw = sanitizePatientTextPrefill(p?.identification_number, []);
        const safeIdentificationNumber = safeIdentificationNumberRaw === user.id ? '' : safeIdentificationNumberRaw;

        setFullName(safeFullName);
        setPhoneNumber(safePhoneNumber);
        setGender(safeGender);
        setAge(safeAge);
        setCity(safeCity);
        setPatientState(safeState);
        setCountry(safeCountry);
        setMaritalStatus(safeMaritalStatus);
        setEmergencyContactName(safeEmergencyContactName);
        setEmergencyContactPhone(safeEmergencyContactPhone);
        setIdentificationType(safeIdentificationType);
        setIdentificationNumber(safeIdentificationNumber);
      }
      if (metadataRole === 'doctor') {
        const d = doctorData as DoctorRow | null;
        const safeFullName = sanitizeDoctorTextPrefill(d?.full_name, ['user']);
        const safePhoneNumber = sanitizeDoctorTextPrefill(d?.phone_number, ['n/a', 'na']);
        const safeGender = sanitizeDoctorTextPrefill(d?.gender, []);
        const safeAge = Number(d?.age || 0) === 18 ? '' : (d?.age ? String(d.age) : '');
        const safeCity = sanitizeDoctorTextPrefill(d?.city, ['unknown']);
        const safeState = sanitizeDoctorTextPrefill(d?.state, ['unknown']);
        const safeCountry = sanitizeDoctorTextPrefill(d?.country, ['unknown']);
        const safeMaritalStatus = sanitizeDoctorTextPrefill(d?.marital_status, ['unknown', 'not provided', 'not-provided']);
        const safeHospitalAffiliation = sanitizeDoctorTextPrefill(d?.hospital_affiliation, ['unknown', 'not provided', 'not-provided', 'n/a', 'na', 'pending update', '(pending update)']);
        const safeSpecialty = sanitizeDoctorTextPrefill(d?.specialty, ['unknown', 'n/a', 'na']);
        const safeRate = d?.rate_per_consultation && Number(d.rate_per_consultation) !== 5000 ? String(d.rate_per_consultation) : '';
        const safeExperience = sanitizeDoctorTextPrefill(d?.experience, ['unknown', 'n/a', 'na', 'pending update', '(pending update)']);
        const safeConsultationLanguages = Array.isArray(d?.preferred_consultation_languages)
          ? d.preferred_consultation_languages
            .map((lang) => String(lang || '').trim().toLowerCase())
            .filter((lang) => CONSULTATION_LANGUAGE_OPTIONS.some((option) => option.value === lang))
          : [];
        const safeIdentificationType = sanitizeDoctorTextPrefill(d?.identification_type, ['unknown']);
        const safeIdentificationNumberRaw = sanitizeDoctorTextPrefill(d?.identification_number, []);
        const safeIdentificationNumber = (
          safeIdentificationNumberRaw === user.id
          || (safeIdentificationNumberRaw.length >= 8 && user.id.startsWith(safeIdentificationNumberRaw))
        ) ? '' : safeIdentificationNumberRaw;

        const normalizedSpecialty = normalizeSpecialtyValue(safeSpecialty);
        const isGenericOtherToken = normalizedSpecialty === 'other' || normalizedSpecialty === 'others' || normalizedSpecialty === DOCTOR_SPECIALTY_OTHER_VALUE;
        const mappedSpecialty = normalizedSpecialty
          ? (
            GENERAL_PRACTITIONER_SPECIALTY_KEYS.has(normalizedSpecialty)
              ? 'General Practice'
              : DOCTOR_SPECIALTY_NORMALIZED_MAP.get(normalizedSpecialty)
          )
          : '';

        setDoctorFullName(safeFullName);
        setDoctorPhoneNumber(safePhoneNumber);
        setDoctorGender(safeGender);
        setDoctorAge(safeAge);
        setDoctorCity(safeCity);
        setDoctorState(safeState);
        setDoctorCountry(safeCountry);
        setDoctorMaritalStatus(safeMaritalStatus);
        setDoctorHospitalAffiliation(safeHospitalAffiliation);
        setDoctorConsultationRate(safeRate);
        setDoctorExperience(safeExperience);
        setDoctorConsultationLanguages(safeConsultationLanguages);
        setDoctorIdentificationType(safeIdentificationType);
        setDoctorIdentificationNumber(safeIdentificationNumber);

        if (!safeSpecialty || isGenericOtherToken) {
          setDoctorSpecialtySelection('General Practice');
          setDoctorSpecialtyOther('');
        } else if (mappedSpecialty) {
          setDoctorSpecialtySelection(mappedSpecialty);
          setDoctorSpecialtyOther('');
        } else {
          setDoctorSpecialtySelection(DOCTOR_SPECIALTY_OTHER_VALUE);
          setDoctorSpecialtyOther(safeSpecialty);
        }
      }

      setLoading(false);
    };

    fetchRows();
  }, [authLoading, navigate, user]);

  const needsDoctorLicense = role === 'doctor' && !isFilled(doctorRow?.medical_license_url);
  const resolvedDoctorSpecialty = (
    doctorSpecialtySelection === DOCTOR_SPECIALTY_OTHER_VALUE
      ? doctorSpecialtyOther
      : doctorSpecialtySelection
  ).trim();
  const selectedDoctorIsGeneralPractice = GENERAL_PRACTITIONER_SPECIALTY_KEYS.has(normalizeSpecialtyValue(resolvedDoctorSpecialty));

  const toggleConsultationLanguage = (language: string) => {
    setDoctorConsultationLanguages((previous) => (
      previous.includes(language)
        ? previous.filter((value) => value !== language)
        : [...previous, language]
    ));
  };

  const handleSubmit = async () => {
    if (!user) return;

    if (role === 'doctor') {
      const parsedConsultationRate = Number(doctorConsultationRate);
      const isGeneralPracticeDoctor = GENERAL_PRACTITIONER_SPECIALTY_KEYS.has(normalizeSpecialtyValue(resolvedDoctorSpecialty));

      const requiredDoctorFields = {
        fullName: doctorFullName.trim(),
        phoneNumber: doctorPhoneNumber.trim(),
        gender: doctorGender.trim(),
        age: Number(doctorAge),
        city: doctorCity.trim(),
        state: doctorState.trim(),
        country: doctorCountry.trim(),
        maritalStatus: doctorMaritalStatus.trim(),
        hospitalAffiliation: doctorHospitalAffiliation.trim(),
        specialty: resolvedDoctorSpecialty,
        ratePerConsultation: parsedConsultationRate,
        experience: doctorExperience.trim(),
        consultationLanguages: doctorConsultationLanguages,
        identificationType: doctorIdentificationType.trim(),
        identificationNumber: doctorIdentificationNumber.trim(),
      };

      if (
        !requiredDoctorFields.fullName
        || !requiredDoctorFields.phoneNumber
        || !requiredDoctorFields.gender
        || !Number.isFinite(requiredDoctorFields.age)
        || requiredDoctorFields.age <= 0
        || !requiredDoctorFields.city
        || !requiredDoctorFields.state
        || !requiredDoctorFields.country
        || !requiredDoctorFields.maritalStatus
        || !requiredDoctorFields.hospitalAffiliation
        || !requiredDoctorFields.specialty
        || !Number.isFinite(requiredDoctorFields.ratePerConsultation)
        || requiredDoctorFields.ratePerConsultation <= 0
        || !requiredDoctorFields.experience
        || requiredDoctorFields.consultationLanguages.length === 0
        || !requiredDoctorFields.identificationType
        || !requiredDoctorFields.identificationNumber
      ) {
        toast({
          title: 'Missing information',
          description: 'All doctor registration fields are required. Please return to sign up and complete every field.',
        });
        return;
      }

      if (!isGeneralPracticeDoctor && requiredDoctorFields.ratePerConsultation < 10000) {
        toast({
          title: 'Invalid consultation rate',
          description: 'Minimum specialist rate is NGN 10,000.',
        });
        return;
      }

      if (needsDoctorLicense && !licenseFile) {
        toast({ title: 'Medical license required', description: 'Please upload your medical license.' });
        return;
      }

      setSaving(true);
      try {
        let profileUrl = doctorRow?.profile_picture_url || null;
        let licenseUrl = doctorRow?.medical_license_url || '';

        if (profileFile) {
          const ext = profileFile.name.split('.').pop() || 'jpg';
          const path = `${user.id}/profile-pictures/profile.${ext}`;
          const { error: uploadError } = await supabase.storage.from('doctor-files').upload(path, profileFile, { upsert: true });
          if (uploadError) throw uploadError;
          profileUrl = supabase.storage.from('doctor-files').getPublicUrl(path).data.publicUrl;
        }

        if (licenseFile) {
          const ext = licenseFile.name.split('.').pop() || 'pdf';
          const path = `${user.id}/credentials/medical-license.${ext}`;
          const { error: uploadError } = await supabase.storage.from('doctor-files').upload(path, licenseFile, { upsert: true });
          if (uploadError) throw uploadError;
          licenseUrl = supabase.storage.from('doctor-files').getPublicUrl(path).data.publicUrl;
        }

        if (!isFilled(licenseUrl)) throw new Error('Medical license is required.');

        const payload = {
          user_id: user.id,
          full_name: requiredDoctorFields.fullName,
          gender: requiredDoctorFields.gender,
          age: requiredDoctorFields.age,
          phone_number: requiredDoctorFields.phoneNumber,
          email: doctorRow?.email || user.email || null,
          city: requiredDoctorFields.city,
          state: requiredDoctorFields.state,
          country: requiredDoctorFields.country,
          marital_status: requiredDoctorFields.maritalStatus,
          hospital_affiliation: requiredDoctorFields.hospitalAffiliation,
          specialty: requiredDoctorFields.specialty,
          rate_per_consultation: requiredDoctorFields.ratePerConsultation,
          experience: requiredDoctorFields.experience,
          preferred_consultation_languages: requiredDoctorFields.consultationLanguages,
          profile_picture_url: profileUrl,
          medical_license_url: licenseUrl,
          identification_type: requiredDoctorFields.identificationType,
          identification_number: requiredDoctorFields.identificationNumber,
          verification_status: doctorRow?.verification_status || 'pending',
        };

        const { error: upsertError } = await supabase.from('doctor_registrations').upsert([payload], { onConflict: 'user_id' });
        if (upsertError) throw upsertError;

        await supabase.from('doctors').update({ avatar_url: profileUrl }).eq('id', user.id);

        toast({ title: 'Registration completed', description: 'Doctor license saved successfully.' });
        navigate('/doctor-portal', { replace: true });
      } catch (error: any) {
        toast({ title: 'Upload failed', description: error?.message || 'Please try again.' });
      } finally {
        setSaving(false);
      }
      return;
    }

    // Patient flow — validate all required fields
    if (!fullName.trim() || fullName.trim().split(/\s+/).filter(Boolean).length < 2) {
      toast({ title: 'Full name required', description: 'Please enter at least first and last name.' });
      return;
    }
    if (
      !phoneNumber.trim()
      || !gender.trim()
      || !age.trim()
      || !city.trim()
      || !patientState.trim()
      || !country.trim()
      || !maritalStatus.trim()
      || !emergencyContactName.trim()
      || !emergencyContactPhone.trim()
      || !identificationType.trim()
      || !identificationNumber.trim()
    ) {
      toast({ title: 'Missing information', description: 'Please fill in all required fields.' });
      return;
    }
    const parsedAge = Number(age);
    if (!Number.isFinite(parsedAge) || parsedAge <= 0) {
      toast({ title: 'Invalid age', description: 'Please enter a valid age greater than zero.' });
      return;
    }
    if (!consentAgreed) {
      toast({ title: 'Consent required', description: 'Please agree to the patient consent to continue.' });
      return;
    }

    setSaving(true);
    try {
      let profileUrl = patientRow?.profile_picture_url || null;
      if (profileFile) {
        const ext = profileFile.name.split('.').pop() || 'jpg';
        const path = `${user.id}/profile-pictures/profile.${ext}`;
        const { error: uploadError } = await supabase.storage.from('patient-files').upload(path, profileFile, { upsert: true });
        if (uploadError) throw uploadError;
        profileUrl = supabase.storage.from('patient-files').getPublicUrl(path).data.publicUrl;
      }

      const payload = {
        user_id: user.id,
        full_name: fullName.trim(),
        gender,
        age: Math.floor(parsedAge),
        phone_number: phoneNumber.trim(),
        email: patientRow?.email || user.email || null,
        city,
        state: patientState,
        country,
        marital_status: maritalStatus,
        emergency_contact_name: emergencyContactName,
        emergency_contact_phone: emergencyContactPhone,
        profile_picture_url: profileUrl,
        identification_type: identificationType,
        identification_number: identificationNumber,
        post_auth_prompt_completed: true,
      };

      const { error: upsertError } = await supabase.from('patient_registrations').upsert([payload], { onConflict: 'user_id' });
      if (upsertError) throw upsertError;

      toast({ title: 'Registration completed', description: 'Welcome to MyE-Doctor!' });
      navigate('/patient-portal', { replace: true });
    } catch (error: any) {
      toast({ title: 'Save failed', description: error?.message || 'Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle>Complete Registration</CardTitle>
          <CardDescription>
            {role === 'doctor'
              ? 'Upload your medical license before accessing Doctor Portal. Profile picture is optional.'
              : 'Please complete your profile to start accessing quality healthcare services.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">

          {/* Profile picture — both roles */}
          <div className="space-y-2">
            <Label htmlFor="profileFile">Profile Picture (Optional)</Label>
            <Input id="profileFile" type="file" accept="image/*" onChange={(e) => setProfileFile(e.target.files?.[0] || null)} />
            <p className="text-xs text-muted-foreground flex items-center gap-1"><User className="w-3 h-3" /> {profileFile?.name || 'No file selected'}</p>
          </div>

          {/* Doctor: medical license */}
          {role === 'doctor' && (
            <div className="space-y-4 pt-2 border-t border-border">
              <h3 className="text-base font-semibold">Doctor Information</h3>

              <div>
                <Label htmlFor="doctorFullName">Full Name *</Label>
                <Input id="doctorFullName" type="text" placeholder="Enter your full name" className="h-12 mt-1.5" value={doctorFullName} onChange={(e) => setDoctorFullName(e.target.value)} required />
              </div>

              <div>
                <Label htmlFor="doctorPhoneNumber">Phone Number *</Label>
                <Input id="doctorPhoneNumber" type="tel" placeholder="Enter phone number" className="h-12 mt-1.5" value={doctorPhoneNumber} onChange={(e) => setDoctorPhoneNumber(e.target.value)} required />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Gender *</Label>
                  <Select value={doctorGender} onValueChange={setDoctorGender}>
                    <SelectTrigger className="h-12 mt-1.5"><SelectValue placeholder="Select gender" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="doctorAge">Age *</Label>
                  <Input id="doctorAge" type="number" placeholder="Age" className="h-12 mt-1.5" min={1} value={doctorAge} onChange={(e) => setDoctorAge(e.target.value)} required />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="doctorCity">City *</Label>
                  <Input id="doctorCity" placeholder="City" className="h-12 mt-1.5" value={doctorCity} onChange={(e) => setDoctorCity(e.target.value)} required />
                </div>
                <div>
                  <Label htmlFor="doctorState">State *</Label>
                  <Input id="doctorState" placeholder="State" className="h-12 mt-1.5" value={doctorState} onChange={(e) => setDoctorState(e.target.value)} required />
                </div>
                <div>
                  <Label htmlFor="doctorCountry">Country *</Label>
                  <Input id="doctorCountry" placeholder="Country" className="h-12 mt-1.5" value={doctorCountry} onChange={(e) => setDoctorCountry(e.target.value)} required />
                </div>
              </div>

              <div>
                <Label>Marital Status *</Label>
                <Select value={doctorMaritalStatus} onValueChange={setDoctorMaritalStatus}>
                  <SelectTrigger className="h-12 mt-1.5"><SelectValue placeholder="Select marital status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">Single</SelectItem>
                    <SelectItem value="married">Married</SelectItem>
                    <SelectItem value="divorced">Divorced</SelectItem>
                    <SelectItem value="widowed">Widowed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="doctorHospitalAffiliation">Hospital Affiliation *</Label>
                <Input id="doctorHospitalAffiliation" placeholder="Hospital affiliation" className="h-12 mt-1.5" value={doctorHospitalAffiliation} onChange={(e) => setDoctorHospitalAffiliation(e.target.value)} required />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Specialty *</Label>
                  <Select value={doctorSpecialtySelection} onValueChange={setDoctorSpecialtySelection}>
                    <SelectTrigger className="h-12 mt-1.5"><SelectValue placeholder="Select specialty" /></SelectTrigger>
                    <SelectContent>
                      {DOCTOR_SPECIALTY_OPTIONS.map((specialty) => (
                        <SelectItem key={specialty} value={specialty}>
                          {specialty}
                        </SelectItem>
                      ))}
                      <SelectItem value={DOCTOR_SPECIALTY_OTHER_VALUE}>Others</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="doctorExperience">Experience (Years) *</Label>
                  <Input id="doctorExperience" placeholder="e.g. 5" className="h-12 mt-1.5" value={doctorExperience} onChange={(e) => setDoctorExperience(e.target.value)} required />
                </div>
              </div>
              {doctorSpecialtySelection === DOCTOR_SPECIALTY_OTHER_VALUE && (
                <div>
                  <Label htmlFor="doctorSpecialtyOther">Specify Specialty *</Label>
                  <Input
                    id="doctorSpecialtyOther"
                    placeholder="Enter your specialty"
                    className="h-12 mt-1.5"
                    value={doctorSpecialtyOther}
                    onChange={(e) => setDoctorSpecialtyOther(e.target.value)}
                    required
                  />
                </div>
              )}
              <div>
                <Label htmlFor="doctorConsultationRate">Consultation Rate (NGN) *</Label>
                <Input
                  id="doctorConsultationRate"
                  type="number"
                  min={1}
                  step="1"
                  placeholder="Enter consultation rate"
                  className="h-12 mt-1.5"
                  value={doctorConsultationRate}
                  onChange={(e) => setDoctorConsultationRate(e.target.value)}
                  required
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  {selectedDoctorIsGeneralPractice
                    ? 'Revenue sharing: You receive 60% and MyE-Doctor receives 40%.'
                    : 'Minimum specialist rate: NGN 10,000. Revenue sharing: You receive 70% and MyE-Doctor receives 30%.'}
                </p>
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-medium">Preferred Consultation Language(s) *</Label>
                <p className="text-xs text-muted-foreground">Select all languages you can use to consult patients.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {CONSULTATION_LANGUAGE_OPTIONS.map((language) => (
                    <label
                      key={language.value}
                      className="flex items-center gap-2 text-sm rounded-md border border-border px-3 py-2 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={doctorConsultationLanguages.includes(language.value)}
                        onChange={() => toggleConsultationLanguage(language.value)}
                      />
                      <span>{language.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <Label>Identification Type *</Label>
                  <Select value={doctorIdentificationType} onValueChange={setDoctorIdentificationType}>
                    <SelectTrigger className="h-12 mt-1.5"><SelectValue placeholder="Select ID type" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nin">National Identification Number (NIN)</SelectItem>
                      <SelectItem value="student_id">Student ID Card</SelectItem>
                      <SelectItem value="passport">International Passport</SelectItem>
                      <SelectItem value="drivers_license">National Driver&apos;s License</SelectItem>
                      <SelectItem value="voters_card">Voter&apos;s Card</SelectItem>
                      <SelectItem value="hospital_id">Hospital / HMO ID Card</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="doctorIdentificationNumber">Identification Number *</Label>
                  <Input id="doctorIdentificationNumber" placeholder="Enter ID number" className="h-12 mt-1.5" value={doctorIdentificationNumber} onChange={(e) => setDoctorIdentificationNumber(e.target.value)} required />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="licenseFile">Medical License (Required)</Label>
                <Input id="licenseFile" type="file" accept="image/*,.pdf" onChange={(e) => setLicenseFile(e.target.files?.[0] || null)} />
                <p className="text-xs text-muted-foreground flex items-center gap-1"><FileText className="w-3 h-3" /> {licenseFile?.name || 'No file selected'}</p>
              </div>
            </div>
          )}

          {/* Patient: all profile fields */}
          {role === 'patient' && (
            <div className="space-y-4 pt-2 border-t border-border">
              <h3 className="text-base font-semibold">Patient Information</h3>

              <div>
                <Label htmlFor="fullName">Full Name *</Label>
                <Input id="fullName" type="text" placeholder="Enter your full name" className="h-12 mt-1.5" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
              </div>

              <div>
                <Label htmlFor="phoneNumber">Phone Number *</Label>
                <Input id="phoneNumber" type="tel" placeholder="Enter phone number" className="h-12 mt-1.5" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} required />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Gender *</Label>
                  <Select value={gender} onValueChange={setGender}>
                    <SelectTrigger className="h-12 mt-1.5"><SelectValue placeholder="Select gender" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="age">Age *</Label>
                  <Input id="age" type="number" placeholder="Age" className="h-12 mt-1.5" min={1} value={age} onChange={(e) => setAge(e.target.value)} required />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="city">City *</Label>
                  <Input id="city" placeholder="City" className="h-12 mt-1.5" value={city} onChange={(e) => setCity(e.target.value)} required />
                </div>
                <div>
                  <Label htmlFor="patientState">State *</Label>
                  <Input id="patientState" placeholder="State" className="h-12 mt-1.5" value={patientState} onChange={(e) => setPatientState(e.target.value)} required />
                </div>
                <div>
                  <Label htmlFor="country">Country *</Label>
                  <Input id="country" placeholder="Country" className="h-12 mt-1.5" value={country} onChange={(e) => setCountry(e.target.value)} required />
                </div>
              </div>

              <div>
                <Label>Marital Status *</Label>
                <Select value={maritalStatus} onValueChange={setMaritalStatus}>
                  <SelectTrigger className="h-12 mt-1.5"><SelectValue placeholder="Select marital status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">Single</SelectItem>
                    <SelectItem value="married">Married</SelectItem>
                    <SelectItem value="divorced">Divorced</SelectItem>
                    <SelectItem value="widowed">Widowed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="emergencyContactName">Emergency Contact Name *</Label>
                  <Input id="emergencyContactName" placeholder="Contact name" className="h-12 mt-1.5" value={emergencyContactName} onChange={(e) => setEmergencyContactName(e.target.value)} required />
                </div>
                <div>
                  <Label htmlFor="emergencyContactPhone">Emergency Contact Phone *</Label>
                  <Input id="emergencyContactPhone" type="tel" placeholder="Contact phone" className="h-12 mt-1.5" value={emergencyContactPhone} onChange={(e) => setEmergencyContactPhone(e.target.value)} required />
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <Label>Identification Type *</Label>
                  <Select value={identificationType} onValueChange={setIdentificationType}>
                    <SelectTrigger className="h-12 mt-1.5"><SelectValue placeholder="Select ID type" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nin">National Identification Number (NIN)</SelectItem>
                      <SelectItem value="student_id">Student ID Card</SelectItem>
                      <SelectItem value="passport">International Passport</SelectItem>
                      <SelectItem value="drivers_license">National Driver's License</SelectItem>
                      <SelectItem value="voters_card">Voter's Card</SelectItem>
                      <SelectItem value="hospital_id">Hospital / HMO ID Card</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="identificationNumber">Identification Number *</Label>
                  <Input id="identificationNumber" placeholder="Enter ID number" className="h-12 mt-1.5" value={identificationNumber} onChange={(e) => setIdentificationNumber(e.target.value)} required />
                </div>
              </div>

              <div className="p-4 border border-border rounded-lg bg-muted/30">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={consentAgreed}
                    onChange={(e) => setConsentAgreed(e.target.checked)}
                    className="mt-1 rounded border-border"
                  />
                  <span className="text-sm">
                    <strong>Patient Consent:</strong>{' '}
                    By proceeding, I consent to receive healthcare services via My e-Doctor through virtual consultation. I understand that telemedicine has limitations compared to in-person care and that my provider will rely on the information I provide. I agree that my personal and medical information will be securely stored and used for my care in accordance with confidentiality and data protection standards. I also consent that my anonymized (de-identified) health data may be used for research, audit, or educational purposes to improve healthcare services, without revealing my identity. I understand that I may decline this or withdraw at any time without affecting my care.
                  </span>
                </label>
              </div>
            </div>
          )}

          <Button className="w-full" onClick={handleSubmit} disabled={saving}>
            <Upload className="w-4 h-4 mr-2" />
            {saving ? 'Saving...' : role === 'doctor' ? 'Save and Continue' : 'Complete Registration'}
          </Button>

        </CardContent>
      </Card>
    </div>
  );
}
