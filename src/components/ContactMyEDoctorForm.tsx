import { useMemo, useState } from 'react';
import { Send, MessageSquare } from 'lucide-react';
import { CooThreadChat } from '@/components/coo/CooThreadChat';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
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
}

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
      const senderMeta = [
        `Sender Role: ${roleLabel}`,
        `Sender User ID: ${userId || 'N/A'}`,
        `Sender Name: ${safeFullName || 'N/A'}`,
        `Sender Email: ${safeEmail || 'N/A'}`,
        `Sender Phone: ${safePhone || 'N/A'}`,
      ].join('\n');

      const finalMessage = `${message.trim()}\n\n---\n${senderMeta}`;

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
              senderRole="patient"
              senderName={safeFullName || safeEmail || 'Patient'}
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
            <div className="space-y-3">
              {myMessages.map((item) => {
                const latestAdminActivityMs = getLatestAdminActivityMs(item);
                const readState = getThreadReadState();
                const threadReadAtMs = readState[item.id] || 0;
                const unread = latestAdminActivityMs > threadReadAtMs;
                return (
                <div
                  key={item.id}
                  className={`rounded-lg border p-3 bg-muted/20 cursor-pointer transition-colors ${unread ? 'border-destructive/40' : 'border-border'}`}
                  onClick={() => {
                    if (latestAdminActivityMs > 0) {
                      markThreadRead(item.id, latestAdminActivityMs);
                    }
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{item.subject}</p>
                    <div className="flex items-center gap-2">
                      {unread ? <span className="inline-block w-2 h-2 rounded-full bg-destructive" /> : null}
                      <p className="text-xs text-muted-foreground">
                        {item.created_at ? new Date(item.created_at).toLocaleString() : ''}
                      </p>
                    </div>
                  </div>
                  <p className="mt-2 text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">{item.message}</p>
                  <div className="mt-3 space-y-2">
                    {replyTargetId === item.id ? (
                      <>
                        <Textarea
                          value={replyMessage}
                          onChange={(e) => setReplyMessage(e.target.value)}
                          placeholder="Write your reply..."
                          className="min-h-[96px]"
                        />
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleReply(item.id);
                            }}
                            disabled={isReplying || !replyMessage.trim()}
                            onMouseDown={(e) => e.stopPropagation()}
                          >
                            {isReplying ? 'Sending...' : 'Send Reply'}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setReplyTargetId(null);
                              setReplyMessage('');
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                            disabled={isReplying}
                          >
                            Cancel
                          </Button>
                        </div>
                      </>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          setReplyTargetId(item.id);
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                      >
                        Reply in this thread
                      </Button>
                    )}
                  </div>
                </div>
              )})}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
