import { useEffect, useMemo, useState, useRef } from 'react';
import { Send, MessageSquare, X, PlusCircle, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/use-toast';
import { useQuery } from '@tanstack/react-query';
import { useLocaleFormatter } from '@/lib/locale';

interface ContactMyEDoctorFormProps {
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  role: 'doctor' | 'patient';
  userId?: string | null;
}

interface ContactMessageRow {
  id: string;
  subject: string;
  message: string;
  created_at: string;
  first_name?: string | null;
  last_name?: string | null;
}

type ParsedThreadMessage = {
  sender: 'admin' | 'user';
  senderName: string;
  content: string;
  timestamp?: string;
};

const getAdminReplyMarkerTimes = (body: string) => {
  const times: number[] = [];
  for (const match of body.matchAll(/--- Admin Reply \((\d{4}-\d{2}-\d{2} \d{2}:\d{2})\) ---/g)) {
    const timestamp = `${match[1].replace(' ', 'T')}:00Z`;
    const ms = new Date(timestamp).getTime();
    if (!Number.isNaN(ms)) times.push(ms);
  }
  return times;
};

const getLatestAdminActivityMs = (row: ContactMessageRow) => {
  const body = String(row.message || '');
  let latest = 0;
  if (/\[portal:admin\]/i.test(body)) {
    const createdMs = new Date(String(row.created_at || '')).getTime();
    if (!Number.isNaN(createdMs)) latest = Math.max(latest, createdMs);
  }
  const markerTimes = getAdminReplyMarkerTimes(body);
  markerTimes.forEach((ms) => {
    latest = Math.max(latest, ms);
  });
  return latest;
};

const splitName = (fullName: string) => {
  const normalized = fullName.trim().replace(/\s+/g, ' ');
  if (!normalized) return { firstName: '', lastName: '' };
  const parts = normalized.split(' ');
  if (parts.length === 1) return { firstName: parts[0], lastName: '-' };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
};

const cleanThreadContent = (value: string) => {
  let text = String(value || '').replace(/\r\n/g, '\n');
  text = text.replace(/\n?---\n[\s\S]*$/g, '');
  text = text.replace(/^\s*Subject:\s.*$/gim, '');
  text = text.replace(/^\s*From:\s.*$/gim, '');
  text = text.replace(/^\s*Sender (Role|User ID|Name|Email|Phone):\s.*$/gim, '');
  text = text.replace(/\n{3,}/g, '\n\n').trim();
  return text;
};

const parseThreadMessages = (row: ContactMessageRow, fallbackUserName: string, role: 'doctor' | 'patient'): ParsedThreadMessage[] => {
  const body = String(row.message || '').replace(/\r\n/g, '\n');
  const normalizedUserName = (role === 'doctor' && !/^dr\.?\s/i.test(fallbackUserName))
    ? `Dr. ${fallbackUserName}`
    : fallbackUserName;
  const segments: ParsedThreadMessage[] = [];
  const markerRegex = /--- (Admin|User) Reply \((\d{4}-\d{2}-\d{2} \d{2}:\d{2})\) ---/g;
  const markers = Array.from(body.matchAll(markerRegex));

  const firstMarkerIndex = markers[0]?.index ?? body.length;
  const initialContent = cleanThreadContent(body.slice(0, firstMarkerIndex));
  if (initialContent) {
    segments.push({
      sender: 'user',
      senderName: normalizedUserName,
      content: initialContent,
      timestamp: row.created_at,
    });
  }

  markers.forEach((marker, index) => {
    const start = (marker.index || 0) + marker[0].length;
    const end = markers[index + 1]?.index ?? body.length;
    const content = cleanThreadContent(body.slice(start, end));
    if (!content) return;
    const sender = marker[1].toLowerCase() === 'admin' ? 'admin' : 'user';
    segments.push({
      sender,
      senderName: sender === 'admin' ? 'Admin' : normalizedUserName,
      content,
      timestamp: `${marker[2].replace(' ', 'T')}:00Z`,
    });
  });

  return segments;
};

export const ContactMyEDoctorForm = ({
  fullName,
  email,
  phone,
  role,
  userId,
}: ContactMyEDoctorFormProps) => {
  const { formatTime, formatDate } = useLocaleFormatter();
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [replyMessage, setReplyMessage] = useState('');
  const [isReplying, setIsReplying] = useState(false);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [showNewTicketForm, setShowNewTicketForm] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const roleLabel = role === 'doctor' ? 'Doctor' : 'Patient';
  const safeFullName = (fullName || '').trim();
  const safeEmail = (email || '').trim();
  const normalizedEmail = safeEmail.toLowerCase();
  const safePhone = (phone || '').trim();
  const parsedName = useMemo(() => splitName(safeFullName), [safeFullName]);

  const canSubmit = !!parsedName.firstName && !!safeEmail;
  const readStorageKey = userId ? `${role}-contact-thread-read-${userId}` : null;

  const { data: myMessages = [], isLoading: myMessagesLoading, isError: myMessagesError, refetch: refetchMyMessages } = useQuery({
    queryKey: ['my-contact-messages', normalizedEmail],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_contact_messages', { limit_count: 30 });
      if (error) throw error;
      return (data || []) as ContactMessageRow[];
    },
    enabled: !!normalizedEmail,
    refetchInterval: 15000,
  });

  const getThreadReadState = () => {
    if (!readStorageKey || typeof window === 'undefined') return {} as Record<string, number>;
    try {
      const raw = window.localStorage.getItem(readStorageKey);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      return Object.fromEntries(
        Object.entries(parsed).filter((entry): entry is [string, number] => typeof entry[0] === 'string' && typeof entry[1] === 'number')
      );
    } catch {
      return {};
    }
  };

  const markThreadRead = (threadId: string, readAtMs: number) => {
    if (!readStorageKey || typeof window === 'undefined') return;
    const current = getThreadReadState();
    current[threadId] = readAtMs;
    window.localStorage.setItem(readStorageKey, JSON.stringify(current));
    window.dispatchEvent(new Event('contact-thread-read-updated'));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) {
      toast({
        title: 'Missing profile details',
        description: 'Please update your profile name and email before sending a message.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const finalSubject = `[Portal:${roleLabel}] ${subject.trim()}`;
      const finalMessage = message.trim();

      const { data, error } = await supabase.from('contact_messages').insert({
        first_name: parsedName.firstName,
        last_name: parsedName.lastName || '-',
        email: safeEmail,
        phone: safePhone || null,
        subject: finalSubject,
        message: finalMessage,
      }).select().single();

      if (error) throw error;

      setSubject('');
      setMessage('');
      setShowNewTicketForm(false);
      await refetchMyMessages();
      if (data?.id) setSelectedConversationId(data.id);
      
      toast({
        title: 'Message sent',
        description: 'Your message was sent to Central Admin.',
      });
    } catch (error) {
      console.error('Failed to send portal contact message:', error);
      toast({
        title: 'Failed to send',
        description: 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReply = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!selectedConversationId || !replyMessage.trim()) return;

    setIsReplying(true);
    const content = replyMessage.trim();
    setReplyMessage('');

    try {
      const { error } = await supabase.rpc('user_append_contact_reply', {
        p_message_id: selectedConversationId,
        p_reply: content,
        p_sender_role: roleLabel,
        p_sender_user_id: userId || null,
        p_sender_name: safeFullName || null,
        p_sender_phone: safePhone || null,
      });
      if (error) throw error;

      await refetchMyMessages();
      toast({
        title: 'Reply sent',
        description: 'Your reply was added to the conversation thread.',
      });
    } catch (error) {
      console.error('Failed to append reply in contact thread:', error);
      setReplyMessage(content);
      toast({
        title: 'Reply failed',
        description: 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsReplying(false);
    }
  };

  useEffect(() => {
    if (selectedConversationId || showNewTicketForm) return;
    if (myMessages.length > 0) {
      setSelectedConversationId(myMessages[0].id);
    } else if (!myMessagesLoading) {
        setShowNewTicketForm(true);
    }
  }, [myMessages, selectedConversationId, showNewTicketForm, myMessagesLoading]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedConversationId, myMessages]);

  const selectedConversation = myMessages.find((item) => item.id === selectedConversationId) || null;
  const selectedParsedMessages = selectedConversation
    ? parseThreadMessages(
      selectedConversation,
      (safeFullName || [selectedConversation.first_name, selectedConversation.last_name].filter(Boolean).join(' ') || roleLabel).trim(),
      role,
    )
    : [];

  const formatMsgDate = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toDateString() === new Date().toDateString()
      ? formatTime(iso)
      : `${formatDate(iso)} ${formatTime(iso)}`;
  };

  const chatOpen = (selectedConversationId !== null || showNewTicketForm);

  return (
    <Card className="border-none shadow-none bg-transparent">
      <CardContent className="p-0">
        <div className="flex h-[calc(100vh-15rem)] min-h-[520px] max-h-[820px] bg-card rounded-xl border border-border overflow-hidden shadow-sm">
          {/* Thread list */}
          <div className={cn(
            'flex flex-col border-r border-border bg-muted/10 w-full lg:w-[300px] lg:flex-shrink-0',
            chatOpen ? 'hidden lg:flex' : 'flex',
          )}>
            <div className="p-3 border-b border-border flex items-center justify-between flex-shrink-0">
              <p className="text-sm font-semibold text-muted-foreground">
                Support Tickets ({myMessages.length})
              </p>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 text-primary"
                onClick={() => {
                  setShowNewTicketForm(true);
                  setSelectedConversationId(null);
                }}
              >
                <PlusCircle className="h-5 w-5" />
              </Button>
            </div>
            <ScrollArea className="flex-1">
              {myMessagesLoading ? (
                <div className="p-4 space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="animate-pulse flex items-center gap-3">
                      <div className="w-9 h-9 bg-muted rounded-full" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 bg-muted rounded w-1/2" />
                        <div className="h-2 bg-muted rounded w-3/4" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : myMessages.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-sm text-muted-foreground">No support tickets found.</p>
                  <Button 
                    variant="link" 
                    className="mt-2"
                    onClick={() => setShowNewTicketForm(true)}
                  >
                    Start a new ticket
                  </Button>
                </div>
              ) : (
                myMessages.map((item) => {
                  const latestAdminActivityMs = getLatestAdminActivityMs(item);
                  const readState = getThreadReadState();
                  const threadReadAtMs = readState[item.id] || 0;
                  const unread = latestAdminActivityMs > threadReadAtMs;
                  const userDisplayName = (safeFullName || [item.first_name, item.last_name].filter(Boolean).join(' ') || roleLabel).trim();
                  const parsedMessages = parseThreadMessages(item, userDisplayName, role);
                  const previewText = parsedMessages[0]?.content || 'No message content';
                  const displayName = role === 'doctor' && !/^dr\.?\s/i.test(userDisplayName) ? `Dr. ${userDisplayName}` : userDisplayName;
                  const isActive = selectedConversationId === item.id;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setSelectedConversationId(item.id);
                        setShowNewTicketForm(false);
                        if (latestAdminActivityMs > 0) {
                          markThreadRead(item.id, latestAdminActivityMs);
                        }
                      }}
                      className={cn(
                        'w-full flex items-start gap-3 p-3 text-left transition-colors hover:bg-muted/50 border-b border-border/50 last:border-0',
                        isActive && 'bg-primary/5 border-l-4 border-l-primary',
                      )}
                    >
                      <Avatar className="w-9 h-9 flex-shrink-0">
                        <AvatarFallback className="text-xs bg-primary/10 text-primary">
                          {displayName.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-sm font-medium truncate">{item.subject.replace(/\[Portal:.*?\]\s*/, '')}</span>
                          {unread && (
                            <Badge variant="destructive" className="h-5 px-1.5 text-[10px] flex-shrink-0">New</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{previewText}</p>
                        <div className="flex items-center justify-between mt-1">
                           <span className="text-[10px] text-muted-foreground italic">
                            {formatDate(item.created_at)}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </ScrollArea>
          </div>

          {/* Main Chat/Form Area */}
          <div className={cn('flex flex-col flex-1 min-w-0 bg-background', chatOpen ? 'flex' : 'hidden lg:flex')}>
            {showNewTicketForm ? (
              <div className="flex flex-col h-full overflow-hidden">
                <div className="p-3 border-b border-border flex items-center gap-3 flex-shrink-0">
                  <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setShowNewTicketForm(false)}>
                    <X className="w-5 h-5" />
                  </Button>
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                    <PlusCircle className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">New Support Ticket</p>
                    <p className="text-[10px] text-muted-foreground">Send a message to Central Admin</p>
                  </div>
                </div>
                <ScrollArea className="flex-1 p-4 lg:p-6">
                  <form onSubmit={handleSubmit} className="max-w-2xl mx-auto space-y-6 py-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Your Name</Label>
                        <Input value={safeFullName} readOnly disabled className="bg-muted/50 text-sm" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Email Address</Label>
                        <Input value={safeEmail} readOnly disabled className="bg-muted/50 text-sm" />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="new-ticket-subject" className="text-xs font-semibold">Subject</Label>
                      <Input
                        id="new-ticket-subject"
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        placeholder="What do you need help with?"
                        className="text-sm"
                        required
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="new-ticket-message" className="text-xs font-semibold">Message</Label>
                      <Textarea
                        id="new-ticket-message"
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="Please describe your issue or question in detail..."
                        className="min-h-[200px] text-sm resize-none"
                        required
                      />
                    </div>

                    <Button type="submit" className="w-full" disabled={isSubmitting || !canSubmit}>
                      {isSubmitting ? 'Sending Ticket...' : 'Send Support Ticket'}
                      <Send className="w-4 h-4 ml-2" />
                    </Button>
                  </form>
                </ScrollArea>
              </div>
            ) : selectedConversation ? (
              <>
                {/* Chat Header */}
                <div className="p-3 border-b border-border flex items-center gap-3 flex-shrink-0">
                  <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSelectedConversationId(null)}>
                    <X className="w-5 h-5" />
                  </Button>
                  <Avatar className="w-9 h-9">
                    <AvatarFallback className="text-xs bg-primary/10 text-primary">
                      {selectedConversation.subject.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">
                      {selectedConversation.subject.replace(/\[Portal:.*?\]\s*/, '')}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Started {formatDate(selectedConversation.created_at)} at {formatTime(selectedConversation.created_at)}
                    </p>
                  </div>
                </div>

                {/* Chat Messages */}
                <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 bg-muted/5">
                  {selectedParsedMessages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center p-8">
                       <p className="text-sm text-muted-foreground">No message content found.</p>
                    </div>
                  ) : (
                    selectedParsedMessages.map((threadMsg, index) => {
                      const isMine = threadMsg.sender === 'user';
                      return (
                        <div key={`${selectedConversation.id}-${index}`} className={cn('flex gap-2 max-w-[85%]', isMine ? 'ml-auto flex-row-reverse' : '')}>
                          {!isMine && (
                            <Avatar className="w-8 h-8 flex-shrink-0">
                              <AvatarFallback className="text-[10px] bg-primary/10 text-primary font-bold">
                                AD
                              </AvatarFallback>
                            </Avatar>
                          )}
                          <div className={cn('flex flex-col', isMine ? 'items-end' : 'items-start')}>
                            {!isMine && (
                              <span className="text-[10px] font-medium text-muted-foreground mb-1 px-1">Central Admin</span>
                            )}
                            <div className={cn(
                              'rounded-2xl px-4 py-2.5 text-sm shadow-sm',
                              isMine 
                                ? 'bg-primary text-primary-foreground rounded-tr-sm' 
                                : 'bg-background border border-border text-foreground rounded-tl-sm',
                            )}>
                              <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed">
                                {threadMsg.content}
                              </p>
                            </div>
                            <span className="text-[10px] text-muted-foreground mt-1 px-1">
                              {formatMsgDate(threadMsg.timestamp)}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Chat Input */}
                <div className="p-4 border-t border-border bg-background flex-shrink-0">
                  <form onSubmit={handleReply} className="flex items-center gap-2 max-w-4xl mx-auto">
                    <Input
                      value={replyMessage}
                      onChange={(e) => setReplyMessage(e.target.value)}
                      placeholder="Type your reply to admin..."
                      className="flex-1 py-6 text-sm"
                      disabled={isReplying}
                    />
                    <Button type="submit" size="icon" className="h-12 w-12 flex-shrink-0" disabled={isReplying || !replyMessage.trim()}>
                      <Send className="w-5 h-5" />
                    </Button>
                  </form>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center p-8 bg-muted/5">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <MessageSquare className="w-8 h-8 text-primary" />
                </div>
                <h3 className="font-bold text-lg">Support Center</h3>
                <p className="text-sm text-muted-foreground mt-2 max-w-sm">
                  Select a support ticket from the list or start a new conversation with our admin team.
                </p>
                <Button className="mt-6" onClick={() => setShowNewTicketForm(true)}>
                  <PlusCircle className="w-4 h-4 mr-2" />
                  New Support Ticket
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
