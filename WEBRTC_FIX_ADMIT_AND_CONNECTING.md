# WebRTC Consultation Fix: Admit Button & Stuck Connection

## Problem
When a patient joins a call, the doctor is alerted but cannot admit them because:
1. **The admit button doesn't appear** for the doctor even though they should see the patient waiting
2. **Both participants get stuck in "connecting" state** and can't proceed to an active call

## Root Causes

### Issue 1: Doctor Doesn't See Admit Button
The `isPatientWaiting` state was only set when the doctor *received* a real-time signal from the patient joining the lobby. However:
- If the doctor joins the consultation room *after* the patient has already sent the join_lobby signal, the doctor misses it
- The doctor never queries for *existing* patient waiting signals
- Result: Doctor sees "Waiting for participants..." even though patient is already there

### Issue 2: Stuck in "Connecting" State  
The connection state management only triggered the `onConnectedCallback` when `connectionState === 'connected'`. However:
- Many real-world network scenarios (firewalls, NAT, restricted networks) get stuck at `connecting` or `checking` states
- Even with media flowing, the ICE connection state may never reach "connected"
- The fallback check existed but wasn't triggered aggressively enough
- Result: Both participants see "Connecting..." indefinitely even though media is actually exchanging

## Solutions Implemented

### Fix 1: Query Existing Patient Signals on Doctor Join
**File**: [src/components/consultation/ConsultationRoom.tsx](src/components/consultation/ConsultationRoom.tsx#L105-L120)

When the doctor joins the consultation:
```typescript
if (participantRole === 'doctor') {
  setIsAdmitted(true);
  // Doctor should check if patient is already waiting
  const { data: existingSignals } = await supabase
    .from('webrtc_signals')
    .select('*')
    .eq('session_id', session.id)
    .eq('sender_id', appointmentData?.patient_id || '')
    .limit(1);
  
  if (existingSignals && existingSignals.length > 0) {
    const joinLobbySignal = existingSignals.find((sig: any) => sig.signal_data?.type === 'join_lobby');
    if (joinLobbySignal) {
      console.log('[Lobby] Found existing patient waiting signal');
      setIsPatientWaiting(true);
      toast({
        title: 'Patient Waiting',
        description: `${participantName} is waiting in the lobby.`,
      });
    }
  }
}
```

**Why this works:**
- Doctor immediately queries for any existing `join_lobby` signals from the patient
- If found, sets `isPatientWaiting = true` immediately
- The admit button will now appear without waiting for real-time updates
- Real-time subscriptions still work for newly arriving patients

### Fix 2: Trigger Fallback Connection Check Faster
**File**: [src/services/webrtcService.ts](src/services/webrtcService.ts#L125-L143)

Added aggressive checking for stuck connections:
```typescript
} else if (state === 'connecting' || (state as string) === 'checking') {
  // Try fallback check if stuck in connecting/checking for more than 3 seconds
  setTimeout(() => {
    if (this.peerConnection?.connectionState === 'connecting' || 
        (this.peerConnection?.connectionState as string) === 'checking') {
      console.log('[WebRTC] 🔄 Checking for media flow despite connection state...');
      this.checkFallbackConnection();
    }
  }, 3000);
}
```

**File**: [src/services/webrtcService.ts](src/services/webrtcService.ts#L221-L232)

Improved monitoring to trigger fallback checks earlier:
```typescript
// Try fallback check after 2 checks (10 seconds) without triggering callback yet
if (checksWithoutConnection === 2 && !fallbackCheckAttempted && !mediaFlowDetected) {
  fallbackCheckAttempted = true;
  console.log('[WebRTC] 📊 Attempting fallback connection check after 10 seconds stuck...');
  this.checkFallbackConnection();
}
```

**Why this works:**
- The existing `checkFallbackConnection()` method detects media flow and calls the connection callback
- By triggering it more aggressively (after 3 sec on state change + 10 sec on health check), connections that are actually working will transition to "connected" state faster
- Participants won't be stuck in "Connecting..." indefinitely
- The fallback check validates that SDP has been exchanged AND remote tracks are received

## How It Fixes the User Experience

### Before
1. Patient joins → sends `join_lobby` signal
2. Doctor joins consultation room
3. Doctor doesn't see admit button (missed the signal)
4. Patient sees "Waiting for admission" indefinitely
5. Doctor never admitted the patient

OR

1. Doctor clicks admit (even if no button)
2. Patient gets admitted and media initializes
3. Both see "Connecting..." indefinitely
4. Call appears broken even though media is flowing

### After
1. Patient joins → sends `join_lobby` signal
2. Doctor joins consultation room
3. **Doctor immediately sees "Admit Patient" button** (from queried signals)
4. Doctor clicks admit
5. Patient gets admitted and media initializes
6. Both participants see "Connecting..." briefly
7. **Connection automatically transitions to "Connected"** (via fallback check)
8. Video/audio works normally

## Testing

To verify the fixes are working:

1. **Test 1: Doctor joins after patient**
   - Have patient join consultation
   - Have doctor join 2-3 seconds later
   - Doctor should immediately see green "Admit Patient" button (animated pulse)
   - Click to admit
   - Both should transition to connected

2. **Test 2: Stuck connection detection**
   - Join a consultation with both roles
   - If stuck at "Connecting..." after 10+ seconds
   - Check browser console for "[WebRTC] 📊 Attempting fallback connection check..."
   - Connection should automatically transition to "Connected" if media is flowing
   - Video/audio should work

## Debug Logs

Watch for these console logs to verify fixes:
- `[Lobby] Found existing patient waiting signal` - Doctor queried and found waiting patient
- `[WebRTC] 🔄 Checking for media flow despite connection state...` - Fallback check triggered
- `✅ FALLBACK: Valid connection detected (SDP + remote tracks present)` - Media is working despite connection state
- `✅ Got both audio and video tracks - connection is working!` - Tracks received successfully

## Files Modified
1. [src/components/consultation/ConsultationRoom.tsx](src/components/consultation/ConsultationRoom.tsx) - Added doctor query for existing patient signals
2. [src/services/webrtcService.ts](src/services/webrtcService.ts) - Added aggressive fallback connection checks
