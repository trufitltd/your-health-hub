import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, User, FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
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

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate('/auth?mode=login', { replace: true });
      return;
    }

    const fetchRows = async () => {
      setLoading(true);
      const [{ data: doctorData, error: doctorError }, { data: patientData, error: patientError }] = await Promise.all([
        supabase
          .from('doctor_registrations')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('patient_registrations')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle(),
      ]);

      if (doctorError) {
        console.warn('CompleteRegistration doctor row fetch warning:', doctorError);
      }
      if (patientError) {
        console.warn('CompleteRegistration patient row fetch warning:', patientError);
      }

      setDoctorRow((doctorData as DoctorRow | null) ?? null);
      setPatientRow((patientData as PatientRow | null) ?? null);

      const metadataRole = (String(user.user_metadata?.role || '').toLowerCase() === 'doctor' ? 'doctor' : 'patient') as AppRole;
      const effectiveRole: AppRole = metadataRole;

      setRole(effectiveRole);

      const doctorComplete = !!doctorData && isFilled((doctorData as DoctorRow).medical_license_url);
      const patientComplete = !!patientData && (
        isFilled((patientData as PatientRow).profile_picture_url)
        || Boolean((patientData as PatientRow).post_auth_prompt_completed)
      );
      if (effectiveRole === 'doctor' && doctorComplete) {
        setLoading(false);
        navigate('/doctor-portal', { replace: true });
        return;
      }
      if (effectiveRole === 'patient' && patientComplete) {
        setLoading(false);
        navigate('/patient-portal', { replace: true });
        return;
      }

      setLoading(false);
    };

    fetchRows();
  }, [authLoading, navigate, user]);

  const needsDoctorLicense = role === 'doctor' && !isFilled(doctorRow?.medical_license_url);

  const handleSubmit = async () => {
    if (!user) return;

    if (role === 'doctor' && needsDoctorLicense && !licenseFile) {
      toast({ title: 'Medical license required', description: 'Please upload your medical license.' });
      return;
    }
    if (role === 'patient' && !profileFile && !isFilled(patientRow?.profile_picture_url)) {
      toast({ title: 'Profile picture required', description: 'Please upload your profile picture or use "Continue without profile picture".' });
      return;
    }

    setSaving(true);
    try {
      if (role === 'doctor') {
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

        if (!isFilled(licenseUrl)) {
          throw new Error('Medical license is required.');
        }

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

        const { error: upsertError } = await supabase
          .from('doctor_registrations')
          .upsert([payload], { onConflict: 'user_id' });
        if (upsertError) throw upsertError;

        await supabase
          .from('doctors')
          .update({ avatar_url: profileUrl })
          .eq('id', user.id);

        toast({ title: 'Registration completed', description: 'Doctor license saved successfully.' });
        navigate('/doctor-portal', { replace: true });
        return;
      }

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
        full_name: patientRow?.full_name || String(user.user_metadata?.full_name || user.user_metadata?.name || 'Patient'),
        gender: patientRow?.gender || 'other',
        age: patientRow?.age || 18,
        phone_number: patientRow?.phone_number || user.phone || 'N/A',
        email: patientRow?.email || user.email || null,
        city: patientRow?.city || 'Unknown',
        state: patientRow?.state || 'Unknown',
        country: patientRow?.country || 'Unknown',
        marital_status: patientRow?.marital_status || 'single',
        emergency_contact_name: patientRow?.emergency_contact_name || 'Not Provided',
        emergency_contact_phone: patientRow?.emergency_contact_phone || user.phone || 'N/A',
        profile_picture_url: profileUrl,
        identification_type: patientRow?.identification_type || 'hospital_id',
        identification_number: patientRow?.identification_number || user.id,
        post_auth_prompt_completed: true,
      };

      const { error: upsertError } = await supabase
        .from('patient_registrations')
        .upsert([payload], { onConflict: 'user_id' });
      if (upsertError) throw upsertError;

      toast({ title: 'Registration completed', description: profileFile ? 'Profile picture uploaded successfully.' : 'You can add a profile picture later in settings.' });
      navigate('/patient-portal', { replace: true });
    } catch (error: any) {
      toast({ title: 'Upload failed', description: error?.message || 'Please try again.' });
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
              : 'Profile picture is optional. You can continue now and upload it later in settings.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="profileFile">Profile Picture (Optional)</Label>
            <Input id="profileFile" type="file" accept="image/*" onChange={(e) => setProfileFile(e.target.files?.[0] || null)} />
            <p className="text-xs text-muted-foreground flex items-center gap-1"><User className="w-3 h-3" /> {profileFile?.name || 'No file selected'}</p>
          </div>

          {role === 'doctor' && (
            <div className="space-y-2">
              <Label htmlFor="licenseFile">Medical License (Required)</Label>
              <Input id="licenseFile" type="file" accept="image/*,.pdf" onChange={(e) => setLicenseFile(e.target.files?.[0] || null)} />
              <p className="text-xs text-muted-foreground flex items-center gap-1"><FileText className="w-3 h-3" /> {licenseFile?.name || 'No file selected'}</p>
            </div>
          )}

          <Button className="w-full" onClick={handleSubmit} disabled={saving}>
            <Upload className="w-4 h-4 mr-2" />
            {saving ? 'Saving...' : role === 'doctor' ? 'Save and Continue' : 'Continue'}
          </Button>

          {role === 'patient' && (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={saving}
              onClick={() => {
                if (!user) return;
                (async () => {
                  setSaving(true);
                  try {
                    const payload = {
                      user_id: user.id,
                      full_name: patientRow?.full_name || String(user.user_metadata?.full_name || user.user_metadata?.name || 'Patient'),
                      gender: patientRow?.gender || 'other',
                      age: patientRow?.age || 18,
                      phone_number: patientRow?.phone_number || user.phone || 'N/A',
                      email: patientRow?.email || user.email || null,
                      city: patientRow?.city || 'Unknown',
                      state: patientRow?.state || 'Unknown',
                      country: patientRow?.country || 'Unknown',
                      marital_status: patientRow?.marital_status || 'single',
                      emergency_contact_name: patientRow?.emergency_contact_name || 'Not Provided',
                      emergency_contact_phone: patientRow?.emergency_contact_phone || user.phone || 'N/A',
                      profile_picture_url: patientRow?.profile_picture_url || null,
                      identification_type: patientRow?.identification_type || 'hospital_id',
                      identification_number: patientRow?.identification_number || user.id,
                      post_auth_prompt_completed: true,
                    };

                    const { error } = await supabase
                      .from('patient_registrations')
                      .upsert([payload], { onConflict: 'user_id' });

                    if (error) throw error;
                    toast({ title: 'Registration completed', description: 'You can add a profile picture later in settings.' });
                    navigate('/patient-portal', { replace: true });
                  } catch (error: any) {
                    toast({ title: 'Could not continue', description: error?.message || 'Please try again.' });
                  } finally {
                    setSaving(false);
                  }
                })();
              }}
            >
              Continue without profile picture
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
