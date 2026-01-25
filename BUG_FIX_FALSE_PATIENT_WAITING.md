# Bug Fix: False Patient Waiting Notification

## Problem
The doctor was receiving false "patient waiting" notifications when joining a consultation call, even when no patient was actually waiting.

## Root Cause
The `checkExistingLobbySignals()` method in WebRTC service was checking for `join_lobby` signals from the session creation time (`sessionStartedAt`), which could include signals from previous consultation attempts or old signals that weren't properly cleaned up.

## Solution
Modified the WebRTC service to track when the doctor actually joins the call (`doctorJoinedAt`) and only check for `join_lobby` signals that occurred after that time.

### Changes Made:

1. **WebRTCService Constructor**: Added `doctorJoinedAt` timestamp that records when the doctor actually initializes the WebRTC service
2. **checkExistingLobbySignals()**: Changed the time filter from `sessionStartedAt` to `doctorJoinedAt`

### Code Changes:

```typescript
// Added doctorJoinedAt property
private doctorJoinedAt: Date;

constructor(sessionId: string, userId: string, isInitiator: boolean, sessionStartedAt?: Date) {
  this.sessionId = sessionId;
  this.userId = userId;
  this.isInitiator = isInitiator;
  this.sessionStartedAt = sessionStartedAt || new Date();
  this.doctorJoinedAt = new Date(); // When doctor actually joins the call
}

// Updated checkExistingLobbySignals to use doctorJoinedAt
async checkExistingLobbySignals() {
  const { data, error } = await supabase
    .from('webrtc_signals')
    .select('*')
    .eq('session_id', this.sessionId)
    .eq('signal_data->>type', 'join_lobby')
    .neq('sender_id', this.userId)
    .gte('created_at', this.doctorJoinedAt.toISOString()); // Changed from sessionStartedAt
}
```

## Expected Behavior
- Doctor joins consultation → WebRTC service initializes with current timestamp
- Only `join_lobby` signals created AFTER doctor joins will trigger patient waiting notification
- Old signals from previous sessions or attempts will be ignored
- Patient waiting notification will only appear when patient actually joins after doctor is ready

## Testing
To test this fix:
1. Doctor joins consultation first
2. Verify no false "patient waiting" notification appears
3. Patient joins consultation
4. Verify doctor receives correct "patient waiting" notification
5. Doctor admits patient
6. Verify consultation proceeds normally