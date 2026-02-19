import { useState } from 'react';
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

type AuthMode = 'login' | 'register' | 'verify';
type UserRole = 'patient' | 'doctor';

const benefits = [
  'Access to 50+ certified specialists',
  'Secure video & audio consultations',
  'Easy appointment booking',
  'Digital prescriptions & records',
];

export default function AuthPage() {
  const [searchParams] = useSearchParams();
  const initialMode = searchParams.get('mode') === 'register' ? 'register' : 'login';

  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [role, setRole] = useState<UserRole>('patient');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('+234');
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (mode === 'register') {
        // Validate email for all users
        if (!email) {
          toast({ title: 'Email required', description: 'Please enter your email address.' });
          setIsLoading(false);
          return;
        }
        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          toast({ title: 'Invalid email', description: 'Please enter a valid email address.' });
          setIsLoading(false);
          return;
        }

        const normalizedPhone = phoneNumber.trim();
        const phoneDigits = normalizedPhone.replace(/\D/g, '');
        if (!normalizedPhone || normalizedPhone === '+234' || phoneDigits.length < 13) {
          toast({ title: 'Phone number required', description: 'Please enter a valid phone number (e.g., +2348012345678).' });
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
          email,
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
              phone_number: phoneNumber,
              email,
              city,
              state,
              country,
              marital_status: maritalStatus,
              hospital_affiliation: hospitalAffiliation,
              specialty: resolvedSpecialty,
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
              phone_number: phoneNumber,
              email,
              city,
              state,
              country,
              marital_status: maritalStatus,
              emergency_contact_name: emergencyContactName,
              emergency_contact_phone: emergencyContactPhone,
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
          phoneNumber,
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
            {mode === 'login' ? 'Welcome back' : mode === 'verify' ? 'Verify your email' : 'Create your account'}
          </h1>
          <p className="text-muted-foreground mb-8">
            {mode === 'login'
              ? 'Sign in with your email to access your health dashboard'
              : mode === 'verify'
              ? `Enter the verification code sent to ${email}`
              : 'Join thousands of patients getting quality healthcare'}
          </p>

          {/* Role Selection (Register only) */}
          {mode === 'register' && (
            <div className="mb-6">
              <Label className="text-sm font-medium mb-3 block">I am a:</Label>
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
                    <p className="font-semibold capitalize">{r}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {r === 'patient' ? 'Book consultations' : 'Provide consultations'}
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
                <Label htmlFor="verificationCode">Verification Code</Label>
                <Input
                  id="verificationCode"
                  type="text"
                  placeholder="Enter 6-digit code"
                  className="h-12 text-center text-2xl tracking-widest"
                  maxLength={6}
                  required
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                />
                <div className="flex flex-col gap-2 mt-2">
                  <p className="text-sm text-muted-foreground">
                    Didn't receive the code?{' '}
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
                      Resend code
                    </button>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Having issues?{' '}
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
                      Start over
                    </button>
                  </p>
                </div>
              </div>
            ) : (
              <>
                {mode === 'register' && (
                  <div>
                    <Label htmlFor="name">Full Name</Label>
                    <div className="relative mt-1.5">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                      <Input
                        id="name"
                        type="text"
                        placeholder="Enter your full name"
                        className="pl-10 h-12"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                <div>
                  <Label htmlFor="email">{mode === 'login' ? 'Email Address' : 'Email Address *'}</Label>
                  <div className="relative mt-1.5">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder={mode === 'login' ? 'Enter your email' : 'Enter your email address'}
                      className="pl-10 h-12"
                      required={mode !== 'login' || mode === 'login'}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>

                {mode !== 'login' && (
                  <div>
                    <Label htmlFor="phoneNumber">{mode === 'register' ? 'Phone Number *' : 'Phone Number'}</Label>
                    <div className="relative mt-1.5">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                      <Input
                        id="phoneNumber"
                        type="tel"
                        placeholder="+2348012345678"
                        className="pl-10 h-12"
                        required={mode === 'register'}
                        value={phoneNumber}
                        onChange={(e) => {
                          let value = e.target.value;
                          if (value && !value.startsWith('+234')) {
                            value = '+234' + value.replace(/^\+?234?/, '');
                          }
                          setPhoneNumber(value);
                        }}
                      />
                    </div>
                  </div>
                )}

                <div>
                  <Label htmlFor="password">Password</Label>
                  <div className="relative mt-1.5">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder={mode === 'register' ? 'Create a password' : 'Enter your password'}
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
                    <h3 className="text-lg font-semibold">Patient Information</h3>
                    
                    {/* Gender & Age */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label>Gender *</Label>
                        <Select value={gender} onValueChange={setGender}>
                          <SelectTrigger className="h-12">
                            <SelectValue placeholder="Select gender" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="male">Male</SelectItem>
                            <SelectItem value="female">Female</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="age">Age *</Label>
                        <Input
                          id="age"
                          type="number"
                          placeholder="Age"
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
                        <Label htmlFor="city">City *</Label>
                        <Input
                          id="city"
                          placeholder="City"
                          className="h-12"
                          required
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="state">State *</Label>
                        <Input
                          id="state"
                          placeholder="State"
                          className="h-12"
                          required
                          value={state}
                          onChange={(e) => setState(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="country">Country *</Label>
                        <Input
                          id="country"
                          placeholder="Country"
                          className="h-12"
                          required
                          value={country}
                          onChange={(e) => setCountry(e.target.value)}
                        />
                      </div>
                    </div>

                    {/* Marital Status */}
                    <div>
                      <Label>Marital Status *</Label>
                      <Select value={maritalStatus} onValueChange={setMaritalStatus}>
                        <SelectTrigger className="h-12">
                          <SelectValue placeholder="Select marital status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="single">Single</SelectItem>
                          <SelectItem value="married">Married</SelectItem>
                          <SelectItem value="divorced">Divorced</SelectItem>
                          <SelectItem value="widowed">Widowed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Emergency Contact */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="emergencyContactName">Emergency Contact Name *</Label>
                        <Input
                          id="emergencyContactName"
                          placeholder="Contact name"
                          className="h-12"
                          required
                          value={emergencyContactName}
                          onChange={(e) => setEmergencyContactName(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="emergencyContactPhone">Emergency Contact Phone *</Label>
                        <Input
                          id="emergencyContactPhone"
                          type="tel"
                          placeholder="Contact phone"
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
                        <Label>Identification Type *</Label>
                        <Select value={identificationType} onValueChange={setIdentificationType}>
                          <SelectTrigger className="h-12">
                            <SelectValue placeholder="Select ID type" />
                          </SelectTrigger>
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
                        <Input
                          id="identificationNumber"
                          placeholder="Enter ID number"
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
                          <strong>Patient Consent:</strong> I Agree to participate in a virtual consultation with My E-Doctor. I understand that my information will be kept confidential and securely used for medical care. I acknowledge the limitations of virtual consultations and agree to follow my healthcare provider's instructions.
                        </span>
                      </label>
                    </div>
                  </div>
                )}

                {/* Doctor Registration Fields */}
                {mode === 'register' && role === 'doctor' && (
                  <div className="space-y-4 pt-4 border-t border-border">
                    <h3 className="text-lg font-semibold">Doctor Information</h3>
                    
                    {/* Profile Picture */}
                    <div>
                      <Label htmlFor="profilePicture">Profile Picture (Optional)</Label>
                      <div className="relative mt-1.5">
                        <Upload className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                        <Input
                          id="profilePicture"
                          type="file"
                          accept="image/*"
                          className="pl-10 h-12"
                          onChange={(e) => setProfilePicture(e.target.files?.[0] || null)}
                        />
                      </div>
                    </div>

                    {/* Gender & Age */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label>Gender *</Label>
                        <Select value={gender} onValueChange={setGender}>
                          <SelectTrigger className="h-12">
                            <SelectValue placeholder="Select gender" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="male">Male</SelectItem>
                            <SelectItem value="female">Female</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="age">Age *</Label>
                        <Input
                          id="age"
                          type="number"
                          placeholder="Age"
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
                        <Label htmlFor="city">City *</Label>
                        <Input
                          id="city"
                          placeholder="City"
                          className="h-12"
                          required
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="state">State *</Label>
                        <Input
                          id="state"
                          placeholder="State"
                          className="h-12"
                          required
                          value={state}
                          onChange={(e) => setState(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="country">Country *</Label>
                        <Input
                          id="country"
                          placeholder="Country"
                          className="h-12"
                          required
                          value={country}
                          onChange={(e) => setCountry(e.target.value)}
                        />
                      </div>
                    </div>

                    {/* Marital Status */}
                    <div>
                      <Label>Marital Status *</Label>
                      <Select value={maritalStatus} onValueChange={setMaritalStatus}>
                        <SelectTrigger className="h-12">
                          <SelectValue placeholder="Select marital status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="single">Single</SelectItem>
                          <SelectItem value="married">Married</SelectItem>
                          <SelectItem value="divorced">Divorced</SelectItem>
                          <SelectItem value="widowed">Widowed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Hospital Affiliation */}
                    <div>
                      <Label htmlFor="hospitalAffiliation">Hospital Affiliation(s) *</Label>
                      <Input
                        id="hospitalAffiliation"
                        placeholder="Enter hospital affiliations"
                        className="h-12"
                        required
                        value={hospitalAffiliation}
                        onChange={(e) => setHospitalAffiliation(e.target.value)}
                      />
                    </div>

                    {/* Specialty */}
                    <div>
                      <Label>Specialty *</Label>
                      <Select value={specialty} onValueChange={setSpecialty}>
                        <SelectTrigger className="h-12">
                          <SelectValue placeholder="Select your specialty" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="general_practitioner">General Practitioner</SelectItem>
                          <SelectItem value="pediatrics">Pediatrics</SelectItem>
                          <SelectItem value="obstetrics_gynecology">Obstetrics & Gynecology</SelectItem>
                          <SelectItem value="psychiatry">Psychiatry / Mental Health</SelectItem>
                          <SelectItem value="dermatology">Dermatology</SelectItem>
                          <SelectItem value="endocrinology">Endocrinology</SelectItem>
                          <SelectItem value="rheumatology">Rheumatology</SelectItem>
                          <SelectItem value="cardiology">Cardiology</SelectItem>
                          <SelectItem value="oncology">Oncology</SelectItem>
                          <SelectItem value="infectious_diseases">Infectious Diseases</SelectItem>
                          <SelectItem value="family_medicine">Family Medicine</SelectItem>
                          <SelectItem value="urology">Urology</SelectItem>
                          <SelectItem value="orthopedics">Orthopedics</SelectItem>
                          <SelectItem value="ent">ENT (Ear, Nose & Throat)</SelectItem>
                          <SelectItem value="ophthalmology">Ophthalmology</SelectItem>
                          <SelectItem value="neurology">Neurology</SelectItem>
                          <SelectItem value="radiology">Radiology</SelectItem>
                          <SelectItem value="others">Others (Please specify)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Other Specialty */}
                    {specialty === 'others' && (
                      <div>
                        <Label htmlFor="otherSpecialty">Please specify your specialty *</Label>
                        <Input
                          id="otherSpecialty"
                          placeholder="Enter your specialty"
                          className="h-12"
                          required
                          value={otherSpecialty}
                          onChange={(e) => setOtherSpecialty(e.target.value)}
                        />
                      </div>
                    )}

                    {/* Experience */}
                    <div>
                      <Label htmlFor="doctorExperience">Years of Experience *</Label>
                      <Input
                        id="doctorExperience"
                        type="number"
                        min="0"
                        placeholder="e.g. 7"
                        className="h-12"
                        required
                        value={doctorExperience}
                        onChange={(e) => setDoctorExperience(e.target.value)}
                      />
                    </div>

                    {/* Specialist Rate */}
                    {specialistRequiresRate && (
                      <div className="space-y-2">
                        <Label htmlFor="consultationRate">Consultation Rate (NGN) *</Label>
                        <Input
                          id="consultationRate"
                          type="text"
                          inputMode="decimal"
                          placeholder="Enter your rate per consultation"
                          className="h-12"
                          required
                          value={consultationRate}
                          onChange={(e) => setConsultationRate(e.target.value.replace(/[^0-9.,]/g, ''))}
                        />
                        <p className="text-xs text-muted-foreground">
                          Revenue sharing: You receive 70% and MyE-Doctor receives 30%.
                          {parsedConsultationRate && (
                            <> You keep ₦{(parsedConsultationRate * 0.7).toLocaleString()} and MyE-Doctor gets ₦{(parsedConsultationRate * 0.3).toLocaleString()}.</>
                          )}
                        </p>
                      </div>
                    )}

                    {/* General Practitioner Fixed Rate */}
                    {generalPractitionerSelected && (
                      <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
                        <p className="text-xs text-foreground">
                          General Practitioner consultations are fixed at <strong>₦5,000</strong> per session. You receive <strong>60%</strong> (₦3,000) and MyE-Doctor receives <strong>40%</strong> (₦2,000).
                        </p>
                      </div>
                    )}

                    {/* Medical License */}
                    <div>
                      <Label htmlFor="medicalLicense">Medical License / Registration Certificate *</Label>
                      <div className="relative mt-1.5">
                        <Upload className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                        <Input
                          id="medicalLicense"
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          className="pl-10 h-12"
                          required
                          onChange={(e) => setMedicalLicense(e.target.files?.[0] || null)}
                        />
                      </div>
                    </div>

                    {/* Identification */}
                    <div className="space-y-4">
                      <div>
                        <Label>Means of Identification *</Label>
                        <Select value={doctorIdType} onValueChange={setDoctorIdType}>
                          <SelectTrigger className="h-12">
                            <SelectValue placeholder="Select ID type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="nin">National Identification Number (NIN)</SelectItem>
                            <SelectItem value="passport">International Passport</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="doctorIdNumber">Identification Number *</Label>
                        <Input
                          id="doctorIdNumber"
                          placeholder="Enter ID number"
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
                          <strong>Doctor Consent & Agreement:</strong> I agree to provide virtual medical consultations through My E-Doctor in accordance with applicable laws and professional standards. I commit to maintaining patient confidentiality and securely handling all health information. I acknowledge the limitations of telemedicine and will exercise appropriate clinical judgment while delivering care through this platform. I further confirm that I have read, understood, and agree to MyE-Doctor’s Terms and Conditions.
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
                  <span className="text-muted-foreground">Remember me</span>
                </label>
                <Link to="/forgot-password" className="text-primary hover:underline">
                  Forgot password?
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
                  {mode === 'login' ? 'Signing in...' : mode === 'verify' ? 'Verifying...' : 'Creating account...'}
                </span>
              ) : (
                <>
                  {mode === 'login' ? 'Sign In' : mode === 'verify' ? 'Verify Code' : 'Create Account'}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </form>

          {/* Toggle Mode */}
          {mode !== 'verify' && (
            <p className="text-center text-sm text-muted-foreground mt-6">
              {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
              <button
                type="button"
                onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
                className="text-primary font-medium hover:underline"
              >
                {mode === 'login' ? 'Sign up' : 'Sign in'}
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
            {mode === 'register' && role === 'patient' ? 'Complete Your Registration' : '-Your Doctor, Anytime, Anywhere'}
          </h2>
          <p className="text-primary-foreground/80 mb-8">
            {mode === 'register' && role === 'patient' 
              ? 'Fill in your details to create your patient profile and start accessing quality healthcare services.'
              : 'Join MyEdoctor and experience healthcare reimagined. Connect with top specialists, manage appointments, and access your health records — all in one place.'}
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
