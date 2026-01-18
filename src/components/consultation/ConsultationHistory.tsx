import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Clock, User, FileText, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { consultationService, type ConsultationSession } from '@/services/consultationService';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/components/ui/use-toast';

export function ConsultationHistory() {
  const { user, role } = useAuth();
  const [sessions, setSessions] = useState<ConsultationSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadSessions = async () => {
      if (!user) return;

      try {
        const userRole = role || 'patient';
        const userSessions = await consultationService.getSessionHistory(user.id, userRole as 'patient' | 'doctor');
        setSessions(userSessions);
      } catch (error) {
        console.error('Failed to load consultation history:', error);
        toast({
          title: 'Error',
          description: 'Failed to load consultation history',
          variant: 'destructive'
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadSessions();
  }, [user, role]);

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    }
    return `${secs}s`;
  };

  const getConsultationTypeColor = (type: string) => {
    switch (type) {
      case 'video':
        return 'bg-blue-500/10 text-blue-700 border-blue-200';
      case 'audio':
        return 'bg-green-500/10 text-green-700 border-green-200';
      case 'chat':
        return 'bg-purple-500/10 text-purple-700 border-purple-200';
      default:
        return 'bg-gray-500/10 text-gray-700 border-gray-200';
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 bg-muted rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold mb-2">Consultation History</h3>
        <p className="text-sm text-muted-foreground">View your past consultations and session details</p>
      </div>

      {sessions.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <FileText className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground">No consultations yet</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => (
            <Card key={session.id} className="hover:shadow-md transition-shadow">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <Badge className={getConsultationTypeColor(session.consultation_type)}>
                        {session.consultation_type.charAt(0).toUpperCase() + session.consultation_type.slice(1)}
                      </Badge>
                      <Badge variant={session.status === 'active' ? 'default' : 'outline'}>
                        {session.status.charAt(0).toUpperCase() + session.status.slice(1)}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(session.started_at), 'MMM dd, yyyy h:mm a')}
                    </p>
                    {session.notes && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{session.notes}</p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="flex items-center gap-1 text-sm text-muted-foreground mb-2">
                      <Clock className="w-4 h-4" />
                      {formatDuration(session.duration_seconds)}
                    </div>
                    <Button variant="ghost" size="sm" disabled>
                      <Download className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
