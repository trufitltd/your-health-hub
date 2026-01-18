# Real-Time Consultation System Setup Guide

## Step 1: Database Setup

1. Go to your Supabase project dashboard
2. Navigate to the SQL Editor
3. Copy and paste the contents of `db/04_create_consultation_tables.sql`
4. Execute the SQL to create the required tables and policies

The script creates:

- `consultation_sessions` table
- `consultation_messages` table
- `consultation_recordings` table
- All necessary indexes for performance
- Row-Level Security (RLS) policies

## Step 2: Environment Configuration

No additional environment variables are needed beyond your existing Supabase setup. The system uses the existing `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

## Step 3: Component Integration

The consultation system is already integrated but here's how to use it:

### In Appointment Details

```tsx
import { JoinConsultationButton } from "@/components/consultation";

<JoinConsultationButton
  appointmentId={appointment.id}
  consultationType={appointment.type as "video" | "audio" | "chat"}
  participantName={doctorName}
/>;
```

### In Consultation Page

```tsx
import { ConsultationRoom } from "@/components/consultation";

<ConsultationRoom
  appointmentId={appointmentId}
  consultationType={type}
  participantName={participantName}
  participantRole={role}
  onEndCall={handleEndCall}
/>;
```

### Show Consultation History

```tsx
import { ConsultationHistory } from "@/components/consultation";

<ConsultationHistory />;
```

## Step 4: Real-Time Features

The system automatically:

- Creates sessions when consultations start
- Synchronizes messages in real-time across participants
- Tracks session duration
- Stores all consultation data

No additional code needed - it works out of the box!

## Step 5: Testing the Implementation

### Test Real-Time Messages

1. Start a consultation on two devices/browsers simultaneously
2. Send a message from one side
3. Verify it appears instantly on the other side
4. Check Supabase console to see saved messages

### Test Session Tracking

1. Open Supabase dashboard → consultation_sessions table
2. Start a consultation
3. New session should appear automatically
4. Duration should increase as consultation continues
5. When consultation ends, it should be marked as 'ended'

### Test Message History

1. End a consultation
2. Start the same appointment again
3. Previous messages should appear in chat
4. New messages should sync in real-time

## Database Schema

### consultation_sessions

```sql
- id (UUID, primary key)
- appointment_id (UUID, foreign key)
- patient_id (UUID)
- doctor_id (UUID)
- consultation_type (TEXT: 'video', 'audio', 'chat')
- started_at (TIMESTAMPTZ)
- ended_at (TIMESTAMPTZ, nullable)
- duration_seconds (INT)
- status (TEXT: 'active', 'ended', 'paused')
- notes (TEXT, nullable)
- created_at (TIMESTAMPTZ)
```

### consultation_messages

```sql
- id (UUID, primary key)
- session_id (UUID, foreign key)
- sender_id (UUID)
- sender_role (TEXT: 'patient', 'doctor')
- sender_name (TEXT)
- message_type (TEXT: 'text', 'file', 'system')
- content (TEXT)
- file_url (TEXT, nullable)
- created_at (TIMESTAMPTZ)
```

### consultation_recordings

```sql
- id (UUID, primary key)
- session_id (UUID, foreign key)
- recording_url (TEXT)
- duration_seconds (INT)
- file_size_mb (DECIMAL)
- created_at (TIMESTAMPTZ)
```

## RLS Policies

All tables have Row-Level Security enabled:

### consultation_sessions

- Users can view sessions they participate in
- Can insert new sessions
- Can update sessions they're in

### consultation_messages

- Users can view messages from their sessions
- Can insert their own messages
- Cannot modify others' messages

### consultation_recordings

- Users can view recordings from their sessions
- Cannot delete or modify

## Service API

### Creating a Session

```typescript
const session = await consultationService.createSession(
  appointmentId,
  patientId,
  doctorId,
  "video" // or 'audio', 'chat'
);
```

### Sending a Message

```typescript
await consultationService.sendMessage(
  sessionId,
  userId,
  "patient", // or 'doctor'
  "John Doe",
  "Hello, how are you?"
);
```

### Subscribing to Messages

```typescript
const unsubscribe = consultationService.subscribeToMessages(
  sessionId,
  (message) => {
    console.log("New message:", message);
  }
);

// Later, unsubscribe
unsubscribe();
```

### Ending a Session

```typescript
await consultationService.endSession(
  sessionId,
  durationInSeconds,
  "Consultation notes here..."
);
```

### Getting Session History

```typescript
const sessions = await consultationService.getSessionHistory(
  userId,
  "patient", // or 'doctor'
  20 // limit
);
```

## Troubleshooting

### Tables not found error

- Run the SQL migration again in Supabase
- Verify tables appear in the Database tab
- Check for any SQL syntax errors

### Real-time updates not working

- Verify Supabase project has real-time enabled
- Check browser console for connection errors
- Ensure users are authenticated
- Verify RLS policies allow access

### Messages not saving

- Check Supabase quota limits
- Verify RLS policies (should be automatically applied)
- Check database logs for errors
- Ensure session_id exists before sending messages

### Performance issues

- Monitor Supabase connection pool
- Check message count in consultation_messages
- Consider adding pagination for old messages
- Archive old sessions to separate table

## Next Steps

1. Deploy database migrations to production
2. Test real-time features with sample users
3. Monitor Supabase metrics for performance
4. Implement WebRTC for actual video/audio
5. Add recording feature
6. Consider scaling for high-volume usage

## Support

For issues or questions:

1. Check Supabase logs for database errors
2. Review browser console for JavaScript errors
3. Check network tab for connection issues
4. Verify authentication tokens are valid
5. Review RLS policies in Supabase dashboard
