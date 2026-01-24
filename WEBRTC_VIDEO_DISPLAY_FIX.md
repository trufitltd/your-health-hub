# WebRTC Remote Video Display Fix

## Problem Summary
Both sides showed "connected" status but:
- ❌ Remote video not displaying (black screen with avatar instead)
- ❌ Remote audio not working
- ❌ Chat messages failing with database error

## Root Causes Identified

### 1. **Video Element DOM Rendering Issue** (PRIMARY)
The remote stream was being attached to the video element BEFORE the element existed in the DOM.

**Timeline:**
1. Doctor's onStream callback fires → tries to set `remoteVideoRef.current.srcObject`
2. At this point, `remoteVideoRef.current` is **null** because video element not yet rendered
3. Render condition: `{hasRemoteStream && connectionStatus === 'connected' && remoteVideoEnabled ? <video ref={remoteVideoRef}/> : <avatar/>}`
4. Video element only renders AFTER `connectionStatus` becomes 'connected'
5. By then, `srcObject` attachment already failed silently

**Solution Implemented:**
Added a new effect that ensures the remote stream is attached to the video element AFTER it becomes available in the DOM:

```tsx
// Ensure remote stream is attached to video element when element becomes available
useEffect(() => {
  if (!hasRemoteStream || !remoteVideoRef.current) return;
  
  // If video element is in DOM and stream exists, attach it
  if (!remoteVideoRef.current.srcObject && webrtcService) {
    const remoteStream = webrtcService.getRemoteStream();
    if (remoteStream) {
      console.log('[Remote Stream Attachment] Attaching remote stream to video element');
      remoteVideoRef.current.srcObject = remoteStream;
      remoteVideoRef.current.play().catch(err => {
        console.log('[Remote Stream Attachment] Video play() error:', err.message);
      });
    }
  }
  
  // Also ensure audio is attached
  if (!remoteAudioRef.current?.srcObject && webrtcService) {
    const remoteStream = webrtcService.getRemoteStream();
    if (remoteStream && remoteStream.getAudioTracks().length > 0) {
      console.log('[Remote Stream Attachment] Attaching remote stream to audio element');
      remoteAudioRef.current!.srcObject = remoteStream;
    }
  }
}, [hasRemoteStream, connectionStatus, webrtcService]);
```

### 2. **WebRTCService Missing Remote Stream Getter**
The new effect needs to retrieve the remote stream, but the service didn't expose it.

**Solution Implemented:**
Added `getRemoteStream()` method to WebRTCService:

```typescript
/**
 * Get the current remote stream (for manual attachment to video/audio elements if needed)
 */
getRemoteStream(): MediaStream | null {
  return this.remoteStream;
}
```

### 3. **Chat Database Error - `bucket_id` Field** (SEPARATE ISSUE)
Error message: `Database error: record "new" has no field "bucket_id"`

This is a Supabase database trigger/function issue, not application code.

**Solution:**
Run this SQL in Supabase SQL Editor:

```sql
-- Drop all problematic triggers
DROP TRIGGER IF EXISTS on_consultation_message_created ON public.consultation_messages CASCADE;
DROP TRIGGER IF EXISTS handle_consultation_message_insert ON public.consultation_messages CASCADE;
DROP TRIGGER IF EXISTS consultation_messages_audit ON public.consultation_messages CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_consultation_message() CASCADE;
DROP FUNCTION IF EXISTS public.consultation_audit_trigger() CASCADE;
DROP FUNCTION IF EXISTS public.sync_consultation_metadata() CASCADE;

-- Re-enable core functionality
ALTER TABLE public.consultation_messages ENABLE ROW LEVEL SECURITY;
ALTER PUBLICATION supabase_realtime ADD TABLE consultation_messages;
```

See [FIX_CHAT_BUCKET_ID_ERROR.md](FIX_CHAT_BUCKET_ID_ERROR.md) for detailed instructions.

---

## Files Modified

### 1. `src/components/consultation/ConsultationRoom.tsx`
- **Lines 352-381:** Added new effect `useEffect` for remote stream attachment
  - Triggers when: `hasRemoteStream`, `connectionStatus`, or `webrtcService` changes
  - Ensures `srcObject` is attached to video/audio elements after DOM is ready
  - Calls `.play()` to start playback

### 2. `src/services/webrtcService.ts`
- **Lines 665-670:** Added `getRemoteStream()` method
  - Returns: `MediaStream | null`
  - Allows ConsultationRoom component to retrieve the remote stream for manual attachment

---

## Testing the Fix

### Step 1: Deploy Code Changes
```bash
# The code changes are in the files above
# They will deploy on next build
```

### Step 2: Fix Database Error (Chat)
Go to Supabase SQL Editor and run:
```sql
-- See FIX_CHAT_BUCKET_ID_ERROR.md for full SQL
DROP TRIGGER IF EXISTS on_consultation_message_created ON public.consultation_messages CASCADE;
DROP TRIGGER IF EXISTS handle_consultation_message_insert ON public.consultation_messages CASCADE;
DROP TRIGGER IF EXISTS consultation_messages_audit ON public.consultation_messages CASCADE;
-- [rest of commands in the guide]
```

### Step 3: Test End-to-End
1. Open app in two browsers (doctor + patient)
2. Patient: Book appointment and join consultation
3. Doctor: See patient waiting, click "Admit"
4. Both should see:
   - ✅ Remote video element displaying (with video playing, not avatar)
   - ✅ Remote audio playing
   - ✅ Chat messages sending successfully
   - ✅ Connection status shows "connected"

### Expected Console Logs (Successful Case)
```
[Remote Stream Attachment] Attaching remote stream to video element
[Remote Stream Attachment] Attaching remote stream to audio element
[WebRTC] 🎉 Connection established - setting connected status
```

---

## Why This Happened

**React Rendering Timing Issue:**
- onStream callback sets `srcObject` immediately when stream arrives
- But the video element ref is null because conditional rendering hasn't happened yet
- The `connectionStatus` state change triggers a re-render that creates the video element
- By that time, the attachment code already ran and failed

**Solution Approach:**
- Use an effect with dependencies `[hasRemoteStream, connectionStatus, webrtcService]`
- This effect runs AFTER the video element is in the DOM
- It then safely attaches the stream that was already received

---

## Previous Fixes (Not Related to This Issue)

These were applied earlier and are still in place:

### ✅ Track State Thrashing Fix (Dec 2025)
- Removed mute/unmute event listeners (they fluctuate with network)
- Only listen to 'ended' event for permanent track loss
- Always show video if track exists

### ✅ WebRTC Re-initialization Prevention (Dec 2025)
- Use `webrtcInitializedRef` useRef instead of state variables
- Prevents component re-renders from triggering duplicate initialization

### ✅ Event-Driven Offer Creation (Dec 2025)
- Doctor waits for patient's `ready` signal instead of fixed 2-second delay
- More reliable connection establishment

### ✅ Relay Network Fallback Connection (Dec 2025)
- Detects when ICE gets stuck at "checking" (firewall/NAT blocking)
- Fires connection callback after 10 seconds if media is flowing

---

## Summary

The fix ensures remote streams are properly attached to DOM elements even when the timeline is:
1. Stream arrives → onStream fires → tries to attach to null ref
2. Connection status updates → video element renders  
3. New effect runs → attaches stream to now-available ref

This is a pattern-based solution addressing React's asynchronous rendering model with WebRTC's synchronous callbacks.
