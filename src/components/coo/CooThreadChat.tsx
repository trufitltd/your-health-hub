import { useEffect, useRef, useState } from 'react';
import { Send, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useLocaleFormatter } from '@/lib/locale';

type CooMessage = {
  id: string;
  thread_id: string;
  thread_type: 'admin' | 'patient';
  sender_id: string;
  sender_role: 'coo' | 'admin' | 'patient';
  sender_name: string;
  content: string;
  created_at: string;
};

interface CooThreadChatProps {
  /** The thread_id: patient's user_id for patient threads, or 'admin' for admin thread */
  threadId: string;
  threadType: 'admin' | 'patient';
  /** The authenticated user's id */
  userId: string;
  /** 'admin' or 'patient' — the role of the person using this component */
  senderRole: 'admin' | 'patient';
  senderName: string;
  /** Label shown in the chat header */
  label?: string;
  /** Called with the current unread count whenever it changes */
  onUnreadChange?: (count: number) => void;
}

export function CooThreadChat({ threadId, threadType, userId, senderRole, senderName, label, onUnreadChange }: CooThreadChatProps) {
  const { formatTime, formatDate } = useLocaleFormatter();
  const [messages, setMessages] = useState<CooMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [unread, setUnread] = useState(0);
  const readKey = `coo-thread-read-${senderRole}-${threadId}`;
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const getLastRead = () => {
    try { return localStorage.getItem(readKey) || ''; } catch { return ''; }
  };

  const markRead = () => {
    try { localStorage.setItem(readKey, new Date().toISOString()); } catch { /* noop */ }
    setUnread(0);
    onUnreadChange?.(0);
  };

  useEffect(() => {
    setIsLoading(true);
    supabase
      .from('coo_messages')
      .select('*')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        const msgs = (data || []) as CooMessage[];
        setMessages(msgs);
        setIsLoading(false);
        // Count messages from COO that arrived after last read
        const lastRead = getLastRead();
        const count = msgs.filter(
          (m) => m.sender_role === 'coo' && (!lastRead || new Date(m.created_at) > new Date(lastRead)),
        ).length;
        setUnread(count);
        onUnreadChange?.(count);
      });

    const capturedThreadId = threadId;
    const channel = supabase
      .channel(`coo-thread-${senderRole}-${threadId}-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'coo_messages' },
        (payload) => {
          const msg = payload.new as CooMessage;
          if (msg.thread_id !== capturedThreadId) return;
          setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
          if (msg.sender_role === 'coo') {
            setUnread((prev) => {
              const next = prev + 1;
              onUnreadChange?.(next);
              return next;
            });
          }
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [threadId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const content = newMessage.trim();
    if (!content || !userId || isSending) return;

    setSendError(null);
    setIsSending(true);
    setNewMessage('');

    const { data, error } = await supabase
      .from('coo_messages')
      .insert({
        thread_id: threadId,
        thread_type: threadType,
        sender_id: userId,
        sender_role: senderRole,
        sender_name: senderName,
        content,
      })
      .select()
      .single();

    if (error) {
      setSendError(`Failed to send: ${error.message}`);
      setNewMessage(content);
    } else if (data) {
      const msg = data as CooMessage;
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
    }
    setIsSending(false);
  };

  const formatMsgDate = (iso: string) => {
    const d = new Date(iso);
    return d.toDateString() === new Date().toDateString()
      ? formatTime(iso)
      : `${formatDate(iso)} ${formatTime(iso)}`;
  };

  // Mark read when user focuses the chat (clicks into it)
  const handleFocus = () => {
    if (unread > 0) markRead();
  };

  return (
    <div className="flex flex-col border border-border rounded-xl overflow-hidden bg-card" style={{ height: '480px' }} onFocus={handleFocus} onClick={handleFocus}>
      {/* Header */}
      <div className="flex items-center gap-3 p-3 border-b border-border bg-muted/10 flex-shrink-0">
        <Avatar className="w-8 h-8">
          <AvatarFallback className="text-xs bg-primary/10 text-primary">CO</AvatarFallback>
        </Avatar>
        <div>
          <p className="text-sm font-semibold">{label || 'COO'}</p>
          <p className="text-xs text-muted-foreground">Chief Operations Officer</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center mt-6">Loading messages...</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center mt-6">No messages yet. Start the conversation.</p>
        ) : (
          messages.map((msg) => {
            const isMine = msg.sender_role === senderRole;
            return (
              <div key={msg.id} className={cn('flex gap-2 max-w-[80%]', isMine ? 'ml-auto flex-row-reverse' : '')}>
                {!isMine && (
                  <Avatar className="w-7 h-7 flex-shrink-0">
                    <AvatarFallback className="text-[10px] bg-muted">
                      {msg.sender_name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                )}
                <div className={cn('flex flex-col', isMine ? 'items-end' : 'items-start')}>
                  {!isMine && (
                    <span className="text-[10px] text-muted-foreground mb-0.5 px-1">{msg.sender_name}</span>
                  )}
                  <div className={cn(
                    'rounded-2xl px-3 py-2 text-sm shadow-sm',
                    isMine ? 'bg-primary text-primary-foreground rounded-tr-sm' : 'bg-muted text-foreground rounded-tl-sm',
                  )}>
                    <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{msg.content}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground mt-0.5 px-1">{formatMsgDate(msg.created_at)}</span>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Composer */}
      <div className="p-3 border-t border-border bg-background flex-shrink-0 space-y-2">
        {sendError && (
          <div className="flex items-center gap-1.5 text-xs text-destructive">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            {sendError}
          </div>
        )}
        <form onSubmit={handleSend} className="flex items-center gap-2">
          <Input
            placeholder="Type a message to COO..."
            value={newMessage}
            onChange={(e) => { setNewMessage(e.target.value); setSendError(null); }}
            className="flex-1"
            disabled={isSending}
          />
          <Button type="submit" size="icon" disabled={!newMessage.trim() || isSending}>
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
