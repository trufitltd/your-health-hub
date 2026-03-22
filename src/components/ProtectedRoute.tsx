import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: 'patient' | 'doctor';
  requireCompletedRegistration?: boolean;
}

const isFilled = (value: string | null | undefined) => !!String(value || '').trim();

export function ProtectedRoute({
  children,
  requiredRole,
  requireCompletedRegistration = false,
}: ProtectedRouteProps) {
  const { user, role, isLoading } = useAuth();
  const location = useLocation();
  const [checkingRegistration, setCheckingRegistration] = useState(requireCompletedRegistration);
  const [redirectPath, setRedirectPath] = useState<string | null>(null);

  useEffect(() => {
    if (!requireCompletedRegistration) return;
    if (!user) return;

    let cancelled = false;
    (async () => {
      setCheckingRegistration(true);
      const [{ data: doctorRow }, { data: patientRow }] = await Promise.all([
        supabase.from('doctor_registrations').select('profile_picture_url, medical_license_url').eq('user_id', user.id).maybeSingle(),
        supabase.from('patient_registrations').select('profile_picture_url').eq('user_id', user.id).maybeSingle(),
      ]);

      if (cancelled) return;

      const effectiveRole: 'patient' | 'doctor' =
        doctorRow ? 'doctor' : ((role || (String(user.user_metadata?.role || '').toLowerCase() === 'doctor' ? 'doctor' : 'patient')) as 'patient' | 'doctor');

      const doctorComplete = !!doctorRow && isFilled((doctorRow as any).profile_picture_url) && isFilled((doctorRow as any).medical_license_url);
      const patientComplete = !!patientRow && isFilled((patientRow as any).profile_picture_url);
      const complete = effectiveRole === 'doctor' ? doctorComplete : patientComplete;

      if (!complete) {
        setRedirectPath(`/complete-registration?role=${effectiveRole}`);
      } else {
        setRedirectPath(null);
      }
      setCheckingRegistration(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [requireCompletedRegistration, role, user]);

  if (isLoading || checkingRegistration) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  if (requiredRole) {
    const roleFromMetadata = String(user.user_metadata?.role || '').toLowerCase() === 'doctor' ? 'doctor' : 'patient';
    const effectiveRole = (role || roleFromMetadata) as 'patient' | 'doctor';
    if (effectiveRole !== requiredRole) {
      return <Navigate to={effectiveRole === 'doctor' ? '/doctor-portal' : '/patient-portal'} replace />;
    }
  }

  if (redirectPath && location.pathname !== '/complete-registration') {
    return <Navigate to={redirectPath} state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
