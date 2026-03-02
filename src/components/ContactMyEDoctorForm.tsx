import { useMemo, useState } from 'react';
import { Send, MessageSquare } from 'lucide-react';
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
}

interface ContactMessageRow {
  id: string;
  subject: string;
  message: string;
  created_at: string;
}

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
}: ContactMyEDoctorFormProps) => {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const roleLabel = role === 'doctor' ? 'Doctor' : 'Patient';
  const safeFullName = (fullName || '').trim();
  const safeEmail = (email || '').trim();
  const normalizedEmail = safeEmail.toLowerCase();
  const safePhone = (phone || '').trim();
  const parsedName = useMemo(() => splitName(safeFullName), [safeFullName]);

  const canSubmit = !!parsedName.firstName && !!safeEmail;
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
              {myMessages.map((item) => (
                <div key={item.id} className="rounded-lg border border-border p-3 bg-muted/20">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{item.subject}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.created_at ? new Date(item.created_at).toLocaleString() : ''}
                    </p>
                  </div>
                  <p className="mt-2 text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">{item.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
