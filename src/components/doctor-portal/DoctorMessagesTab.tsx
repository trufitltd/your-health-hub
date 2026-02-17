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
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/components/ui/use-toast';
import { consultationService, type ConsultationMessage } from '@/services/consultationService';

interface PatientThread {
  id: string;
  sessionId: string;
  patientId: string;
  patientName: string;
  patientAvatar?: string | null;
  appointmentDate?: string | null;
  appointmentTime?: string | null;
  consultationType?: string | null;
  lastMessageAt?: string | null;
}

export function DoctorMessagesTab() {
  const { user } = useAuth();
  const [threads, setThreads] = useState<PatientThread[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [isLoadingThreads, setIsLoadingThreads] = useState(true);
  const [messages, setMessages] = useState<ConsultationMessage[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);

  const selectedThread = threads.find((t) => t.sessionId === selectedSessionId);

  useEffect(() => {
    let mounted = true;

    const loadConsultations = async () => {
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
              patient_name
            )
          `,
          )
          .eq('doctor_id', user.id)
          .eq('appointments.status', 'completed');

        if (error) {
          console.error('Failed to load consultations:', error);
          if (mounted) setThreads([]);
          return;
        }

        const rows = (data || []).map((session) => {
          const appointment = session?.appointments;
          return {
            id: session.id,
            sessionId: session.id,
            patientId: session.patient_id,
            patientName: appointment?.patient_name || 'Patient',
            appointmentDate: appointment?.date ?? null,
            appointmentTime: appointment?.time ?? null,
            consultationType: session.consultation_type ?? null,
            lastMessageAt: session.created_at,
          } as PatientThread;
        });

        const patientIds = Array.from(
          new Set(rows.map((row) => row.patientId).filter(Boolean)),
        ) as string[];

        let patientMap = new Map<string, { full_name: string | null; profile_picture_url: string | null }>();
        if (patientIds.length > 0) {
          const { data: patients } = await supabase
            .from('patient_registrations')
            .select('user_id, full_name, profile_picture_url')
            .in('user_id', patientIds);
          patientMap = new Map(
            (patients || []).map((p) => [
              p.user_id as string,
              {
                full_name: (p.full_name as string | null) ?? null,
                profile_picture_url: (p.profile_picture_url as string | null) ?? null,
              },
            ]),
          );
        }

        const hydrated = rows
          .map((row) => {
            const patient = row.patientId ? patientMap.get(row.patientId) : null;
            return {
              ...row,
              patientName: patient?.full_name || row.patientName,
              patientAvatar: patient?.profile_picture_url ?? null,
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

    loadConsultations();

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
      const name = thread.patientName.toLowerCase();
      return name.includes(query);
    });
  }, [threads, searchQuery]);

  const handleSendMessage = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!newMessage.trim() || !selectedSessionId || !user?.id) return;

    const senderName =
      user.user_metadata?.full_name || user.user_metadata?.email || user.email || 'Doctor';

    const content = newMessage.trim();
    setNewMessage('');

    const sent = await consultationService.sendMessage(
      selectedSessionId,
      user.id,
      'doctor',
      senderName,
      content,
    );

    setMessages((prev) => [...prev, sent]);
  };

  const handleAttachDocument = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !selectedSessionId || !user?.id) return;

    const senderName =
      user.user_metadata?.full_name || user.user_metadata?.email || user.email || 'Doctor';

    setIsUploadingAttachment(true);
    try {
      const fileName = `${Date.now()}-${file.name}`;
      const filePath = `${user.id}/consultation-attachments/${selectedSessionId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('doctor-files')
        .upload(filePath, file, { upsert: false });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from('doctor-files')
        .getPublicUrl(filePath);

      const sent = await consultationService.sendMessage(
        selectedSessionId,
        user.id,
        'doctor',
        senderName,
        file.name,
        'file',
        publicUrlData.publicUrl,
      );

      setMessages((prev) => [...prev, sent]);
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
    <div className="grid md:grid-cols-[350px_1fr] gap-6 h-[600px] bg-card rounded-xl border border-border overflow-hidden shadow-sm">
      <div className={`flex flex-col border-r border-border bg-muted/10 ${selectedSessionId ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-4 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search patients..."
              className="pl-9 bg-background"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="flex flex-col">
            {isLoadingThreads ? (
              <div className="p-4 text-sm text-muted-foreground">Loading...</div>
            ) : filteredThreads.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5" />
                <span>No completed consultations yet.</span>
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
                    <AvatarImage src={thread.patientAvatar ?? undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary">
                      {thread.patientName.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 overflow-hidden">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium truncate">{thread.patientName}</span>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(thread.appointmentDate)}
                      </span>
                    </div>
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

      {selectedThread ? (
        <div className="flex flex-col h-full min-h-0 bg-background">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setSelectedSessionId(null)}>
                <X className="w-5 h-5" />
              </Button>
              <Avatar>
                <AvatarImage src={selectedThread.patientAvatar ?? undefined} />
                <AvatarFallback className="bg-primary/10 text-primary">
                  {selectedThread.patientName.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <div>
                <h3 className="font-semibold">{selectedThread.patientName}</h3>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
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

          <ScrollArea className="flex-1 min-h-0 p-4" ref={scrollRef}>
            {isLoadingMessages ? (
              <div className="text-sm text-muted-foreground">Loading messages...</div>
            ) : messages.length === 0 ? (
              <div className="text-sm text-muted-foreground">No messages yet.</div>
            ) : (
              <div className="space-y-4">
                {messages.map((message, index) => {
                  const isDoctor = message.sender_role === 'doctor';
                  const showAvatar = !isDoctor && (index === 0 || messages[index - 1].sender_role === 'doctor');
                  return (
                    <div key={message.id} className={cn('flex gap-3 max-w-[80%]', isDoctor ? 'ml-auto flex-row-reverse' : '')}>
                      {!isDoctor && (
                        <div className="w-8 flex-shrink-0">
                          {showAvatar && (
                            <Avatar className="w-8 h-8">
                              <AvatarImage src={selectedThread.patientAvatar ?? undefined} />
                              <AvatarFallback className="bg-primary/10 text-primary text-xs">
                                {selectedThread.patientName.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                              </AvatarFallback>
                            </Avatar>
                          )}
                        </div>
                      )}
                      <div className={cn('flex flex-col', isDoctor ? 'items-end' : 'items-start')}>
                        <div className={cn('rounded-2xl px-4 py-2 shadow-sm', isDoctor ? 'bg-primary text-primary-foreground rounded-tr-sm' : 'bg-muted text-foreground rounded-tl-sm')}>
                          {message.message_type === 'file' && message.file_url ? (
                            <a
                              href={message.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={cn(
                                'text-sm underline underline-offset-2',
                                isDoctor ? 'text-primary-foreground' : 'text-primary'
                              )}
                            >
                              {message.content || 'Open attachment'}
                            </a>
                          ) : (
                            <p className="text-sm">{message.content}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 mt-1 px-1">
                          <span className="text-[10px] text-muted-foreground">{formatTime(message.created_at)}</span>
                          {isDoctor && <Check className="w-3 h-3 text-muted-foreground" />}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>

          <div className="sticky bottom-0 p-4 border-t border-border bg-background">
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
        <div className="hidden md:flex flex-col items-center justify-center h-full bg-muted/5 text-center p-8">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Search className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-xl font-semibold mb-2">Patient Messages</h3>
          <p className="text-muted-foreground max-w-sm">Select a completed consultation to view chat history.</p>
        </div>
      )}
    </div>
  );
}
