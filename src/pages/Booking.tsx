import { useEffect } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Layout } from '@/components/layout';
import { useLanguage } from '@/contexts/LanguageContext';
import { useActivePatientPromotion } from '@/hooks/useActivePatientPromotion';

export default function BookingPage() {
  const { user, isLoading } = useAuth();
  const { t } = useLanguage();
  const { data: promotion } = useActivePatientPromotion();
  const formattedPromotionEndAt = promotion?.endsAt
    ? (() => {
        const endDate = new Date(promotion.endsAt);
        const pad = (value: number) => String(value).padStart(2, '0');
        return `${pad(endDate.getDate())}/${pad(endDate.getMonth() + 1)}/${endDate.getFullYear()}, ${pad(endDate.getHours())}:${pad(endDate.getMinutes())}:${pad(endDate.getSeconds())}`;
      })()
    : '';
  const promotionHeadline = promotion
    ? `Free consultation promotion ends in ${promotion.countdownText}`
    : '';
  const promotionSubtext = promotion
    ? `Offer ends on ${formattedPromotionEndAt}. Eligibility is enforced automatically at checkout`
    : '';
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
        <div className="w-full max-w-md text-center">
          {promotion?.isActive ? (
            <div className="mb-6 rounded-xl border-2 border-red-300 bg-gradient-to-r from-red-50 via-rose-50 to-orange-50 px-5 py-4 shadow-md text-left">
              <p className="text-base font-extrabold text-red-700">{promotionHeadline}</p>
              <p className="mt-1 text-sm font-semibold text-red-600">{promotionSubtext}</p>
            </div>
          ) : null}
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">{t('booking.redirecting', 'Redirecting...')}</p>
        </div>
      </div>
    </Layout>
  );
}
