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
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { cn, formatSpecialtyLabel } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/components/ui/use-toast';
import { consultationService, type ConsultationMessage } from '@/services/consultationService';
import { useLocaleFormatter } from '@/lib/locale';

interface FollowUpThread {
  id: string;
  sessionId: string;
  sessionIds: string[];
  doctorId: string;
  doctorName: string;
  specialty?: string | null;
  doctorAvatar?: string | null;
  followUpNotes: string;
  appointmentDate?: string | null;
  appointmentTime?: string | null;
  consultationType?: string | null;
  lastMessageAt?: string | null;
  sessionMetaById: Record<string, {
    appointmentDate?: string | null;
    appointmentTime?: string | null;
    consultationType?: string | null;
  }>;
}

interface MessagesTabProps {
  focusSessionId?: string | null;
  jumpToUnreadSignal?: number;
}

export function MessagesTab({ focusSessionId = null, jumpToUnreadSignal = 0 }: MessagesTabProps) {
  const { user } = useAuth();
  const { formatDate, formatTime } = useLocaleFormatter();
  const [threads, setThreads] = useState<FollowUpThread[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [isLoadingThreads, setIsLoadingThreads] = useState(true);
  const [messages, setMessages] = useState<ConsultationMessage[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [unreadCountsBySession, setUnreadCountsBySession] = useState<Record<string, number>>({});
  const [unreadLatestBySession, setUnreadLatestBySession] = useState<Record<string, string>>({});
  const messagesViewportRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const composerInputRef = useRef<HTMLInputElement>(null);
  const lastJumpHandledRef = useRef(0);
  const readStateStorageKey = user?.id ? `patient-messages-read-${user.id}` : null;

  const getReadState = () => {
    if (!readStateStorageKey || typeof window === 'undefined') return {} as Record<string, string>;
    try {
      const raw = window.localStorage.getItem(readStateStorageKey);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      return Object.fromEntries(
        Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[0] === 'string' && typeof entry[1] === 'string')
      );
    } catch {
      return {};
    }
  };

  const persistReadState = (next: Record<string, string>) => {
    if (!readStateStorageKey || typeof window === 'undefined') return;
    window.localStorage.setItem(readStateStorageKey, JSON.stringify(next));
  };

  const markSessionAsRead = (sessionId: string, readAtIso?: string) => {
    if (!sessionId) return;
    const nextReadAt = readAtIso || new Date().toISOString();
    const readState = getReadState();
    readState[sessionId] = nextReadAt;
    persistReadState(readState);
    setUnreadCountsBySession((prev) => ({ ...prev, [sessionId]: 0 }));
    setUnreadLatestBySession((prev) => {
      const next = { ...prev };
      delete next[sessionId];
      return next;
    });
  };

  const selectedThread = threads.find((t) => t.sessionId === selectedSessionId);
  const formatDoctorDisplayName = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return 'Dr. Doctor';
    return /^dr\.?\s/i.test(trimmed) ? trimmed : `Dr. ${trimmed}`;
  };
  const appendMessageIfMissing = (message: ConsultationMessage) => {
    setMessages((prev) => {
      if (prev.some((existing) => existing.id === message.id)) return prev;
      return [...prev, message].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
    });
  };

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
          .from('consultation_sessions')
          .select(
            `
            id,
            appointment_id,
            patient_id,
            doctor_id,
            consultation_type,
            created_at,
            appointments!inner (
              id,
              status,
              date,
              time,
              specialist_name
            )
          `,
          )
          .eq('patient_id', user.id)
          .in('appointments.status', ['confirmed', 'completed']);

        if (error) {
          console.error('Failed to load consultations:', error);
          if (mounted) setThreads([]);
          return;
        }

        console.log('Loaded sessions:', data);

        const rows = (data || []).map((session) => {
          const appointment = session?.appointments;
          return {
            id: session.id,
            sessionId: session.id,
            doctorId: session.doctor_id,
            doctorName: appointment?.specialist_name || 'Doctor',
            followUpNotes: '',
            appointmentDate: appointment?.date ?? null,
            appointmentTime: appointment?.time ?? null,
            consultationType: session.consultation_type ?? null,
            lastMessageAt: session.created_at,
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

        const hydratedSessions = rows
          .map((row) => {
            const doctor = row.doctorId ? doctorMap.get(row.doctorId) : null;
            return {
              ...row,
              doctorName: doctor?.name || row.doctorName,
              specialty: doctor?.specialty ?? null,
              doctorAvatar: doctor?.avatar_url ?? null,
            };
          })
          .filter((row) => Boolean(row.sessionId));

        const groupedByDoctor = new Map<string, FollowUpThread>();
        hydratedSessions.forEach((row) => {
          const key = row.doctorId || `session-${row.sessionId}`;
          const existing = groupedByDoctor.get(key);
          const rowTime = row.lastMessageAt ? new Date(row.lastMessageAt).getTime() : 0;
          const sessionMeta = {
            appointmentDate: row.appointmentDate ?? null,
            appointmentTime: row.appointmentTime ?? null,
            consultationType: row.consultationType ?? null,
          };

          if (!existing) {
            groupedByDoctor.set(key, {
              ...row,
              id: key,
              sessionIds: [row.sessionId],
              sessionMetaById: { [row.sessionId]: sessionMeta },
            });
            return;
          }

          if (!existing.sessionIds.includes(row.sessionId)) {
            existing.sessionIds.push(row.sessionId);
          }
          existing.sessionMetaById[row.sessionId] = sessionMeta;

          const existingTime = existing.lastMessageAt ? new Date(existing.lastMessageAt).getTime() : 0;
          if (rowTime >= existingTime) {
            existing.sessionId = row.sessionId;
            existing.appointmentDate = row.appointmentDate;
            existing.appointmentTime = row.appointmentTime;
            existing.consultationType = row.consultationType;
            existing.lastMessageAt = row.lastMessageAt;
          }
        });

        const groupedThreads = Array.from(groupedByDoctor.values()).sort((a, b) => {
          const aDate = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
          const bDate = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
          return bDate - aDate;
        });

        if (mounted) setThreads(groupedThreads);
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
    if (!focusSessionId) return;
    const targetThread = threads.find((thread) => thread.sessionIds.includes(focusSessionId));
    if (!targetThread) return;
    setSelectedSessionId(targetThread.sessionId);
  }, [focusSessionId, threads]);

  useEffect(() => {
    if (!selectedThread) {
      setMessages([]);
      return;
    }

    const sessionIds = selectedThread.sessionIds.filter(Boolean);
    if (sessionIds.length === 0) {
      setMessages([]);
      return;
    }

    let isMounted = true;
    setIsLoadingMessages(true);

    supabase
      .from('consultation_messages')
      .select('*')
      .in('session_id', sessionIds)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          console.error('Failed to load messages for thread:', error);
          if (isMounted) setMessages([]);
          return;
        }
        if (isMounted) setMessages((data || []) as ConsultationMessage[]);
      })
      .finally(() => {
        if (isMounted) setIsLoadingMessages(false);
      });

    const unsubscribers = sessionIds.map((sessionId) =>
      consultationService.subscribeToMessages(sessionId, (message) => {
        appendMessageIfMissing(message);
      })
    );

    return () => {
      isMounted = false;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [selectedThread?.id]);

  useEffect(() => {
    let isMounted = true;
    const loadUnreadSummary = async () => {
      if (!user?.id || threads.length === 0) {
        if (isMounted) {
          setUnreadCountsBySession({});
          setUnreadLatestBySession({});
        }
        return;
      }

      const sessionIds = Array.from(new Set(threads.flatMap((thread) => thread.sessionIds))).filter(Boolean);
      if (sessionIds.length === 0) return;

      const readState = getReadState();
      const { data, error } = await supabase
        .from('consultation_messages')
        .select('session_id, created_at, sender_role')
        .in('session_id', sessionIds)
        .eq('sender_role', 'doctor')
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Failed to load unread message summary:', error);
        return;
      }

      const counts: Record<string, number> = {};
      const latest: Record<string, string> = {};

      (data || []).forEach((row: any) => {
        const sessionId = String(row.session_id || '');
        if (!sessionId) return;
        const createdAt = String(row.created_at || '');
        if (!createdAt) return;
        const lastReadAt = readState[sessionId];
        if (lastReadAt && new Date(createdAt).getTime() <= new Date(lastReadAt).getTime()) return;
        counts[sessionId] = (counts[sessionId] || 0) + 1;
        latest[sessionId] = createdAt;
      });

      if (!isMounted) return;
      setUnreadCountsBySession(counts);
      setUnreadLatestBySession(latest);
    };

    loadUnreadSummary();
    return () => {
      isMounted = false;
    };
  }, [threads, user?.id]);

  const markThreadAsRead = (thread: FollowUpThread, readAtIso?: string) => {
    thread.sessionIds.forEach((sessionId) => markSessionAsRead(sessionId, readAtIso));
  };

  useEffect(() => {
    if (!messagesViewportRef.current) return;
    const frame = requestAnimationFrame(() => {
      if (!messagesViewportRef.current) return;
      messagesViewportRef.current.scrollTop = messagesViewportRef.current.scrollHeight;
      messagesEndRef.current?.scrollIntoView({ block: 'end' });
    });
    return () => cancelAnimationFrame(frame);
  }, [messages, selectedSessionId, isLoadingMessages]);

  useEffect(() => {
    if (!selectedThread || isLoadingMessages) return;
    const latestIncoming = [...messages]
      .reverse()
      .find((message) => message.sender_role === 'doctor');
    markThreadAsRead(selectedThread, latestIncoming?.created_at || new Date().toISOString());
  }, [selectedThread, messages, isLoadingMessages]);

  useEffect(() => {
    if (!jumpToUnreadSignal || jumpToUnreadSignal === lastJumpHandledRef.current) return;

    const unreadSessions = Object.entries(unreadLatestBySession);
    if (unreadSessions.length === 0) return;
    lastJumpHandledRef.current = jumpToUnreadSignal;

    unreadSessions.sort((a, b) => new Date(b[1]).getTime() - new Date(a[1]).getTime());
    const targetSessionId = unreadSessions[0][0];
    const targetThread = threads.find((thread) => thread.sessionIds.includes(targetSessionId));
    if (targetThread) {
      setSelectedSessionId(targetThread.sessionId);
    }

    setTimeout(() => {
      if (messagesViewportRef.current) {
        messagesViewportRef.current.scrollTop = messagesViewportRef.current.scrollHeight;
      }
      composerInputRef.current?.focus();
    }, 50);
  }, [jumpToUnreadSignal, unreadLatestBySession, threads]);

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
    if (!newMessage.trim() || !selectedThread || !user?.id) return;
    const targetSessionId = selectedThread.sessionId;

    const senderName =
      user.user_metadata?.full_name || user.user_metadata?.email || user.email || 'Patient';

    const content = newMessage.trim();
    setNewMessage('');

    const sent = await consultationService.sendMessage(
      targetSessionId,
      user.id,
      'patient',
      senderName,
      content,
    );

    appendMessageIfMissing(sent);
  };

  const handleAttachDocument = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !selectedThread || !user?.id) return;
    const targetSessionId = selectedThread.sessionId;

    const senderName =
      user.user_metadata?.full_name || user.user_metadata?.email || user.email || 'Patient';

    setIsUploadingAttachment(true);
    try {
      const fileName = `${Date.now()}-${file.name}`;
      const filePath = `${user.id}/consultation-attachments/${targetSessionId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('patient-files')
        .upload(filePath, file, { upsert: false });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from('patient-files')
        .getPublicUrl(filePath);

      const sent = await consultationService.sendMessage(
        targetSessionId,
        user.id,
        'patient',
        senderName,
        file.name,
        'file',
        publicUrlData.publicUrl,
      );

      appendMessageIfMissing(sent);
      toast({ title: 'Attachment sent' });
    } catch (error) {
      console.error('Failed to upload attachment:', error);
      toast({ title: 'Upload failed', description: 'Could not send attachment.', variant: 'destructive' });
    } finally {
      setIsUploadingAttachment(false);
    }
  };

  const formatMessageTime = (dateString: string) => formatTime(dateString);
  const formatMessageDate = (dateString: string | null | undefined) => {
    if (!dateString) return '';
    return formatDate(dateString);
  };

  const getThreadUnreadCount = (thread: FollowUpThread) =>
    thread.sessionIds.reduce((total, sessionId) => total + (unreadCountsBySession[sessionId] || 0), 0);

  return (
    <div className="grid lg:grid-cols-[320px_1fr] gap-0 h-[calc(100vh-15rem)] min-h-[520px] max-h-[820px] bg-card rounded-xl border border-border overflow-hidden shadow-sm [&>*]:min-h-0">
      {/* Sidebar */}
      <div className={`flex flex-col border-r border-border bg-muted/10 ${selectedSessionId ? 'hidden lg:flex' : 'flex'}`}>
        <div className="p-4 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search consultations..."
              className="pl-9 bg-background"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="flex flex-col">
            {isLoadingThreads ? (
              <div className="p-4 text-sm text-muted-foreground">Loading consultations...</div>
            ) : filteredThreads.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5" />
                <span>No confirmed or completed consultations yet.</span>
              </div>
            ) : (
              filteredThreads.map((thread) => (
                <button
                  key={thread.id}
                  onClick={() => {
                    setSelectedSessionId(thread.sessionId);
                    composerInputRef.current?.focus();
                  }}
                  className={cn(
                    'flex items-start gap-3 p-4 text-left transition-colors hover:bg-muted/50 border-b border-border/50 last:border-0',
                    selectedSessionId === thread.sessionId &&
                      'bg-primary/5 hover:bg-primary/10 border-l-4 border-l-primary',
                  )}
                >
                  <div className="relative">
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
                    {getThreadUnreadCount(thread) > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-destructive ring-2 ring-background" />
                    )}
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium truncate">{formatDoctorDisplayName(thread.doctorName)}</span>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatMessageDate(thread.appointmentDate)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mb-1">
                      {formatSpecialtyLabel(thread.specialty, 'Specialty unavailable')}
                    </p>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">
                        {thread.consultationType || 'Consultation'}
                      </Badge>
                      {getThreadUnreadCount(thread) > 0 && (
                        <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
                          {getThreadUnreadCount(thread) > 99 ? '99+' : getThreadUnreadCount(thread)}
                        </Badge>
                      )}
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
        <div className="flex flex-col h-full min-h-0 overflow-hidden bg-background">
          {/* Chat Header */}
          <div className="p-3 sm:p-4 border-b border-border flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <Button 
                variant="ghost" 
                size="icon" 
                className="lg:hidden"
                onClick={() => setSelectedSessionId(null)}
              >
                <X className="w-5 h-5" />
              </Button>
              <div className="relative">
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
                {(selectedThread && getThreadUnreadCount(selectedThread) > 0) && (
                  <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-destructive ring-2 ring-background" />
                )}
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold">{formatDoctorDisplayName(selectedThread.doctorName)}</h3>
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <span>{formatSpecialtyLabel(selectedThread.specialty, 'Specialty unavailable')}</span>
                  <span>•</span>
                  <span>
                      {formatMessageDate(selectedThread.appointmentDate)}
                    {selectedThread.appointmentTime ? ` • ${selectedThread.appointmentTime}` : ''}
                  </span>
                </div>
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-1">
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

          {/* Messages List */}
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 sm:p-4 pb-24" ref={messagesViewportRef}>
            {isLoadingMessages ? (
              <div className="text-sm text-muted-foreground">Loading messages...</div>
            ) : messages.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No messages yet. Start the conversation below.
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message, index) => {
                  const isUser = message.sender_role === 'patient';
                  const previousMessage = index > 0 ? messages[index - 1] : null;
                  const isNewAppointmentSection = !previousMessage || previousMessage.session_id !== message.session_id;
                  const sessionMeta = selectedThread.sessionMetaById[message.session_id] || {};
                  const showAvatar = !isUser && (index === 0 || messages[index - 1].sender_role === 'patient');
                  return (
                    <div key={message.id}>
                      {isNewAppointmentSection && (
                        <div className="my-2 flex justify-center">
                          <Badge variant="outline" className="text-[10px] sm:text-xs">
                            Appointment: {formatMessageDate(sessionMeta.appointmentDate)}
                            {sessionMeta.appointmentTime ? ` • ${sessionMeta.appointmentTime}` : ''}
                          </Badge>
                        </div>
                      )}
                      <div
                        className={cn('flex gap-2 sm:gap-3 max-w-[92%] sm:max-w-[80%] min-w-0', isUser ? 'ml-auto flex-row-reverse' : '')}
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
                              'rounded-2xl px-3 sm:px-4 py-2 shadow-sm max-w-full',
                              isUser
                                ? 'bg-primary text-primary-foreground rounded-tr-sm'
                                : 'bg-muted text-foreground rounded-tl-sm',
                            )}
                          >
                            {message.message_type === 'file' && message.file_url ? (
                              <a
                                href={message.file_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={cn(
                                  'text-sm underline underline-offset-2 break-all [overflow-wrap:anywhere]',
                                  isUser ? 'text-primary-foreground' : 'text-primary'
                                )}
                              >
                                {message.content || 'Open attachment'}
                              </a>
                            ) : (
                              <p className="text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{message.content}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1 mt-1 px-1">
                            <span className="text-[10px] text-muted-foreground">
                            {formatMessageTime(message.created_at)}
                            </span>
                            {isUser && <Check className="w-3 h-3 text-muted-foreground" />}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} className="h-1 w-full" />
              </div>
            )}
          </div>

          {/* Input Area */}
          <div className="p-4 border-t border-border bg-background">
            <form onSubmit={handleSendMessage} className="flex items-end gap-2">
              <input
                ref={attachmentInputRef}
                type="file"
                className="hidden"
                onChange={handleAttachDocument}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="flex-shrink-0"
                disabled={isUploadingAttachment}
                onClick={() => attachmentInputRef.current?.click()}
              >
                <Paperclip className="w-5 h-5 text-muted-foreground" />
              </Button>
              <Input
                ref={composerInputRef}
                placeholder={isUploadingAttachment ? 'Uploading attachment...' : 'Type a message...'}
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                className="flex-1 min-h-[44px]"
                disabled={isUploadingAttachment}
              />
              <Button type="submit" disabled={!newMessage.trim() || isUploadingAttachment} className="flex-shrink-0">
                <Send className="w-5 h-5" />
              </Button>
            </form>
          </div>
        </div>
      ) : (
        <div className="hidden lg:flex flex-col items-center justify-center h-full bg-muted/5 text-center p-8">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Search className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-xl font-semibold mb-2">Consultation Messages</h3>
          <p className="text-muted-foreground max-w-sm">
            Select a confirmed or completed consultation to view your chat history with the doctor.
          </p>
        </div>
      )}
    </div>
  );
}
