import { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Message {
  id: string;
  sender: 'user' | 'remote';
  senderName: string;
  content: string;
  timestamp: Date;
  type: 'text' | 'file';
}

interface ChatSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  messages: Message[];
  newMessage: string;
  onMessageChange: (message: string) => void;
  onSendMessage: () => void;
}

export function ChatSidebar({
  isOpen,
  onClose,
  messages,
  newMessage,
  onMessageChange,
  onSendMessage
}: ChatSidebarProps) {
  const chatScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 'auto', opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="w-80 sm:w-96 flex flex-col bg-[#252542] border-l border-white/10 overflow-hidden"
        >
          {/* Chat header */}
          <div className="flex items-center justify-between p-4 border-b border-white/10">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              Meeting Chat
            </h3>
            <Button 
              variant="ghost" 
              size="icon" 
              className="w-8 h-8 text-white/70 hover:text-white"
              onClick={onClose}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Messages */}
          <ScrollArea ref={chatScrollRef} className="flex-1 p-4">
            <div className="space-y-4">
              {messages.length === 0 ? (
                <div className="text-center py-12">
                  <MessageSquare className="w-12 h-12 mx-auto mb-3 text-slate-600" />
                  <p className="text-slate-400 text-sm">No messages yet</p>
                  <p className="text-slate-500 text-xs mt-1">Start the conversation</p>
                </div>
              ) : (
                messages.map((message) => (
                  <div key={message.id} className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className="max-w-[85%]">
                      {message.sender === 'remote' && (
                        <p className="text-xs text-slate-500 mb-1 px-1">{message.senderName}</p>
                      )}
                      <div className={`rounded-2xl px-4 py-2 ${
                        message.sender === 'user'
                          ? 'bg-primary text-primary-foreground rounded-br-sm'
                          : 'bg-[#3d3d5c] text-white rounded-bl-sm'
                      }`}>
                        <p className="text-sm break-words">{message.content}</p>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1 px-1">
                        {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>

          {/* Chat input */}
          <div className="p-4 border-t border-white/10">
            <form onSubmit={(e) => { e.preventDefault(); onSendMessage(); }} className="flex gap-2">
              <Input
                placeholder="Type a message..."
                value={newMessage}
                onChange={(e) => onMessageChange(e.target.value)}
                className="flex-1 bg-[#1a1a2e] border-white/10 text-white placeholder-slate-500 focus:ring-primary"
              />
              <Button 
                type="submit" 
                disabled={!newMessage.trim()} 
                size="icon"
                className="bg-primary hover:bg-primary/90"
              >
                <Send className="w-4 h-4" />
              </Button>
            </form>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
