import { useEffect, useRef, useState } from 'react';
import { Send, X, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLocaleFormatter } from '@/lib/locale';

type CooMessage = {
  id: string;
  thread_id: string;
  thread_type: 'admin' | 'patient' | 'doctor';
  sender_id: string;
  sender_role: 'coo' | 'admin' | 'patient' | 'doctor';
  sender_name: string;
  content: string;
  created_at: string;
};

type ThreadPreview = { lastMessage?: string; lastAt?: string; unread: number };

interface COOMessagesTabProps {
  patients: { user_id: string; full_name: string | null; email: string | null }[];
  doctors: { user_id: string; full_name: string | null; email: string | null }[];
  cooUserId: string;
  cooName: string;
  onUnreadChange?: (count: number) => void;
}

// Build the static thread list directly from props — no async, never empty
function buildThreads(
  patients: COOMessagesTabProps['patients'],
  doctors: COOMessagesTabProps['doctors']
) {
  return [
    { id: 'admin', type: 'admin' as const, label: 'Central Admin' },
    ...doctors.map((d) => ({
      id: d.user_id,
      type: 'doctor' as const,
      label: d.full_name || d.email || 'Doctor',
    })),
    ...patients.map((p) => ({
      id: p.user_id,
      type: 'patient' as const,
      label: p.full_name || p.email || 'Patient',
    })),
  ];
}

export function COOMessagesTab({ patients, doctors, cooUserId, cooName, onUnreadChange }: COOMessagesTabProps) {
  const { user } = useAuth();
  const { formatTime, formatDate } = useLocaleFormatter();

  // Static thread list — built synchronously, never empty
  const threads = buildThreads(patients, doctors);

  // Active thread stored as plain id+type+label — set on click, never derived from async state
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<'admin' | 'patient' | 'doctor'>('admin');
  const [activeLabel, setActiveLabel] = useState('');

  // Per-thread previews (last message, unread) loaded async — only affects sidebar, never the chat panel
  const [previews, setPreviews] = useState<Record<string, ThreadPreview>>({});

  const [messages, setMessages] = useState<CooMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeIdRef = useRef<string | null>(null);
  const readKey = `coo-messages-read-${cooUserId}`;
  const formatSenderName = (msg: CooMessage) => {
    const base = String(msg.sender_name || '').trim() || 'User';
    if (msg.sender_role === 'doctor') {
      return /^dr\.?\s/i.test(base) ? base : `Dr. ${base}`;
    }
    return base;
  };

  const getReadState = (): Record<string, string> => {
    try { return JSON.parse(localStorage.getItem(readKey) || '{}'); }
    catch { return {}; }
  };

  const markRead = (threadId: string) => {
    const state = getReadState();
    state[threadId] = new Date().toISOString();
    localStorage.setItem(readKey, JSON.stringify(state));
    setPreviews((prev) => {
      const next = { ...prev, [threadId]: { ...prev[threadId], unread: 0 } };
      const total = Object.values(next).reduce((sum, p) => sum + (p.unread ?? 0), 0);
      onUnreadChange?.(total);
      return next;
    });
  };

  // Load previews once on mount — failure is silent, just means no preview text/unread counts
  useEffect(() => {
    const threadIds = threads.map((t) => t.id);
    const readState = getReadState();
    supabase
      .from('coo_messages')
      .select('thread_id, content, created_at, sender_role')
      .in('thread_id', threadIds)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (!data) return;
        const byThread = new Map<string, any[]>();
        data.forEach((row: any) => {
          const arr = byThread.get(row.thread_id) || [];
          arr.push(row);
          byThread.set(row.thread_id, arr);
        });
        const next: Record<string, ThreadPreview> = {};
        threadIds.forEach((id) => {
          const msgs = byThread.get(id) || [];
          const last = msgs[0];
          const lastRead = readState[id];
          const unread = msgs.filter(
            (m) => m.sender_role !== 'coo' && (!lastRead || new Date(m.created_at) > new Date(lastRead)),
          ).length;
          next[id] = { lastMessage: last?.content, lastAt: last?.created_at, unread };
        });
        setPreviews(next);
        const total = Object.values(next).reduce((sum, p) => sum + (p.unread ?? 0), 0);
        onUnreadChange?.(total);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cooUserId]);

  // Keep activeIdRef in sync so the background channel closure can read it without stale closure
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);

  // Load messages for active thread
  useEffect(() => {
    if (!activeId) { setMessages([]); return; }
    supabase
      .from('coo_messages')
      .select('*')
      .eq('thread_id', activeId)
      .order('created_at', { ascending: true })
      .then(({ data }) => setMessages((data || []) as CooMessage[]));
  }, [activeId]);

  // Background realtime — covers ALL threads so inactive threads get unread increments
  useEffect(() => {
    const channel = supabase
      .channel(`coo-all-threads-${cooUserId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'coo_messages' },
        (payload) => {
          const msg = payload.new as CooMessage;
          const isActive = msg.thread_id === activeIdRef.current;

          if (isActive) {
            setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
          }

          setPreviews((prev) => {
            const existing = prev[msg.thread_id] ?? { unread: 0 };
            const addUnread = !isActive && msg.sender_role !== 'coo' ? 1 : 0;
            const next = {
              ...prev,
              [msg.thread_id]: {
                lastMessage: msg.content,
                lastAt: msg.created_at,
                unread: existing.unread + addUnread,
              },
            };
            const total = Object.values(next).reduce((sum, p) => sum + (p.unread ?? 0), 0);
            onUnreadChange?.(total);
            return next;
          });
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [cooUserId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSelect = (id: string, type: 'admin' | 'patient' | 'doctor', label: string) => {
    setActiveId(id);
    setActiveType(type);
    setActiveLabel(label);
    setSendError(null);
    setNewMessage('');
    markRead(id);
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const content = newMessage.trim();
    if (!content || !activeId || !user?.id || isSending) return;

    setSendError(null);
    setIsSending(true);
    setNewMessage('');

    const { data, error } = await supabase
      .from('coo_messages')
      .insert({
        thread_id: activeId,
        thread_type: activeType,
        sender_id: user.id,
        sender_role: 'coo',
        sender_name: cooName,
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
      setPreviews((prev) => ({
        ...prev,
        [activeId]: { ...prev[activeId], lastMessage: content, lastAt: msg.created_at },
      }));
    }
    setIsSending(false);
  };

  const formatMsgDate = (iso: string) => {
    const d = new Date(iso);
    return d.toDateString() === new Date().toDateString()
      ? formatTime(iso)
      : `${formatDate(iso)} ${formatTime(iso)}`;
  };

  const chatOpen = activeId !== null;

  return (
    <div className="flex h-[calc(100vh-15rem)] min-h-[520px] max-h-[820px] bg-card rounded-xl border border-border overflow-hidden shadow-sm">

      {/* Thread list — always rendered, hidden on mobile when chat is open */}
      <div className={cn(
        'flex flex-col border-r border-border bg-muted/10 w-full lg:w-[280px] lg:flex-shrink-0',
        chatOpen ? 'hidden lg:flex' : 'flex',
      )}>
        <div className="p-3 border-b border-border flex-shrink-0">
          <p className="text-sm font-semibold text-muted-foreground">
            Conversations ({threads.length})
          </p>
        </div>
        <ScrollArea className="flex-1">
          {threads.map((thread) => {
            const preview = previews[thread.id];
            return (
              <button
                key={thread.id}
                onClick={() => handleSelect(thread.id, thread.type, thread.label)}
                className={cn(
                  'w-full flex items-start gap-3 p-3 text-left transition-colors hover:bg-muted/50 border-b border-border/50 last:border-0',
                  activeId === thread.id && 'bg-primary/5 border-l-4 border-l-primary',
                )}
              >
                <Avatar className="w-9 h-9 flex-shrink-0">
                  <AvatarFallback className={cn(
                    'text-xs',
                    thread.type === 'admin' ? 'bg-destructive/10 text-destructive' : 
                    thread.type === 'doctor' ? 'bg-blue-100 text-blue-600' : 'bg-primary/10 text-primary',
                  )}>
                    {thread.label.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-sm font-medium truncate">{thread.label}</span>
                    {(preview?.unread ?? 0) > 0 && (
                      <Badge variant="destructive" className="h-5 px-1.5 text-[10px] flex-shrink-0">
                        {(preview?.unread ?? 0) > 99 ? '99+' : preview?.unread}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {preview?.lastMessage || 'No messages yet'}
                  </p>
                  <div className="flex items-center justify-between mt-0.5">
                    <Badge variant="outline" className="text-[10px]">
                      {thread.type === 'admin' ? 'Admin' : thread.type === 'doctor' ? 'Doctor' : 'Patient'}
                    </Badge>
                    {preview?.lastAt && (
                      <span className="text-[10px] text-muted-foreground">{formatTime(preview.lastAt)}</span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </ScrollArea>
      </div>

      {/* Chat panel — always rendered when activeId is set, shown/hidden with CSS not conditional rendering */}
      <div className={cn('flex flex-col flex-1 min-w-0 bg-background', chatOpen ? 'flex' : 'hidden lg:flex')}>
        {chatOpen ? (
          <>
            {/* Header */}
            <div className="p-3 border-b border-border flex items-center gap-3 flex-shrink-0">
              <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setActiveId(null)}>
                <X className="w-5 h-5" />
              </Button>
              <Avatar className="w-9 h-9">
                <AvatarFallback className={cn(
                  'text-xs',
                  activeType === 'admin' ? 'bg-destructive/10 text-destructive' : 
                  activeType === 'doctor' ? 'bg-blue-100 text-blue-600' : 'bg-primary/10 text-primary',
                )}>
                  {activeLabel.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-semibold">{activeLabel}</p>
                <Badge variant="outline" className="text-[10px]">
                  {activeType === 'admin' ? 'Admin' : activeType === 'doctor' ? 'Doctor' : 'Patient'}
                </Badge>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center mt-8">
                  No messages yet. Start the conversation.
                </p>
              ) : (
                messages.map((msg) => {
                  const isMine = msg.sender_role === 'coo';
                  return (
                    <div key={msg.id} className={cn('flex gap-2 max-w-[80%]', isMine ? 'ml-auto flex-row-reverse' : '')}>
                      {!isMine && (
                        <Avatar className="w-7 h-7 flex-shrink-0">
                          <AvatarFallback className="text-[10px] bg-muted">
                            {formatSenderName(msg).slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                      )}
                      <div className={cn('flex flex-col', isMine ? 'items-end' : 'items-start')}>
                        {!isMine && (
                          <span className="text-[10px] text-muted-foreground mb-0.5 px-1">{formatSenderName(msg)}</span>
                        )}
                        <div className={cn(
                          'rounded-2xl px-3 py-2 text-sm shadow-sm',
                          isMine
                            ? 'bg-primary text-primary-foreground rounded-tr-sm'
                            : 'bg-muted text-foreground rounded-tl-sm',
                        )}>
                          <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{msg.content}</p>
                        </div>
                        <span className="text-[10px] text-muted-foreground mt-0.5 px-1">
                          {formatMsgDate(msg.created_at)}
                        </span>
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
                  placeholder="Type a message..."
                  value={newMessage}
                  onChange={(e) => { setNewMessage(e.target.value); setSendError(null); }}
                  className="flex-1"
                  disabled={isSending}
                  autoFocus
                />
                <Button type="submit" size="icon" disabled={!newMessage.trim() || isSending}>
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
              Choose Admin, a doctor, or a patient to start messaging.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
