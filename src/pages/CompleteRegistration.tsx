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
        setFullName(p?.full_name || String(user.user_metadata?.full_name || user.user_metadata?.name || ''));
        setPhoneNumber(p?.phone_number || String(user.user_metadata?.phone_number || ''));
        setGender(p?.gender || String(user.user_metadata?.gender || ''));
        setAge(p?.age ? String(p.age) : String(user.user_metadata?.age || ''));
        setCity(p?.city || String(user.user_metadata?.city || ''));
        setPatientState(p?.state || String(user.user_metadata?.state || ''));
        setCountry(p?.country || String(user.user_metadata?.country || ''));
        setMaritalStatus(p?.marital_status || String(user.user_metadata?.marital_status || ''));
        setEmergencyContactName(p?.emergency_contact_name || String(user.user_metadata?.emergency_contact_name || ''));
        setEmergencyContactPhone(p?.emergency_contact_phone || String(user.user_metadata?.emergency_contact_phone || ''));
        setIdentificationType(p?.identification_type || '');
        setIdentificationNumber(p?.identification_number || '');
      }

      setLoading(false);
    };

    fetchRows();
  }, [authLoading, navigate, user]);

  const needsDoctorLicense = role === 'doctor' && !isFilled(doctorRow?.medical_license_url);

  const handleSubmit = async () => {
    if (!user) return;

    if (role === 'doctor') {
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
          full_name: doctorRow?.full_name || String(user.user_metadata?.full_name || user.user_metadata?.name || 'Doctor'),
          gender: doctorRow?.gender || 'other',
          age: doctorRow?.age || 18,
          phone_number: doctorRow?.phone_number || user.phone || 'N/A',
          email: doctorRow?.email || user.email || null,
          city: doctorRow?.city || 'Unknown',
          state: doctorRow?.state || 'Unknown',
          country: doctorRow?.country || 'Unknown',
          marital_status: doctorRow?.marital_status || 'single',
          hospital_affiliation: doctorRow?.hospital_affiliation || 'Pending update',
          specialty: doctorRow?.specialty || 'general_practitioner',
          experience: doctorRow?.experience || 'Pending update',
          profile_picture_url: profileUrl,
          medical_license_url: licenseUrl,
          identification_type: (doctorRow?.identification_type === 'passport' ? 'passport' : 'nin'),
          identification_number: doctorRow?.identification_number || user.id.slice(0, 16),
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
    if (!gender || !age || !city || !patientState || !country || !maritalStatus ||
        !emergencyContactName || !emergencyContactPhone || !identificationType || !identificationNumber) {
      toast({ title: 'Missing information', description: 'Please fill in all required fields.' });
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
        full_name: fullName.trim() || patientRow?.full_name || String(user.user_metadata?.full_name || user.user_metadata?.name || 'Patient'),
        gender,
        age: parseInt(age),
        phone_number: phoneNumber || patientRow?.phone_number || user.phone || 'N/A',
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
            <div className="space-y-2">
              <Label htmlFor="licenseFile">Medical License (Required)</Label>
              <Input id="licenseFile" type="file" accept="image/*,.pdf" onChange={(e) => setLicenseFile(e.target.files?.[0] || null)} />
              <p className="text-xs text-muted-foreground flex items-center gap-1"><FileText className="w-3 h-3" /> {licenseFile?.name || 'No file selected'}</p>
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
                    I agree to participate in a virtual consultation with My E-Doctor. I understand that my information will be kept confidential and securely used for medical care. I acknowledge the limitations of virtual consultations and agree to follow my healthcare provider's instructions.
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
