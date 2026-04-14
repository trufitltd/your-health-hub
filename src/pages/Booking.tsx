import { useEffect } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Layout } from '@/components/layout';
import { useLanguage } from '@/contexts/LanguageContext';

export default function BookingPage() {
  const { user, isLoading } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const { doctorId: doctorIdParam } = useParams<{ doctorId?: string }>();
  const queryDoctorId = new URLSearchParams(location.search).get('doctor');
  
  // Extract actual doctor ID from format like "john-doe-uuid" by taking the last part after the last dash
  const extractDoctorId = (param: string | undefined): string | undefined => {
    if (!param) return undefined;
    // Match UUID pattern at the end of the string
    const uuidMatch = param.match(/([a-f0-9-]{36})$/);
    if (uuidMatch) {
      return uuidMatch[1];
    }
    // Fallback: if it's already a UUID format
    if (param.match(/^[a-f0-9-]{36}$/)) {
      return param;
    }
    return param;
  };

  const doctorId = extractDoctorId(doctorIdParam) || queryDoctorId || undefined;

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        const redirectPath = `${location.pathname}${location.search}`;
        navigate(`/auth?redirect=${encodeURIComponent(redirectPath)}`);
      } else if (doctorId) {
        navigate('/slot-selection', {
          state: {
            doctorId,
          },
        });
      } else {
        navigate('/doctor-discovery');
      }
    }
  }, [user, isLoading, navigate, location.pathname, location.search, doctorId]);

  return (
    <Layout>
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">{t('booking.redirecting', 'Redirecting...')}</p>
        </div>
      </div>
    </Layout>
  );
}
