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
  const doctorId = doctorIdParam || queryDoctorId || undefined;

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
