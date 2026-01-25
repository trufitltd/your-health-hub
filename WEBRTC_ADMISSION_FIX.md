# WebRTC Connection Fix - Doctor Admits Patient

## Problem
When doctor admits patient to call, both participants get stuck in "connecting" status because:
1. Doctor initializes WebRTC immediately (as initiator)
2. Patient initializes WebRTC when admitted (as non-initiator)
3. Both create separate connections, causing signal conflicts
4. Error: "Cannot set answer - no local description or already has remote description"

## Solution
Prevent patient from re-initializing WebRTC if already initialized. Only initialize once.

## Code Change

In `src/components/consultation/ConsultationRoom.tsx`, find this section (around line 180):

```typescript
// Patient receives admit_patient signal from doctor
if (signal.signal_data?.type === 'admit_patient' && participantRole === 'patient') {
  console.log('[Lobby] 🎉 Doctor is admitting patient to call');
  setIsAdmitted(true);
  setIsCallStarted(true);
  setShouldInitializeWebRTC(true);  // ← PROBLEM: Always sets to true
  toast({
    title: 'Admitted to Call',
    description: 'The doctor has admitted you to the consultation.',
    duration: 3000,
  });
}
```

Replace with:

```typescript
// Patient receives admit_patient signal from doctor
if (signal.signal_data?.type === 'admit_patient' && participantRole === 'patient') {
  console.log('[Lobby] 🎉 Doctor is admitting patient to call');
  setIsAdmitted(true);
  setIsCallStarted(true);
  // Only initialize WebRTC if not already initialized
  if (!webrtcInitializedRef.current) {
    setShouldInitializeWebRTC(true);
  }
  toast({
    title: 'Admitted to Call',
    description: 'The doctor has admitted you to the consultation.',
    duration: 3000,
  });
}
```

## Why This Works
- `webrtcInitializedRef.current` is set to `true` after WebRTC initializes (line 421)
- Patient initializes WebRTC when admitted (if not already done)
- Prevents duplicate WebRTC initialization
- Doctor's existing connection handles both participants' streams
- No signal conflicts

## Testing
1. Doctor joins consultation → WebRTC initializes (initiator=true)
2. Patient joins waiting room → No WebRTC yet
3. Doctor admits patient → Patient initializes WebRTC (initiator=false)
4. Both connect to same peer connection
5. Status changes to "Connected" ✅

## Alternative: Patient Pre-initializes
If you want patient to initialize WebRTC while waiting (for faster connection):

```typescript
// In initial session setup, for patient:
if (participantRole === 'patient') {
  console.log('[Lobby] Patient sending join_lobby signal');
  await supabase.from('webrtc_signals').insert({
    session_id: session.id,
    sender_id: user.id,
    signal_data: { type: 'join_lobby', role: 'patient' }
  });
  // Pre-initialize WebRTC while waiting
  setShouldInitializeWebRTC(true);
}
```

Then in admission handler, don't set it again:
```typescript
if (signal.signal_data?.type === 'admit_patient' && participantRole === 'patient') {
  setIsAdmitted(true);
  setIsCallStarted(true);
  // WebRTC already initialized while waiting
}
```

This approach:
- ✅ Faster connection when admitted
- ✅ Patient can see their own video while waiting
- ✅ No duplicate initialization
