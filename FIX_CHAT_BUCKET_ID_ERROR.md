# Fix: Chat Message Error "record 'new' has no field 'bucket_id'"

## Problem
When trying to send a chat message, you get:
```
Database error: record "new" has no field "bucket_id"
```

## Root Cause
There's a trigger or function in your Supabase database trying to access a `bucket_id` field that doesn't exist in the `consultation_messages` table.

## 🚀 QUICK FIX (2 minutes)

Go to **Supabase Dashboard → SQL Editor** and paste this entire script:

```sql
-- STEP 1: Drop all problematic triggers and functions
DROP TRIGGER IF EXISTS on_consultation_message_created ON public.consultation_messages CASCADE;
DROP TRIGGER IF EXISTS handle_consultation_message_insert ON public.consultation_messages CASCADE;
DROP TRIGGER IF EXISTS consultation_messages_audit ON public.consultation_messages CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_consultation_message() CASCADE;
DROP FUNCTION IF EXISTS public.consultation_audit_trigger() CASCADE;
DROP FUNCTION IF EXISTS public.sync_consultation_metadata() CASCADE;

-- STEP 2: Ensure RLS is enabled
ALTER TABLE public.consultation_messages ENABLE ROW LEVEL SECURITY;

-- STEP 3: Ensure realtime is enabled
ALTER PUBLICATION supabase_realtime ADD TABLE consultation_messages;
```

Click "Run" and chat messages should now work!

---

## Detailed Troubleshooting (if quick fix doesn't work)

Go to **Supabase Dashboard → SQL Editor** and run these commands:

### Step 1: Check for problematic triggers
```sql
-- List all triggers on consultation_messages table
SELECT trigger_name, trigger_schema, event_manipulation, action_timing
FROM information_schema.triggers
WHERE event_object_table = 'consultation_messages';
```

### Step 2: Drop any problematic triggers (if found)
```sql
-- Drop triggers that might be causing issues
DROP TRIGGER IF EXISTS on_consultation_message_created ON public.consultation_messages CASCADE;
DROP TRIGGER IF EXISTS handle_consultation_message_insert ON public.consultation_messages CASCADE;
DROP TRIGGER IF EXISTS consultation_messages_audit ON public.consultation_messages CASCADE;
```

### Step 3: Check for functions referencing bucket_id
```sql
-- Find problematic functions
SELECT pg_get_functiondef(oid) 
FROM pg_proc 
WHERE prosrc LIKE '%bucket_id%' 
AND proname LIKE '%consultation%';
```

### Step 4: Clean database functions (if needed)
```sql
-- Drop any consultation-related functions that might be broken
DROP FUNCTION IF EXISTS public.handle_new_consultation_message() CASCADE;
DROP FUNCTION IF EXISTS public.consultation_audit_trigger() CASCADE;
DROP FUNCTION IF EXISTS public.sync_consultation_metadata() CASCADE;
```

### Step 5: Verify the table structure
```sql
-- Check that consultation_messages has the right columns
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'consultation_messages'
ORDER BY ordinal_position;
```

Expected output should show these columns (NO bucket_id):
- id (uuid)
- session_id (uuid)
- sender_id (uuid)
- sender_role (text)
- sender_name (text)
- message_type (text)
- content (text)
- file_url (text)
- created_at (timestamp)

### Step 6: Test chat again
Go back to the app and try sending a chat message. It should work now!

## If Still Not Working

### Option A: Recreate the table cleanly
```sql
-- Backup existing messages (if any)
CREATE TABLE consultation_messages_backup AS
SELECT * FROM public.consultation_messages;

-- Drop and recreate the table
DROP TABLE IF EXISTS public.consultation_messages CASCADE;

CREATE TABLE IF NOT EXISTS public.consultation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL,
  sender_id UUID NOT NULL,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('patient', 'doctor')),
  sender_name TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'file', 'system')),
  content TEXT NOT NULL,
  file_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  FOREIGN KEY (session_id) REFERENCES public.consultation_sessions(id) ON DELETE CASCADE
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_consultation_messages_session_id ON public.consultation_messages (session_id);
CREATE INDEX IF NOT EXISTS idx_consultation_messages_sender_id ON public.consultation_messages (sender_id);
CREATE INDEX IF NOT EXISTS idx_consultation_messages_created_at ON public.consultation_messages (created_at);

-- Enable RLS
ALTER TABLE public.consultation_messages ENABLE ROW LEVEL SECURITY;

-- Add RLS policies
CREATE POLICY "Allow viewing messages from own sessions" ON public.consultation_messages
  FOR SELECT
  USING (
    session_id IN (
      SELECT id FROM public.consultation_sessions
      WHERE patient_id = auth.uid()::uuid OR doctor_id = auth.uid()::uuid
    )
    OR auth.jwt() ->> 'role' = 'service_role'
  );

CREATE POLICY "Allow inserting messages" ON public.consultation_messages
  FOR INSERT
  WITH CHECK (sender_id = auth.uid()::uuid);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE consultation_messages;
```

### Option B: Check Supabase Storage
The error might be related to Supabase Storage buckets. If you're trying to upload files with messages:

```sql
-- Check if there's any storage-related code
SELECT * FROM storage.buckets;
```

If you see buckets with `consultation` in the name, check if they have a `bucket_id` column issue.

## Testing
After running the SQL:
1. Restart the application
2. Open a consultation
3. Try sending a text message
4. Check browser console for any errors
5. The message should appear in chat instantly

## Related Code
The chat sending code is in:
- [src/services/consultationService.ts](src/services/consultationService.ts) - `sendMessage()` method
- [src/components/consultation/ConsultationRoom.tsx](src/components/consultation/ConsultationRoom.tsx) - Chat UI

If this still doesn't work, the issue might be:
1. A stored procedure or view accessing `bucket_id`
2. A Supabase Storage integration
3. A custom trigger in your database

Run Step 3 and 4 above to check for these.
