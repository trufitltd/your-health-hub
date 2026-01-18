# Real-Time Two-Way Consultation System

This document describes the implementation of the real-time two-way consultation system for MyEdoctor Online, supporting video, audio, and chat consultations with persistent data storage and real-time synchronization.

## Architecture Overview

### Database Schema

The system uses three main tables for managing consultations:

1. **consultation_sessions** - Stores consultation session metadata

   - Session ID, appointment ID, participants (patient/doctor)
   - Consultation type (video, audio, chat)
   - Session status and duration
   - Timestamps and notes

2. **consultation_messages** - Stores all messages exchanged during consultations

   - Message ID, session ID, sender information
   - Message content, type (text/file/system)
   - Timestamps for message ordering

3. **consultation_recordings** - Stores metadata for session recordings
   - Recording URLs, duration, file size
   - Associated session reference

### Components

#### ConsultationRoom

The main component for conducting consultations. Features:

- Real-time message synchronization via Supabase subscriptions
- Media stream management (video/audio)
- Chat interface with scrollable message history
- Connection status monitoring
- Session duration tracking
- Support for fullscreen mode
- Responsive design for different screen sizes

#### ConsultationHistory

Displays past consultations with:

- Session date and time
- Consultation type and duration
- Session status
- Notes from the consultation
- Download/export options (placeholder)

### Services

#### consultationService.ts

Core service for managing consultations:

**Key Methods:**

- `createSession()` - Initialize a new consultation session
- `getSession()` / `getSessionByAppointmentId()` - Retrieve session data
- `endSession()` - Mark session as complete and save metadata
- `sendMessage()` - Send a message in the consultation
- `getMessages()` - Load message history
- `subscribeToMessages()` - Real-time message updates via websocket
- `subscribeToSession()` - Monitor session status changes
- `getSessionHistory()` - Retrieve user's consultation history
- `saveRecording()` - Store recording metadata

**Real-Time Subscriptions:**
Uses Supabase's PostgreSQL real-time capabilities with:

- Channel-based subscriptions per session
- Automatic reconnection handling
- Error recovery

### Hooks

#### useConsultation

Custom React hook for managing consultation state:

```typescript
const {
  session, // Current session data
  messages, // Message history
  isLoading, // Loading state
  error, // Error state
  sendMessage, // Send message function
  endSession, // End session function
  loadMessages, // Reload messages function
} = useConsultation(appointmentId, patientId, doctorId, consultationType);
```

## Features

### Two-Way Communication

- **Real-time messaging**: Messages appear instantly for both participants
- **Message history**: All messages are persisted and accessible
- **Message types**: Support for text, files, and system messages
- **Sender identification**: Clear indication of who sent each message

### Media Features

- **Video consultation**: Peer-to-peer video streaming (framework ready)
- **Audio consultation**: Audio-only mode with visual indicators
- **Chat consultation**: Text-based messaging
- **Media controls**: Microphone/camera toggles, speaker controls
- **Picture-in-picture**: Local video preview for video consultations

### Session Management

- **Automatic session creation**: Creates session on first join
- **Session persistence**: Sessions stored in database
- **Duration tracking**: Automatic call duration calculation
- **Session notes**: Doctors can add notes after consultation
- **Session history**: Complete audit trail of all consultations

### UI/UX Features

- **Connection status**: Visual indicator (connecting/connected/disconnected)
- **Call timer**: Real-time duration display
- **Message scrolling**: Auto-scroll to latest messages
- **Responsive layout**: Adapts to mobile/tablet/desktop
- **Fullscreen mode**: Expand consultation room to full screen
- **Loading states**: Skeleton loaders for history

## Real-Time Data Flow

### Message Send Flow

1. User types and sends message
2. Message sent to `consultation_messages` table
3. Real-time subscription triggers on other client(s)
4. Message appears immediately on remote participant's screen
5. Optimistic UI updates for sender

### Session Update Flow

1. Session created when consultation starts
2. Real-time subscription monitors session status
3. Duration calculated automatically from timestamps
4. Session marked complete when call ends
5. Notes can be added by doctors post-consultation

## Database Migrations

Run the following SQL in Supabase to set up tables:

```bash
# Navigate to your Supabase project SQL editor
# Execute: db/04_create_consultation_tables.sql
```

This creates:

- `consultation_sessions` table with indexes
- `consultation_messages` table with indexes
- `consultation_recordings` table with indexes
- Row-level security (RLS) policies for access control

## RLS Policies

All tables have Row-Level Security enabled with policies:

- Users can only view sessions they're part of
- Users can only see messages from their sessions
- Users can only insert messages for themselves
- Service role has unrestricted access for admin operations

## Error Handling

The system handles:

- Network failures with automatic reconnection
- Media access denied (graceful degradation)
- Database errors with user-friendly toast notifications
- Subscription failures with fallback to polling
- Session not found errors

## Performance Considerations

1. **Indexes**: All frequently-queried columns are indexed
2. **Subscriptions**: Minimal payload for real-time updates
3. **Message pagination**: Messages loaded on demand (future)
4. **Session cleanup**: Ended sessions available for archival
5. **Connection pooling**: Supabase handles connection management

## Future Enhancements

1. **WebRTC Integration**: Real peer-to-peer video/audio (currently framework-ready)
2. **Recording**: Store consultation recordings in cloud storage
3. **Transcription**: AI-powered message transcription
4. **Sentiment Analysis**: Analyze consultation tone
5. **Message Encryption**: End-to-end encryption for sensitive conversations
6. **File Sharing**: Attach medical documents during consultation
7. **Prescription Integration**: Generate prescriptions from consultation
8. **Follow-up Scheduling**: Auto-schedule follow-up appointments
9. **Multi-participant**: Support group consultations
10. **Screen Sharing**: Share patient records during consultation

## Usage Example

```tsx
import { ConsultationRoom } from "@/components/consultation";

function MyConsultation() {
  return (
    <ConsultationRoom
      appointmentId="123"
      consultationType="video"
      participantName="Dr. Emily Chen"
      participantRole="patient"
      onEndCall={() => navigate("/dashboard")}
    />
  );
}
```

## Testing

To test the real-time features:

1. Open two browser windows with the same appointment
2. Log in with different accounts (patient/doctor)
3. Send messages from one side
4. Verify messages appear instantly on other side
5. Check database records in Supabase

## Troubleshooting

### Messages not appearing

- Check browser console for errors
- Verify user is authenticated
- Confirm session ID is created
- Check RLS policies allow access

### Connection status stuck on "Connecting"

- Verify internet connection
- Check Supabase project status
- Clear browser cache and reload
- Check for CORS issues in network tab

### Media access denied

- Check browser permissions
- Verify HTTPS is enabled
- Check device has microphone/camera
- Try different browser

## API Reference

See `src/services/consultationService.ts` for complete API documentation.
