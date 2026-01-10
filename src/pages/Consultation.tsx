import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ConsultationRoom } from '@/components/consultation/ConsultationRoom';
import { PreConsultationCheck } from '@/components/consultation/PreConsultationCheck';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/components/ui/use-toast';

type ConsultationPhase = 'loading' | 'pre-check' | 'in-call' | 'ended';

const Consultation = () => {
  const { appointmentId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, role } = useAuth();

  const [phase, setPhase] = useState<ConsultationPhase>('loading');

  // Get consultation type from URL params or default to video
  const consultationType = (searchParams.get('type') as 'video' | 'audio' | 'chat') || 'video';

  // Get participant info from URL params (in production, this would come from the database)
  const participantName = searchParams.get('participant') ||
    (role === 'doctor' ? 'Sarah Johnson' : 'Dr. Emily Chen');

  useEffect(() => {
    // Simulate loading appointment data
    const loadAppointment = async () => {
      await new Promise(resolve => setTimeout(resolve, 500));
      setPhase('pre-check');
    };

    if (!appointmentId) {
      toast({
        title: 'Error',
        description: 'Invalid appointment. Please try again.',
        variant: 'destructive'
      });
      navigate(-1);
      return;
    }

    loadAppointment();
  }, [appointmentId, navigate]);

  const handlePreCheckComplete = () => {
    setPhase('in-call');
    toast({
      title: 'Connected',
      description: `You are now in a ${consultationType} consultation with ${participantName}.`
    });
  };

  const handlePreCheckCancel = () => {
    navigate(-1);
  };

  const handleEndCall = () => {
    setPhase('ended');
    toast({
      title: 'Consultation Ended',
      description: 'Thank you for using MyEdoctor.'
    });

    // Redirect based on role
    setTimeout(() => {
      if (role === 'doctor') {
        navigate('/doctor-portal');
      } else {
        navigate('/patient-portal');
      }
    }, 1500);
  };

  if (phase === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading consultation...</p>
        </div>
      </div>
    );
  }

  if (phase === 'pre-check') {
    return (
      <PreConsultationCheck
        consultationType={consultationType}
        onComplete={handlePreCheckComplete}
        onCancel={handlePreCheckCancel}
      />
    );
  }

  if (phase === 'ended') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="text-center">
          <div className="w-20 h-20 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
            <svg className="w-10 h-10 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-semibold mb-2">Consultation Complete</h2>
          <p className="text-muted-foreground">Redirecting you back...</p>
        </div>
      </div>
    );
  }

  return (
    <ConsultationRoom
      appointmentId={appointmentId!}
      consultationType={consultationType}
      participantName={participantName}
      participantRole={role || 'patient'}
      onEndCall={handleEndCall}
    />
  );
};

export default Consultation;
