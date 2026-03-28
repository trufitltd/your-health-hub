import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import type { AppRole } from '@/contexts/authContextValue';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: AppRole;
  requireCompletedRegistration?: boolean;
}

const isFilled = (value: string | null | undefined) => !!String(value || '').trim();
const parseAppRole = (value: unknown): AppRole => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'doctor' || normalized === 'patient' || normalized === 'admin' || normalized === 'coo') {
    return normalized;
  }
  return 'patient';
};
const roleDefaultPath = (role: AppRole) => {
  if (role === 'doctor') return '/doctor-portal';
  if (role === 'admin') return '/admin';
  if (role === 'coo') return '/coo';
  return '/patient-portal';
};

export function ProtectedRoute({
  children,
  requiredRole,
  requireCompletedRegistration = false,
}: ProtectedRouteProps) {
  const { user, role, isLoading } = useAuth();
  const location = useLocation();
  const [checkingRegistration, setCheckingRegistration] = useState(false);
  const [redirectPath, setRedirectPath] = useState<string | null>(null);

  useEffect(() => {
    if (!requireCompletedRegistration) {
      setCheckingRegistration(false);
      setRedirectPath(null);
      return;
    }
    if (!user) {
      setCheckingRegistration(false);
      setRedirectPath(null);
      return;
    }

    let cancelled = false;
    (async () => {
      setCheckingRegistration(true);
      try {
        const [{ data: doctorRow, error: doctorError }, { data: patientRow, error: patientError }] = await Promise.all([
          supabase.from('doctor_registrations').select('profile_picture_url, medical_license_url').eq('user_id', user.id).maybeSingle(),
          supabase.from('patient_registrations').select('profile_picture_url, post_auth_prompt_completed').eq('user_id', user.id).maybeSingle(),
        ]);

        if (cancelled) return;

        if (doctorError) {
          console.warn('ProtectedRoute doctor registration check warning:', doctorError);
        }
        if (patientError) {
          console.warn('ProtectedRoute patient registration check warning:', patientError);
        }

        const effectiveRole: AppRole = role || parseAppRole(user.user_metadata?.role);

        const doctorComplete = !!doctorRow && isFilled((doctorRow as any).medical_license_url);
        const patientComplete = !!patientRow && (
          isFilled((patientRow as any).profile_picture_url)
          || Boolean((patientRow as any).post_auth_prompt_completed)
        );
        if (effectiveRole !== 'doctor' && effectiveRole !== 'patient') {
          setRedirectPath(null);
          return;
        }
        const complete = effectiveRole === 'doctor' ? doctorComplete : patientComplete;

        if (!complete) {
          setRedirectPath(`/complete-registration?role=${effectiveRole}`);
        } else {
          setRedirectPath(null);
        }
      } catch (error) {
        console.error('ProtectedRoute registration check failed:', error);
      } finally {
        if (!cancelled) setCheckingRegistration(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [requireCompletedRegistration, role, user]);

  if (isLoading || (requireCompletedRegistration && !!user && checkingRegistration)) {
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
    const roleFromMetadata = parseAppRole(user.user_metadata?.role);
    const effectiveRole = (role || roleFromMetadata) as AppRole;
    if (effectiveRole !== requiredRole) {
      return <Navigate to={roleDefaultPath(effectiveRole)} replace />;
    }
  }

  if (redirectPath && location.pathname !== '/complete-registration') {
    return <Navigate to={redirectPath} state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
