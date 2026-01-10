import { useState, useRef, useEffect } from 'react';
import {
    Search, Send, Paperclip, MoreVertical, Phone, Video,
    Check, CheckCheck, Circle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

// Types
interface Message {
    id: string;
    senderId: string;
    content: string;
    timestamp: Date;
    read: boolean;
    type: 'text' | 'image' | 'file';
}

interface Conversation {
    id: string;
    doctorId: string;
    doctorName: string;
    doctorAvatar?: string;
    specialty: string;
    isOnline: boolean;
    lastSeen?: Date;
    unreadCount: number;
    messages: Message[];
}

// Mock Data
const MOCK_CONVERSATIONS: Conversation[] = [
    {
        id: '1',
        doctorId: 'd1',
        doctorName: 'Dr. Emily Chen',
        specialty: 'Cardiologist',
        isOnline: true,
        unreadCount: 2,
        messages: [
            {
                id: 'm1',
                senderId: 'd1',
                content: 'Hello! How are you feeling after the new medication?',
                timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
                read: true,
                type: 'text',
            },
            {
                id: 'm2',
                senderId: 'user',
                content: 'Hi Dr. Chen. I am feeling much better, thank you. The dizziness has subsided.',
                timestamp: new Date(Date.now() - 1000 * 60 * 60 * 1.5),
                read: true,
                type: 'text',
            },
            {
                id: 'm3',
                senderId: 'd1',
                content: 'That is great to hear. Please continue the dosage for another week.',
                timestamp: new Date(Date.now() - 1000 * 60 * 30), // 30 mins ago
                read: false,
                type: 'text',
            },
            {
                id: 'm4',
                senderId: 'd1',
                content: 'Let me know if you experience any other side effects.',
                timestamp: new Date(Date.now() - 1000 * 60 * 29),
                read: false,
                type: 'text',
            },
        ],
    },
    {
        id: '2',
        doctorId: 'd2',
        doctorName: 'Dr. James Wilson',
        specialty: 'General Medicine',
        isOnline: false,
        lastSeen: new Date(Date.now() - 1000 * 60 * 60 * 5),
        unreadCount: 0,
        messages: [
            {
                id: 'm1',
                senderId: 'user',
                content: 'Dr. Wilson, can I reschedule our appointment next week?',
                timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2), // 2 days ago
                read: true,
                type: 'text',
            },
            {
                id: 'm2',
                senderId: 'd2',
                content: 'Sure, please check the available slots in the calendar tab.',
                timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 1), // 1 day ago
                read: true,
                type: 'text',
            },
        ],
    },
    {
        id: '3',
        doctorId: 'd3',
        doctorName: 'Dr. Sarah Martinez',
        specialty: 'Nutritionist',
        isOnline: false,
        lastSeen: new Date(Date.now() - 1000 * 60 * 15),
        unreadCount: 0,
        messages: [
            {
                id: 'm1',
                senderId: 'd3',
                content: 'Here is the diet plan we discussed.',
                timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5),
                read: true,
                type: 'text',
            },
        ],
    },
];

export function MessagesTab() {
    const [conversations, setConversations] = useState<Conversation[]>(MOCK_CONVERSATIONS);
    const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [newMessage, setNewMessage] = useState('');
    const scrollRef = useRef<HTMLDivElement>(null);

    const selectedConversation = conversations.find(c => c.id === selectedConversationId);

    // Auto-scroll to bottom of chat
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [selectedConversation?.messages, selectedConversationId]);

    const handleSelectConversation = (id: string) => {
        setSelectedConversationId(id);
        // Mark as read
        setConversations(prev => prev.map(c => {
            if (c.id === id) {
                return {
                    ...c,
                    unreadCount: 0,
                    messages: c.messages.map(m => ({ ...m, read: true }))
                };
            }
            return c;
        }));
    };

    const handleSendMessage = (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!newMessage.trim() || !selectedConversationId) return;

        const newMsg: Message = {
            id: Date.now().toString(),
            senderId: 'user',
            content: newMessage,
            timestamp: new Date(),
            read: true,
            type: 'text',
        };

        setConversations(prev => prev.map(c => {
            if (c.id === selectedConversationId) {
                return {
                    ...c,
                    messages: [...c.messages, newMsg]
                };
            }
            return c;
        }));

        setNewMessage('');

        // Simulate reply
        setTimeout(() => {
            const replyMsg: Message = {
                id: (Date.now() + 1).toString(),
                senderId: selectedConversation?.doctorId || 'doctor',
                content: "I've received your message. I'll get back to you shortly.",
                timestamp: new Date(),
                read: false,
                type: 'text',
            };

            setConversations(prev => prev.map(c => {
                if (c.id === selectedConversationId) {
                    return {
                        ...c,
                        messages: [...c.messages, replyMsg],
                        unreadCount: c.unreadCount + 1 // Technically user is viewing it, but for demo logic
                    };
                }
                return c;
            }));
        }, 2000);
    };

    const filteredConversations = conversations.filter(c =>
        c.doctorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.specialty.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const formatTime = (date: Date) => {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const formatDate = (date: Date) => {
        const today = new Date();
        if (date.getDate() === today.getDate() && date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear()) {
            return formatTime(date);
        }
        return date.toLocaleDateString();
    };

    return (
        <div className="grid md:grid-cols-[350px_1fr] gap-6 h-[600px] bg-card rounded-xl border border-border overflow-hidden shadow-sm">
            {/* Sidebar */}
            <div className="flex flex-col border-r border-border bg-muted/10">
                <div className="p-4 border-b border-border">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                            placeholder="Search conversations..."
                            className="pl-9 bg-background"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>
                <ScrollArea className="flex-1">
                    <div className="flex flex-col">
                        {filteredConversations.map((conversation) => (
                            <button
                                key={conversation.id}
                                onClick={() => handleSelectConversation(conversation.id)}
                                className={cn(
                                    "flex items-start gap-3 p-4 text-left transition-colors hover:bg-muted/50 border-b border-border/50 last:border-0",
                                    selectedConversationId === conversation.id && "bg-primary/5 hover:bg-primary/10 border-l-4 border-l-primary"
                                )}
                            >
                                <div className="relative">
                                    <Avatar>
                                        <AvatarImage src={conversation.doctorAvatar} />
                                        <AvatarFallback className="bg-primary/10 text-primary">
                                            {conversation.doctorName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                        </AvatarFallback>
                                    </Avatar>
                                    {conversation.isOnline && (
                                        <span className="absolute bottom-0 right-0 w-3 h-3 bg-success rounded-full border-2 border-background" />
                                    )}
                                </div>
                                <div className="flex-1 overflow-hidden">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="font-medium truncate">{conversation.doctorName}</span>
                                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                                            {conversation.messages.length > 0 && formatDate(conversation.messages[conversation.messages.length - 1].timestamp)}
                                        </span>
                                    </div>
                                    <p className="text-xs text-muted-foreground truncate mb-1">
                                        {conversation.specialty}
                                    </p>
                                    <div className="flex items-center justify-between">
                                        <p className={cn(
                                            "text-sm truncate max-w-[180px]",
                                            conversation.unreadCount > 0 ? "font-medium text-foreground" : "text-muted-foreground"
                                        )}>
                                            {conversation.messages.length > 0
                                                ? conversation.messages[conversation.messages.length - 1].content
                                                : "No messages yet"}
                                        </p>
                                        {conversation.unreadCount > 0 && (
                                            <Badge className="h-5 w-5 p-0 flex items-center justify-center rounded-full">
                                                {conversation.unreadCount}
                                            </Badge>
                                        )}
                                    </div>
                                </div>
                            </button>
                        ))}
                        {filteredConversations.length === 0 && (
                            <div className="p-8 text-center text-muted-foreground">
                                <p>No conversations found</p>
                            </div>
                        )}
                    </div>
                </ScrollArea>
            </div>

            {/* Chat Area */}
            {selectedConversation ? (
                <div className="flex flex-col h-full bg-background">
                    {/* Chat Header */}
                    <div className="p-4 border-b border-border flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Avatar>
                                <AvatarImage src={selectedConversation.doctorAvatar} />
                                <AvatarFallback className="bg-primary/10 text-primary">
                                    {selectedConversation.doctorName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                </AvatarFallback>
                            </Avatar>
                            <div>
                                <h3 className="font-semibold">{selectedConversation.doctorName}</h3>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground">{selectedConversation.specialty}</span>
                                    {selectedConversation.isOnline ? (
                                        <span className="flex items-center gap-1 text-xs text-success">
                                            <span className="w-1.5 h-1.5 rounded-full bg-success" />
                                            Online
                                        </span>
                                    ) : (
                                        <span className="text-xs text-muted-foreground">
                                            Last seen {selectedConversation.lastSeen ? formatDate(selectedConversation.lastSeen) : 'recently'}
                                        </span>
                                    )}
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

                    {/* Messages List */}
                    <ScrollArea className="flex-1 p-4" ref={scrollRef}>
                        <div className="space-y-4">
                            {selectedConversation.messages.map((message, index) => {
                                const isUser = message.senderId === 'user';
                                const showAvatar = !isUser && (
                                    index === 0 ||
                                    selectedConversation.messages[index - 1].senderId === 'user'
                                );

                                return (
                                    <div
                                        key={message.id}
                                        className={cn(
                                            "flex gap-3 max-w-[80%]",
                                            isUser ? "ml-auto flex-row-reverse" : ""
                                        )}
                                    >
                                        {!isUser && (
                                            <div className="w-8 flex-shrink-0">
                                                {showAvatar && (
                                                    <Avatar className="w-8 h-8">
                                                        <AvatarImage src={selectedConversation.doctorAvatar} />
                                                        <AvatarFallback className="bg-primary/10 text-primary text-xs">
                                                            {selectedConversation.doctorName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                )}
                                            </div>
                                        )}

                                        <div className={cn(
                                            "flex flex-col",
                                            isUser ? "items-end" : "items-start"
                                        )}>
                                            <div className={cn(
                                                "rounded-2xl px-4 py-2 shadow-sm",
                                                isUser
                                                    ? "bg-primary text-primary-foreground rounded-tr-sm"
                                                    : "bg-muted text-foreground rounded-tl-sm"
                                            )}>
                                                <p className="text-sm">{message.content}</p>
                                            </div>
                                            <div className="flex items-center gap-1 mt-1 px-1">
                                                <span className="text-[10px] text-muted-foreground">
                                                    {formatTime(message.timestamp)}
                                                </span>
                                                {isUser && (
                                                    message.read ? (
                                                        <CheckCheck className="w-3 h-3 text-primary" />
                                                    ) : (
                                                        <Check className="w-3 h-3 text-muted-foreground" />
                                                    )
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </ScrollArea>

                    {/* Input Area */}
                    <div className="p-4 border-t border-border bg-background">
                        <form onSubmit={handleSendMessage} className="flex items-end gap-2">
                            <Button type="button" variant="ghost" size="icon" className="flex-shrink-0">
                                <Paperclip className="w-5 h-5 text-muted-foreground" />
                            </Button>
                            <Input
                                placeholder="Type a message..."
                                value={newMessage}
                                onChange={(e) => setNewMessage(e.target.value)}
                                className="flex-1 min-h-[44px]"
                            />
                            <Button type="submit" disabled={!newMessage.trim()} className="flex-shrink-0">
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
                    <h3 className="text-xl font-semibold mb-2">Select a Conversation</h3>
                    <p className="text-muted-foreground max-w-sm">
                        Choose a doctor from the list to view your conversation history or start a new message.
                    </p>
                </div>
            )}
        </div>
    );
}
