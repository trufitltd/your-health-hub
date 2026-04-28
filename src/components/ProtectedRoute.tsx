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
  if (normalized === 'doctor' || normalized === 'patient' || normalized === 'admin' || normalized === 'coo' || normalized === 'healthlink') {
    return normalized;
  }
  return 'patient';
};
const roleDefaultPath = (role: AppRole) => {
  if (role === 'doctor') return '/doctor-portal';
  if (role === 'admin') return '/admin';
  if (role === 'coo') return '/coo';
  if (role === 'healthlink') return '/healthlink';
  return '/patient-portal';
};
const isConnectivityIssue = (error: unknown) => {
  if (!error) return false;
  const message = String((error as { message?: string }).message || '').toLowerCase();
  const details = String((error as { details?: string }).details || '').toLowerCase();
  return (
    message.includes('failed to fetch') ||
    message.includes('networkerror') ||
    message.includes('network request failed') ||
    message.includes('load failed') ||
    details.includes('failed to fetch')
  );
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
  const [connectivityNotice, setConnectivityNotice] = useState(false);
  const [checkAttempt, setCheckAttempt] = useState(0);

  useEffect(() => {
    if (!requireCompletedRegistration) {
      setCheckingRegistration(false);
      setRedirectPath(null);
      setConnectivityNotice(false);
      return;
    }
    if (!user) {
      setCheckingRegistration(false);
      setRedirectPath(null);
      setConnectivityNotice(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setCheckingRegistration(true);
      setConnectivityNotice(false);
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
        const doctorConnectivityError = isConnectivityIssue(doctorError);
        const patientConnectivityError = isConnectivityIssue(patientError);

        if (
          (effectiveRole === 'doctor' && doctorConnectivityError) ||
          (effectiveRole === 'patient' && patientConnectivityError)
        ) {
          setRedirectPath(null);
          setConnectivityNotice(true);
          return;
        }

        const doctorComplete = !!doctorRow && isFilled((doctorRow as any).medical_license_url);
        const patientComplete = !!patientRow && Boolean((patientRow as any).post_auth_prompt_completed);
        if (effectiveRole !== 'doctor' && effectiveRole !== 'patient') {
          setRedirectPath(null);
          return;
        }
        const complete = effectiveRole === 'doctor' ? doctorComplete : patientComplete;

        if (!complete) {
          setRedirectPath(`/complete-registration?role=${effectiveRole}`);
        } else {
          setRedirectPath(null);
          setConnectivityNotice(false);
        }
      } catch (error) {
        console.error('ProtectedRoute registration check failed:', error);
        if (!cancelled && isConnectivityIssue(error)) {
          setRedirectPath(null);
          setConnectivityNotice(true);
        }
      } finally {
        if (!cancelled) setCheckingRegistration(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [checkAttempt, requireCompletedRegistration, role, user]);

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
    return <Navigate to={redirectPath} replace />;
  }

  if (connectivityNotice && requireCompletedRegistration) {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-3xl px-4 py-6">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">
            <p className="font-medium">Connection issue detected.</p>
            <p className="mt-1 text-sm">
              You are signed in, but we could not verify registration status due to poor or no internet.
              Check your connection and retry.
            </p>
            <button
              type="button"
              className="mt-3 inline-flex rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700"
              onClick={() => setCheckAttempt((prev) => prev + 1)}
            >
              Retry check
            </button>
          </div>
        </div>
        {children}
      </div>
    );
  }

  return <>{children}</>;
}
