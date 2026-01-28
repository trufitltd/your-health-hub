import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ConsultationRoom } from '@/components/consultation/ConsultationRoom';
import { PreConsultationCheck } from '@/components/consultation/PreConsultationCheck';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';

type ConsultationPhase = 'loading' | 'pre-check' | 'waiting' | 'in-call' | 'ended';

const Consultation = () => {
  const { appointmentId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, role } = useAuth();

  const [phase, setPhase] = useState<ConsultationPhase>('loading');
  const [isAdmitted, setIsAdmitted] = useState(false);
  const [patientWaiting, setPatientWaiting] = useState(false);

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
    
    // Subscribe to consultation session changes
    console.log('Setting up real-time subscription for appointment:', appointmentId, 'role:', role);
    const channel = supabase
      .channel(`consultation_${appointmentId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'consultation_sessions',
        filter: `appointment_id=eq.${appointmentId}`
      }, (payload) => {
        console.log('Consultation session updated:', payload);
        let newStatus: unknown;
        if (typeof payload === 'object' && payload !== null && 'new' in payload) {
          const maybeNew = (payload as { new?: unknown }).new;
          if (maybeNew && typeof maybeNew === 'object' && 'status' in maybeNew) {
            newStatus = (maybeNew as { status?: unknown }).status;
          }
        }
        const newStatusStr = typeof newStatus === 'string' ? newStatus : undefined;
        console.log('New status:', newStatusStr, 'Current role:', role);
        
        if (newStatusStr === 'ended') {
          console.log('Consultation ended by other participant');
          setPhase('ended');
          toast({
            title: 'Consultation Ended',
            description: role === 'patient' ? 'The doctor has ended the consultation.' : 'The patient has left the consultation.'
          });
          // Navigate back after a brief delay
          setTimeout(() => navigate(-1), 2000);
        } else if (role === 'patient' && newStatusStr === 'active') {
          console.log('Patient being admitted to consultation');
          setIsAdmitted(true);
          toast({
            title: 'Admitted',
            description: 'The doctor has admitted you to the consultation.'
          });
        } else if (role === 'doctor' && newStatusStr === 'waiting') {
          console.log('Doctor notified that patient is waiting');
          setPatientWaiting(true);
          toast({
            title: 'Patient Waiting',
            description: `${participantName} is waiting to join the consultation.`
          });
        }
      })
      .subscribe((status) => {
        console.log('Subscription status:', status);
      });
      
    return () => {
      console.log('Unsubscribing from consultation updates');
      channel.unsubscribe();
    };
  }, [appointmentId, navigate, role, participantName]);

  // Auto-transition waiting phase to in-call
  useEffect(() => {
    if (phase === 'waiting') {
      setPhase('in-call');
    }
  }, [phase]);

  const handlePreCheckComplete = () => {
    if (role === 'doctor') {
      setPhase('in-call');
      toast({
        title: 'Ready',
        description: 'You can now admit the patient when they join.'
      });
    } else {
      setPhase('waiting');
      // Notify doctor that patient is waiting
      console.log('Patient entering waiting room, updating database...');
      supabase
        .from('consultation_sessions')
        .update({ status: 'waiting' })
        .eq('appointment_id', appointmentId)
        .then(({ error }) => {
          if (error) {
            console.error('Error updating consultation status:', error);
          } else {
            console.log('Successfully updated consultation status to waiting');
          }
          toast({
            title: 'Waiting',
            description: 'Please wait for the doctor to admit you to the consultation.'
          });
        });
    }
  };

  // handleAdmitPatient moved to ConsultationRoom component for cleaner separation of concerns

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

  if (phase === 'waiting') {
    // Transition handled by useEffect above
    return null;
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

  // All consultation phases (waiting, in-call) are now handled inside ConsultationRoom
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
