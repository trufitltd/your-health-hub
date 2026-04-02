import { useEffect, useMemo, useState } from 'react';
import { Send, MessageSquare, X } from 'lucide-react';
import { CooThreadChat } from '@/components/coo/CooThreadChat';
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

interface ContactMyEDoctorFormProps {
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  role: 'doctor' | 'patient';
  userId?: string | null;
  onCooUnreadChange?: (count: number) => void;
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
  onCooUnreadChange,
}: ContactMyEDoctorFormProps) => {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [replyTargetId, setReplyTargetId] = useState<string | null>(null);
  const [replyMessage, setReplyMessage] = useState('');
  const [isReplying, setIsReplying] = useState(false);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);

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

      const { error } = await supabase.from('contact_messages').insert({
        first_name: parsedName.firstName,
        last_name: parsedName.lastName || '-',
        email: safeEmail,
        phone: safePhone || null,
        subject: finalSubject,
        message: finalMessage,
      });

      if (error) throw error;

      setSubject('');
      setMessage('');
      refetchMyMessages();
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

  const handleReply = async (messageId: string) => {
    if (!messageId || !replyMessage.trim()) {
      toast({
        title: 'Reply required',
        description: 'Please enter your reply.',
        variant: 'destructive',
      });
      return;
    }

    setIsReplying(true);
    try {
      const { error } = await supabase.rpc('user_append_contact_reply', {
        p_message_id: messageId,
        p_reply: replyMessage.trim(),
        p_sender_role: roleLabel,
        p_sender_user_id: userId || null,
        p_sender_name: safeFullName || null,
        p_sender_phone: safePhone || null,
      });
      if (error) throw error;

      setReplyMessage('');
      setReplyTargetId(null);
      refetchMyMessages();
      toast({
        title: 'Reply sent',
        description: 'Your reply was added to the conversation thread.',
      });
    } catch (error) {
      console.error('Failed to append reply in contact thread:', error);
      toast({
        title: 'Reply failed',
        description: 'Please ensure migration db/50_add_user_append_contact_reply_rpc.sql is applied.',
        variant: 'destructive',
      });
    } finally {
      setIsReplying(false);
    }
  };

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

  useEffect(() => {
    if (selectedConversationId) return;
    if (myMessages.length > 0) {
      setSelectedConversationId(myMessages[0].id);
    }
  }, [myMessages, selectedConversationId]);

  const selectedConversation = myMessages.find((item) => item.id === selectedConversationId) || null;
  const selectedParsedMessages = selectedConversation
    ? parseThreadMessages(
      selectedConversation,
      (safeFullName || [selectedConversation.first_name, selectedConversation.last_name].filter(Boolean).join(' ') || roleLabel).trim(),
      role,
    )
    : [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <CardTitle>Contact MyE-Doctor</CardTitle>
            <CardDescription>Send a message directly to Central Admin.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label>Full Name</Label>
              <Input value={safeFullName} readOnly disabled className="mt-1.5" />
            </div>
            <div>
              <Label>Email</Label>
              <Input value={safeEmail} readOnly disabled className="mt-1.5" />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={safePhone || 'Not provided'} readOnly disabled className="mt-1.5" />
            </div>
            <div>
              <Label>Role</Label>
              <Input value={roleLabel} readOnly disabled className="mt-1.5" />
            </div>
          </div>

          <div>
            <Label htmlFor="portal-contact-subject">Subject</Label>
            <Input
              id="portal-contact-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="How can we help?"
              className="mt-1.5"
              required
            />
          </div>

          <div>
            <Label htmlFor="portal-contact-message">Message</Label>
            <Textarea
              id="portal-contact-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Tell us more about your request..."
              className="mt-1.5 min-h-[140px]"
              required
            />
          </div>

          <Button type="submit" className="w-full sm:w-auto" disabled={isSubmitting || !canSubmit}>
            {isSubmitting ? 'Sending...' : 'Send Message'}
            <Send className="w-4 h-4 ml-2" />
          </Button>
        </form>

        {userId && (
          <div className="mt-8 border-t border-border pt-6">
            <h3 className="text-sm font-semibold mb-3">Messages with COO</h3>
            <CooThreadChat
              threadId={userId}
              threadType="patient"
              userId={userId}
              senderRole={role}
              senderName={role === 'doctor' && !/^dr\.?\s/i.test(safeFullName || '')
                ? `Dr. ${safeFullName || safeEmail || 'Doctor'}`
                : (safeFullName || safeEmail || (role === 'doctor' ? 'Doctor' : 'Patient'))}
              label="COO — Chief Operations Officer"
              onUnreadChange={onCooUnreadChange}
            />
          </div>
        )}

        <div className="mt-8 border-t border-border pt-6">
          <h3 className="text-sm font-semibold mb-3">Conversation History</h3>
          {myMessagesLoading ? (
            <p className="text-sm text-muted-foreground">Loading messages...</p>
          ) : myMessagesError ? (
            <p className="text-sm text-muted-foreground">Conversation unavailable until support chat migration is applied.</p>
          ) : myMessages.length === 0 ? (
            <p className="text-sm text-muted-foreground">No messages yet.</p>
          ) : (
            <div className="flex h-[calc(100vh-20rem)] min-h-[480px] max-h-[760px] bg-card rounded-xl border border-border overflow-hidden shadow-sm">
              <div className={cn(
                'flex flex-col border-r border-border bg-muted/10 w-full lg:w-[280px] lg:flex-shrink-0',
                selectedConversation ? 'hidden lg:flex' : 'flex',
              )}>
                <div className="p-3 border-b border-border flex-shrink-0">
                  <p className="text-sm font-semibold text-muted-foreground">
                    Conversations ({myMessages.length})
                  </p>
                </div>
                <ScrollArea className="flex-1">
                  {myMessages.map((item) => {
                    const latestAdminActivityMs = getLatestAdminActivityMs(item);
                    const readState = getThreadReadState();
                    const threadReadAtMs = readState[item.id] || 0;
                    const unread = latestAdminActivityMs > threadReadAtMs;
                    const userDisplayName = (safeFullName || [item.first_name, item.last_name].filter(Boolean).join(' ') || roleLabel).trim();
                    const parsedMessages = parseThreadMessages(item, userDisplayName, role);
                    const previewText = parsedMessages[0]?.content || 'No message content';
                    const displayName = role === 'doctor' && !/^dr\.?\s/i.test(userDisplayName) ? `Dr. ${userDisplayName}` : userDisplayName;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setSelectedConversationId(item.id);
                          setReplyTargetId(item.id);
                          if (latestAdminActivityMs > 0) {
                            markThreadRead(item.id, latestAdminActivityMs);
                          }
                        }}
                        className={cn(
                          'w-full flex items-start gap-3 p-3 text-left transition-colors hover:bg-muted/50 border-b border-border/50 last:border-0',
                          selectedConversationId === item.id && 'bg-primary/5 border-l-4 border-l-primary',
                        )}
                      >
                        <Avatar className="w-9 h-9 flex-shrink-0">
                          <AvatarFallback className="text-xs bg-primary/10 text-primary">
                            {displayName.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-sm font-medium truncate">{displayName}</span>
                            {unread ? (
                              <Badge variant="destructive" className="h-5 px-1.5 text-[10px] flex-shrink-0">New</Badge>
                            ) : null}
                          </div>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">{previewText}</p>
                          <div className="flex items-center justify-end mt-0.5">
                            <span className="text-[10px] text-muted-foreground">
                              {item.created_at ? new Date(item.created_at).toLocaleString() : ''}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </ScrollArea>
              </div>

              <div className={cn('flex flex-col flex-1 min-w-0 bg-background', selectedConversation ? 'flex' : 'hidden lg:flex')}>
                {selectedConversation ? (
                  <>
                    <div className="p-3 border-b border-border flex items-center gap-3 flex-shrink-0">
                      <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSelectedConversationId(null)}>
                        <X className="w-5 h-5" />
                      </Button>
                      <Avatar className="w-9 h-9">
                        <AvatarFallback className="text-xs bg-primary/10 text-primary">
                          {((role === 'doctor' ? `Dr. ${safeFullName || roleLabel}` : (safeFullName || roleLabel))).slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-semibold">
                          {role === 'doctor' ? 'Dr. ' : ''}{safeFullName || roleLabel}
                        </p>
                        <Badge variant="outline" className="text-[10px]">
                          Thread started {selectedConversation.created_at ? new Date(selectedConversation.created_at).toLocaleString() : ''}
                        </Badge>
                      </div>
                    </div>

                    <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
                      {selectedParsedMessages.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center mt-8">No message content.</p>
                      ) : (
                        selectedParsedMessages.map((threadMsg, index) => {
                          const isMine = threadMsg.sender === 'user';
                          return (
                            <div key={`${selectedConversation.id}-${index}`} className={cn('flex gap-2 max-w-[80%]', isMine ? 'ml-auto flex-row-reverse' : '')}>
                              {!isMine && (
                                <Avatar className="w-7 h-7 flex-shrink-0">
                                  <AvatarFallback className="text-[10px] bg-muted">
                                    {threadMsg.senderName.slice(0, 2).toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                              )}
                              <div className={cn('flex flex-col', isMine ? 'items-end' : 'items-start')}>
                                {!isMine && (
                                  <span className="text-[10px] text-muted-foreground mb-0.5 px-1">{threadMsg.senderName}</span>
                                )}
                                <div className={cn(
                                  'rounded-2xl px-3 py-2 text-sm shadow-sm',
                                  isMine ? 'bg-primary text-primary-foreground rounded-tr-sm' : 'bg-muted text-foreground rounded-tl-sm',
                                )}>
                                  <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{threadMsg.content}</p>
                                </div>
                                <span className="text-[10px] text-muted-foreground mt-0.5 px-1">
                                  {threadMsg.timestamp ? new Date(threadMsg.timestamp).toLocaleString() : ''}
                                </span>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    <div className="p-3 border-t border-border bg-background flex-shrink-0 space-y-2">
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          if (selectedConversation.id) {
                            handleReply(selectedConversation.id);
                          }
                        }}
                        className="flex items-center gap-2"
                      >
                        <Input
                          value={replyMessage}
                          onChange={(e) => setReplyMessage(e.target.value)}
                          placeholder="Type a reply..."
                          className="flex-1"
                        />
                        <Button type="submit" size="icon" disabled={isReplying || !replyMessage.trim()}>
                          <Send className="w-4 h-4" />
                        </Button>
                      </form>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center p-8 bg-muted/5">
                    <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                      <Send className="w-6 h-6 text-primary" />
                    </div>
                    <p className="font-semibold">Select a conversation</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Choose a thread to open chat.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
