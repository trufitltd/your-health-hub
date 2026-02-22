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
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/components/ui/use-toast';
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

interface MessagesTabProps {
  focusSessionId?: string | null;
}

export function MessagesTab({ focusSessionId = null }: MessagesTabProps) {
  const { user } = useAuth();
  const [threads, setThreads] = useState<FollowUpThread[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [isLoadingThreads, setIsLoadingThreads] = useState(true);
  const [messages, setMessages] = useState<ConsultationMessage[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const messagesViewportRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);

  const selectedThread = threads.find((t) => t.sessionId === selectedSessionId);
  const formatDoctorDisplayName = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return 'Dr. Doctor';
    return /^dr\.?\s/i.test(trimmed) ? trimmed : `Dr. ${trimmed}`;
  };
  const appendMessageIfMissing = (message: ConsultationMessage) => {
    setMessages((prev) => (prev.some((existing) => existing.id === message.id) ? prev : [...prev, message]));
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
          .eq('appointments.status', 'completed');

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
    if (!focusSessionId) return;
    setSelectedSessionId(focusSessionId);
  }, [focusSessionId]);

  useEffect(() => {
    if (!focusSessionId || !user?.id) return;
    if (threads.some((thread) => thread.sessionId === focusSessionId)) return;

    let isMounted = true;
    const loadFocusedSessionThread = async () => {
      try {
        const { data: session, error } = await supabase
          .from('consultation_sessions')
          .select(`
            id,
            doctor_id,
            consultation_type,
            created_at,
            appointments(
              date,
              time,
              specialist_name
            )
          `)
          .eq('id', focusSessionId)
          .eq('patient_id', user.id)
          .maybeSingle();

        if (error || !session || !isMounted) return;

        const doctorId = (session as { doctor_id?: string | null }).doctor_id ?? '';
        let doctorName =
          (session as { appointments?: { specialist_name?: string | null } | Array<{ specialist_name?: string | null }> }).appointments &&
          Array.isArray((session as any).appointments)
            ? (((session as any).appointments[0]?.specialist_name as string | undefined) || 'Doctor')
            : (((session as any).appointments?.specialist_name as string | undefined) || 'Doctor');
        let doctorAvatar: string | null = null;
        let specialty: string | null = null;

        if (doctorId) {
          const { data: doctorRow } = await supabase
            .from('doctors')
            .select('name, specialty, avatar_url')
            .eq('id', doctorId)
            .maybeSingle();
          if (doctorRow) {
            doctorName = (doctorRow.name as string | null) || doctorName;
            doctorAvatar = (doctorRow.avatar_url as string | null) ?? null;
            specialty = (doctorRow.specialty as string | null) ?? null;
          }
        }

        const appointmentObj = Array.isArray((session as any).appointments)
          ? (session as any).appointments[0]
          : (session as any).appointments;

        const thread: FollowUpThread = {
          id: session.id as string,
          sessionId: session.id as string,
          doctorId,
          doctorName,
          specialty,
          doctorAvatar,
          followUpNotes: '',
          appointmentDate: appointmentObj?.date ?? null,
          appointmentTime: appointmentObj?.time ?? null,
          consultationType: (session as { consultation_type?: string | null }).consultation_type ?? null,
          lastMessageAt: (session as { created_at?: string | null }).created_at ?? null,
        };

        setThreads((prev) => {
          if (prev.some((item) => item.sessionId === thread.sessionId)) return prev;
          return [thread, ...prev];
        });
      } catch (err) {
        console.error('Failed to load focused session thread:', err);
      }
    };

    loadFocusedSessionThread();
    return () => {
      isMounted = false;
    };
  }, [focusSessionId, user?.id, threads]);

  useEffect(() => {
    if (!selectedSessionId) {
      setMessages([]);
      return;
    }

    console.log('Loading messages for session:', selectedSessionId);
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
      appendMessageIfMissing(message);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [selectedSessionId]);

  useEffect(() => {
    if (!messagesViewportRef.current) return;
    const frame = requestAnimationFrame(() => {
      if (!messagesViewportRef.current) return;
      messagesViewportRef.current.scrollTop = messagesViewportRef.current.scrollHeight;
      messagesEndRef.current?.scrollIntoView({ block: 'end' });
    });
    return () => cancelAnimationFrame(frame);
  }, [messages, selectedSessionId, isLoadingMessages]);

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

    appendMessageIfMissing(sent);
  };

  const handleAttachDocument = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !selectedSessionId || !user?.id) return;

    const senderName =
      user.user_metadata?.full_name || user.user_metadata?.email || user.email || 'Patient';

    setIsUploadingAttachment(true);
    try {
      const fileName = `${Date.now()}-${file.name}`;
      const filePath = `${user.id}/consultation-attachments/${selectedSessionId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('patient-files')
        .upload(filePath, file, { upsert: false });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from('patient-files')
        .getPublicUrl(filePath);

      const sent = await consultationService.sendMessage(
        selectedSessionId,
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
    <div className="grid lg:grid-cols-[320px_1fr] gap-0 h-[calc(100vh-15rem)] min-h-[520px] max-h-[820px] bg-card rounded-xl border border-border overflow-hidden shadow-sm">
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
                <span>No completed consultations yet.</span>
              </div>
            ) : (
              filteredThreads.map((thread) => (
                <button
                  key={thread.id}
                  onClick={() => {
                    console.log('Clicked thread:', thread);
                    setSelectedSessionId(thread.sessionId);
                  }}
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
                      <span className="font-medium truncate">{formatDoctorDisplayName(thread.doctorName)}</span>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(thread.appointmentDate)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mb-1">
                      {thread.specialty || 'Specialty unavailable'}
                    </p>
                    <Badge variant="outline" className="text-[10px]">
                      {thread.consultationType || 'Consultation'}
                    </Badge>
                  </div>
                </button>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Chat Area */}
      {selectedThread ? (
        <div className="flex flex-col h-full min-h-0 bg-background">
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
              <div className="min-w-0">
                <h3 className="font-semibold">{formatDoctorDisplayName(selectedThread.doctorName)}</h3>
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <span>{selectedThread.specialty || 'Specialty unavailable'}</span>
                  <span>•</span>
                  <span>
                    {formatDate(selectedThread.appointmentDate)}
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
          <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 pb-24" ref={messagesViewportRef}>
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
                  const showAvatar = !isUser && (index === 0 || messages[index - 1].sender_role === 'patient');
                  return (
                    <div
                      key={message.id}
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
                            {formatTime(message.created_at)}
                          </span>
                          {isUser && <Check className="w-3 h-3 text-muted-foreground" />}
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
            Select a completed consultation to view your chat history with the doctor.
          </p>
        </div>
      )}
    </div>
  );
}
