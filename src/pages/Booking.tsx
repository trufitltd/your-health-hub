import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Layout } from '@/components/layout';

export default function BookingPage() {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        // Not authenticated: Redirect to login with return path
        navigate('/auth?redirect=/booking');
      } else {
        // Authenticated: Redirect to patient portal with booking action
        navigate('/patient-portal?action=book');
      }
    }
  }, [user, isLoading, navigate]);

  return (
    <Layout>
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Redirecting...</p>
        </div>
      </div>
    </Layout>
  );
}
