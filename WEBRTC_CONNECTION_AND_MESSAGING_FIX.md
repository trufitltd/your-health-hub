# WebRTC Connection & Messaging Fix

## Problem Summary
Both participants were stuck in "connecting" status and chat messages weren't syncing between sessions because:
1. **Message subscriptions were being unsubscribed prematurely** while WebRTC was still negotiating
2. **Connection timeout was too aggressive** (15 seconds), triggering ICE restart without proper state management
3. **Subscription lifecycle wasn't properly managed** - subscriptions closed during component re-renders

## Root Cause Analysis

### Issue 1: Premature Subscription Cleanup
**Symptom**: Console logs showed repeated `Unsubscribing from messages` while connection was in "connecting" state

**Root Cause**: 
- `unsubscribeRef.current` was being called in cleanup effects
- Message subscription was tied to component lifecycle instead of session lifecycle
- When component re-rendered or state changed, subscriptions were torn down

**Impact**:
- Messages sent during connection negotiation were lost
- Participants couldn't see messages from previous sessions until reconnecting
- Realtime updates stopped working mid-consultation

### Issue 2: Aggressive Connection Timeout
**Symptom**: ICE restart triggered at 15 seconds even when negotiation was still in progress

**Root Cause**:
- Single timeout without state tracking
- No limit on ICE restart attempts
- Timeout cleared on successful connection but not on failed attempts

**Impact**:
- Unnecessary ICE restarts disrupted ongoing negotiation
- Multiple restart attempts could cause connection to fail

### Issue 3: Subscription Lifecycle Mismatch
**Symptom**: Subscriptions closed while WebRTC was still connecting

**Root Cause**:
- Message subscription stored in `unsubscribeRef` which was called during cleanup
- No distinction between component cleanup and session cleanup
- Cleanup happened too early in the component lifecycle

## Solutions Implemented

### Fix 1: Separate Message Subscription Lifecycle
**File**: `src/components/consultation/ConsultationRoom.tsx`

**Changes**:
```typescript
// Added new ref for message subscription
const messageSubscriptionRef = useRef<(() => void) | null>(null);
const isCleaningUpRef = useRef(false);

// In initialization effect:
const unsubscribe = consultationService.subscribeToMessages(
  session.id,
  (dbMessage) => {
    if (isMounted && dbMessage.sender_id !== user?.id) {
      // Handle message
    }
  }
);

messageSubscriptionRef.current = unsubscribe;

// In cleanup (only during actual call end):
if (messageSubscriptionRef.current) {
  messageSubscriptionRef.current();
  messageSubscriptionRef.current = null;
}
```

**Impact**:
- Message subscriptions now persist for entire session
- Only unsubscribed when user explicitly ends call
- Messages continue to sync even during WebRTC negotiation

### Fix 2: Improved Connection Timeout Management
**File**: `src/services/webrtcService.ts`

**Changes**:
```typescript
// Added timeout tracking
private connectionTimeoutId: NodeJS.Timeout | null = null;
private iceRestartCount = 0;
private maxIceRestarts = 2;

// Increased timeout to 20 seconds with restart limit
this.connectionTimeoutId = setTimeout(() => {
  if (this.peerConnection && 
      this.peerConnection.connectionState === 'connecting' && 
      this.iceRestartCount < this.maxIceRestarts) {
    console.warn('Connection timeout - restarting ICE (attempt', this.iceRestartCount + 1, ')');
    this.iceRestartCount++;
    this.peerConnection.restartIce?.();
  }
}, 20000);

// Clear timeout on successful connection
if (state === 'connected') {
  if (this.connectionTimeoutId) {
    clearTimeout(this.connectionTimeoutId);
    this.connectionTimeoutId = null;
  }
}
```

**Impact**:
- Longer timeout allows proper WebRTC negotiation
- Limited to 2 ICE restart attempts
- Timeout cleared immediately on successful connection
- Prevents unnecessary restart loops

### Fix 3: Proper Cleanup in destroy()
**File**: `src/services/webrtcService.ts`

**Changes**:
```typescript
destroy() {
  console.log('Destroying WebRTC service');
  this.isDestroyed = true;
  this.stopPolling();
  
  // Clear connection timeout
  if (this.connectionTimeoutId) {
    clearTimeout(this.connectionTimeoutId);
    this.connectionTimeoutId = null;
  }
  
  // ... rest of cleanup
}
```

**Impact**:
- Prevents timeout callbacks from firing after destruction
- Ensures clean shutdown of WebRTC service

## Testing Checklist

### Connection Tests
- [ ] Doctor joins consultation room
- [ ] Patient joins waiting room
- [ ] Doctor admits patient
- [ ] Both participants transition to "connected" status within 20 seconds
- [ ] Connection status badge shows green "Connected"
- [ ] Call timer starts counting

### Messaging Tests
- [ ] Send message while in "connecting" state
- [ ] Message appears immediately for sender
- [ ] Message appears for receiver within 2 seconds
- [ ] Send multiple messages rapidly
- [ ] All messages persist after reconnection
- [ ] Messages from previous session visible on reconnect

### Edge Cases
- [ ] Doctor ends call while patient connecting
- [ ] Patient leaves waiting room
- [ ] Network interruption during call
- [ ] Multiple rapid admit/disconnect cycles
- [ ] Chat messages during ICE restart

## Performance Impact
- **Timeout**: Increased from 15s to 20s (acceptable for WebRTC negotiation)
- **Memory**: Minimal - only added 3 refs and 2 numbers
- **CPU**: No change - same polling and subscription mechanisms
- **Network**: No change - same signal exchange

## Deployment Notes
1. Clear browser cache to ensure new service worker loads
2. Test with both video and audio consultation types
3. Monitor console for any timeout warnings
4. Verify message persistence across sessions

## Future Improvements
1. Add exponential backoff for ICE restart attempts
2. Implement connection quality monitoring
3. Add automatic fallback to audio if video fails
4. Implement message retry logic for failed sends
5. Add connection state analytics
