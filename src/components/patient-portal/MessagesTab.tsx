import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  Send,
  Paperclip,
  MoreVertical,
  Phone,
  Video,
  Check,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { consultationService, type ConsultationMessage } from '@/services/consultationService';

interface FollowUpThread {
  id: string;
  sessionId: string;
  doctorId: string;
  doctorName: string;
  specialty?: string | null;
  doctorAvatar?: string | null;
  followUpNotes: string;
  appointmentDate?: string | null;
  appointmentTime?: string | null;
  consultationType?: string | null;
  lastMessageAt?: string | null;
}

export function MessagesTab() {
  const { user } = useAuth();
  const [threads, setThreads] = useState<FollowUpThread[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [isLoadingThreads, setIsLoadingThreads] = useState(true);
  const [messages, setMessages] = useState<ConsultationMessage[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const selectedThread = threads.find((t) => t.sessionId === selectedSessionId);

  useEffect(() => {
    let mounted = true;

    const loadFollowUps = async () => {
      if (!user?.id) {
        setThreads([]);
        setIsLoadingThreads(false);
        return;
      }

      setIsLoadingThreads(true);
      try {
        const { data, error } = await supabase
          .from('doctor_consultation_notes')
          .select(
            `
            id,
            follow_up_notes,
            created_at,
            consultation_sessions!inner (
              id,
              appointment_id,
              patient_id,
              doctor_id,
              consultation_type,
              appointments!inner (
                id,
                status,
                date,
                time,
                type,
                specialist_name
              )
            )
          `,
          )
          .eq('consultation_sessions.patient_id', user.id)
          .eq('consultation_sessions.appointments.status', 'completed')
          .not('follow_up_notes', 'is', null)
          .neq('follow_up_notes', '');

        if (error) {
          console.error('Failed to load follow-up consultations:', error);
          if (mounted) setThreads([]);
          return;
        }

        const rows = (data || []).map((row) => {
          const session = row.consultation_sessions;
          const appointment = session?.appointments;
          return {
            id: row.id,
            sessionId: session?.id,
            doctorId: session?.doctor_id,
            doctorName: appointment?.specialist_name || 'Doctor',
            followUpNotes: row.follow_up_notes,
            appointmentDate: appointment?.date ?? null,
            appointmentTime: appointment?.time ?? null,
            consultationType: session?.consultation_type ?? null,
            lastMessageAt: row.created_at,
          } as FollowUpThread;
        });

        const doctorIds = Array.from(
          new Set(rows.map((row) => row.doctorId).filter(Boolean)),
        ) as string[];

        let doctorMap = new Map<string, { name: string; specialty: string | null; avatar_url: string | null }>();
        if (doctorIds.length > 0) {
          const { data: doctors } = await supabase
            .from('doctors')
            .select('id, name, specialty, avatar_url')
            .in('id', doctorIds);
          doctorMap = new Map(
            (doctors || []).map((doc) => [
              doc.id as string,
              {
                name: doc.name as string,
                specialty: (doc.specialty as string | null) ?? null,
                avatar_url: (doc.avatar_url as string | null) ?? null,
              },
            ]),
          );
        }

        const hydrated = rows
          .map((row) => {
            const doctor = row.doctorId ? doctorMap.get(row.doctorId) : null;
            return {
              ...row,
              doctorName: doctor?.name || row.doctorName,
              specialty: doctor?.specialty ?? null,
              doctorAvatar: doctor?.avatar_url ?? null,
            };
          })
          .filter((row) => Boolean(row.sessionId))
          .sort((a, b) => {
            const aDate = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
            const bDate = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
            return bDate - aDate;
          });

        if (mounted) setThreads(hydrated);
      } finally {
        if (mounted) setIsLoadingThreads(false);
      }
    };

    loadFollowUps();

    return () => {
      mounted = false;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!selectedSessionId) {
      setMessages([]);
      return;
    }

    let isMounted = true;
    setIsLoadingMessages(true);

    consultationService
      .getMessages(selectedSessionId)
      .then((data) => {
        if (isMounted) setMessages(data);
      })
      .finally(() => {
        if (isMounted) setIsLoadingMessages(false);
      });

    const unsubscribe = consultationService.subscribeToMessages(selectedSessionId, (message) => {
      setMessages((prev) => [...prev, message]);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [selectedSessionId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, selectedSessionId]);

  const filteredThreads = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return threads;
    return threads.filter((thread) => {
      const name = thread.doctorName.toLowerCase();
      const specialty = thread.specialty?.toLowerCase() ?? '';
      return name.includes(query) || specialty.includes(query);
    });
  }, [threads, searchQuery]);

  const handleSendMessage = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!newMessage.trim() || !selectedSessionId || !user?.id) return;

    const senderName =
      user.user_metadata?.full_name || user.user_metadata?.email || user.email || 'Patient';

    const content = newMessage.trim();
    setNewMessage('');

    const sent = await consultationService.sendMessage(
      selectedSessionId,
      user.id,
      'patient',
      senderName,
      content,
    );

    setMessages((prev) => [...prev, sent]);
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  return (
    <div className="grid md:grid-cols-[350px_1fr] gap-6 h-[600px] bg-card rounded-xl border border-border overflow-hidden shadow-sm">
      {/* Sidebar */}
      <div className="flex flex-col border-r border-border bg-muted/10">
        <div className="p-4 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search follow-ups..."
              className="pl-9 bg-background"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="flex flex-col">
            {isLoadingThreads ? (
              <div className="p-4 text-sm text-muted-foreground">Loading follow-ups...</div>
            ) : filteredThreads.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5" />
                <span>No follow-up consultations available yet.</span>
              </div>
            ) : (
              filteredThreads.map((thread) => (
                <button
                  key={thread.id}
                  onClick={() => setSelectedSessionId(thread.sessionId)}
                  className={cn(
                    'flex items-start gap-3 p-4 text-left transition-colors hover:bg-muted/50 border-b border-border/50 last:border-0',
                    selectedSessionId === thread.sessionId &&
                      'bg-primary/5 hover:bg-primary/10 border-l-4 border-l-primary',
                  )}
                >
                  <Avatar>
                    <AvatarImage src={thread.doctorAvatar ?? undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary">
                      {thread.doctorName
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 overflow-hidden">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium truncate">{thread.doctorName}</span>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(thread.appointmentDate)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mb-1">
                      {thread.specialty || 'Specialty unavailable'}
                    </p>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">
                        Follow-up required
                      </Badge>
                      <span className="text-xs text-muted-foreground truncate">
                        {thread.followUpNotes}
                      </span>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Chat Area */}
      {selectedThread ? (
        <div className="flex flex-col h-full bg-background">
          {/* Chat Header */}
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Avatar>
                <AvatarImage src={selectedThread.doctorAvatar ?? undefined} />
                <AvatarFallback className="bg-primary/10 text-primary">
                  {selectedThread.doctorName
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <div>
                <h3 className="font-semibold">{selectedThread.doctorName}</h3>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{selectedThread.specialty || 'Specialty unavailable'}</span>
                  <span>•</span>
                  <span>
                    {formatDate(selectedThread.appointmentDate)}
                    {selectedThread.appointmentTime ? ` • ${selectedThread.appointmentTime}` : ''}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon">
                <Phone className="w-5 h-5 text-muted-foreground" />
              </Button>
              <Button variant="ghost" size="icon">
                <Video className="w-5 h-5 text-muted-foreground" />
              </Button>
              <Button variant="ghost" size="icon">
                <MoreVertical className="w-5 h-5 text-muted-foreground" />
              </Button>
            </div>
          </div>

          <div className="p-4 border-b border-border bg-muted/20">
            <Card className="p-3 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Follow-up notes:</span>{' '}
              {selectedThread.followUpNotes}
            </Card>
          </div>

          {/* Messages List */}
          <ScrollArea className="flex-1 p-4" ref={scrollRef}>
            {isLoadingMessages ? (
              <div className="text-sm text-muted-foreground">Loading messages...</div>
            ) : messages.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No follow-up messages yet. Start the conversation below.
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message, index) => {
                  const isUser = message.sender_role === 'patient';
                  const showAvatar = !isUser && (index === 0 || messages[index - 1].sender_role === 'patient');
                  return (
                    <div
                      key={message.id}
                      className={cn('flex gap-3 max-w-[80%]', isUser ? 'ml-auto flex-row-reverse' : '')}
                    >
                      {!isUser && (
                        <div className="w-8 flex-shrink-0">
                          {showAvatar && (
                            <Avatar className="w-8 h-8">
                              <AvatarImage src={selectedThread.doctorAvatar ?? undefined} />
                              <AvatarFallback className="bg-primary/10 text-primary text-xs">
                                {selectedThread.doctorName
                                  .split(' ')
                                  .map((n) => n[0])
                                  .join('')
                                  .slice(0, 2)}
                              </AvatarFallback>
                            </Avatar>
                          )}
                        </div>
                      )}
                      <div className={cn('flex flex-col', isUser ? 'items-end' : 'items-start')}>
                        <div
                          className={cn(
                            'rounded-2xl px-4 py-2 shadow-sm',
                            isUser
                              ? 'bg-primary text-primary-foreground rounded-tr-sm'
                              : 'bg-muted text-foreground rounded-tl-sm',
                          )}
                        >
                          <p className="text-sm">{message.content}</p>
                        </div>
                        <div className="flex items-center gap-1 mt-1 px-1">
                          <span className="text-[10px] text-muted-foreground">
                            {formatTime(message.created_at)}
                          </span>
                          {isUser && <Check className="w-3 h-3 text-muted-foreground" />}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>

          {/* Input Area */}
          <div className="p-4 border-t border-border bg-background">
            <form onSubmit={handleSendMessage} className="flex items-end gap-2">
              <Button type="button" variant="ghost" size="icon" className="flex-shrink-0">
                <Paperclip className="w-5 h-5 text-muted-foreground" />
              </Button>
              <Input
                placeholder="Type a follow-up message..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                className="flex-1 min-h-[44px]"
              />
              <Button type="submit" disabled={!newMessage.trim()} className="flex-shrink-0">
                <Send className="w-5 h-5" />
              </Button>
            </form>
          </div>
        </div>
      ) : (
        <div className="hidden md:flex flex-col items-center justify-center h-full bg-muted/5 text-center p-8">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Search className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-xl font-semibold mb-2">Follow-up Consultations</h3>
          <p className="text-muted-foreground max-w-sm">
            Select a completed consultation that requires investigation to start a follow-up message.
          </p>
        </div>
      )}
    </div>
  );
}
