import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { consultationService, type ConsultationSession } from '@/services/consultationService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { RefreshCw, Video, Mic, MessageSquare, Clock, User, Stethoscope } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from '@/components/ui/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';

interface ConsultationWithDetails extends ConsultationSession {
  patient_name?: string;
  patient_email?: string;
  doctor_name?: string;
  doctor_email?: string;
  doctor_specialty?: string;
}

export function ConsultationMonitor() {
  const { t } = useLanguage();
  const [activeSessions, setActiveSessions] = useState<ConsultationWithDetails[]>([]);

  const { data: sessions, isLoading, refetch } = useQuery({
    queryKey: ['active-consultations'],
    queryFn: async () => {
      const sessions = await consultationService.getActiveSessions();

      // Enrich sessions with patient and doctor details
      const enrichedSessions = await Promise.all(
        sessions.map(async (session) => {
          const [patientData, doctorData] = await Promise.all([
            supabase
              .from('patients')
              .select('full_name, email')
              .eq('id', session.patient_id)
              .single(),
            supabase
              .from('doctors')
              .select('full_name, email, specialty')
              .eq('id', session.doctor_id)
              .single()
          ]);

          return {
            ...session,
            patient_name: patientData.data?.full_name,
            patient_email: patientData.data?.email,
            doctor_name: doctorData.data?.full_name,
            doctor_email: doctorData.data?.email,
            doctor_specialty: doctorData.data?.specialty
          } as ConsultationWithDetails;
        })
      );

      return enrichedSessions;
    },
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  useEffect(() => {
    if (sessions) {
      setActiveSessions(sessions);
    }
  }, [sessions]);

  // Set up real-time subscription for live updates
  useEffect(() => {
    const channel = supabase
      .channel('consultation-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'consultation_sessions',
          filter: 'status=eq.active'
        },
        async (payload) => {
          console.log('Real-time consultation update:', payload);
          // Refetch data when there's a change
          refetch();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetch]);

  const getConsultationTypeIcon = (type: string) => {
    switch (type) {
      case 'video':
        return <Video className="w-4 h-4" />;
      case 'audio':
        return <Mic className="w-4 h-4" />;
      case 'chat':
        return <MessageSquare className="w-4 h-4" />;
      default:
        return <MessageSquare className="w-4 h-4" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="default" className="bg-green-500">Active</Badge>;
      case 'waiting':
        return <Badge variant="secondary">Waiting</Badge>;
      case 'paused':
        return <Badge variant="outline">Paused</Badge>;
      case 'ended':
        return <Badge variant="destructive">Ended</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const formatDuration = (startedAt: string) => {
    const start = new Date(startedAt);
    const now = new Date();
    const diffMs = now.getTime() - start.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMins / 60);

    if (diffHours > 0) {
      return `${diffHours}h ${diffMins % 60}m`;
    }
    return `${diffMins}m`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="w-6 h-6 animate-spin" />
        <span className="ml-2">Loading active consultations...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Active Consultations</h3>
          <p className="text-sm text-muted-foreground">
            {activeSessions.length} consultation{activeSessions.length !== 1 ? 's' : ''} currently in progress
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isLoading}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {activeSessions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center p-8">
            <Clock className="w-12 h-12 text-muted-foreground mb-4" />
            <h4 className="text-lg font-medium mb-2">No Active Consultations</h4>
            <p className="text-sm text-muted-foreground text-center">
              There are currently no active consultations on the platform.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {activeSessions.map((session) => (
            <Card key={session.id} className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-4">
                  <div className="flex items-center space-x-2">
                    {getConsultationTypeIcon(session.consultation_type)}
                    {getStatusBadge(session.status)}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <Stethoscope className="w-4 h-4 text-blue-500" />
                      <div>
                        <p className="font-medium">{session.doctor_name || 'Unknown Doctor'}</p>
                        <p className="text-sm text-muted-foreground">
                          {session.doctor_specialty || 'Specialty not specified'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <User className="w-4 h-4 text-green-500" />
                      <div>
                        <p className="font-medium">{session.patient_name || 'Unknown Patient'}</p>
                        <p className="text-sm text-muted-foreground">
                          {session.patient_email}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="flex items-center space-x-1 text-sm text-muted-foreground">
                    <Clock className="w-4 h-4" />
                    <span>{formatDuration(session.started_at)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Started {new Date(session.started_at).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}