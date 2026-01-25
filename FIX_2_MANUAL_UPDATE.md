# Manual Fix Required - WebRTC Connection Timeout

## Status
- ✅ Fix 1 Applied: False patient waiting detection
- ⏳ Fix 2 Pending: Connection timeout logic

## Fix 2 Details

### File
`src/services/webrtcService.ts`

### Location
Around line 175 in the `initializePeer` method

### Current Code
```typescript
this.connectionTimeoutId = setTimeout(() => {
  if (this.peerConnection && this.peerConnection.connectionState === 'connecting' && this.iceRestartCount < this.maxIceRestarts) {
    console.warn('⚠️ Connection timeout - restarting ICE (attempt', this.iceRestartCount + 1, ')');
    this.iceRestartCount++;
    this.peerConnection.restartIce?.();
  }
}, 20000);
```

### Updated Code
```typescript
this.connectionTimeoutId = setTimeout(() => {
  if (this.peerConnection && 
      this.peerConnection.connectionState === 'connecting' &&
      this.peerConnection.iceConnectionState === 'failed' &&
      this.iceRestartCount < this.maxIceRestarts) {
    console.warn('⚠️ Connection timeout - restarting ICE (attempt', this.iceRestartCount + 1, ')');
    this.iceRestartCount++;
    this.peerConnection.restartIce?.();
  }
}, 20000);
```

### What Changed
Added one line:
```typescript
this.peerConnection.iceConnectionState === 'failed' &&
```

### Why This Fixes It
- **Before**: Restarts ICE after 20 seconds if connection is "connecting" (even during normal negotiation)
- **After**: Only restarts ICE if connection is "connecting" AND ICE actually failed
- **Result**: Allows normal connection establishment without premature restarts

### Testing After Fix
1. Doctor admits patient
2. Both should reach "connected" within 20-30 seconds
3. No "Connection timeout" messages in console (unless ICE actually fails)
4. Video/audio works properly

### Rollback
If issues occur, simply remove the added condition to revert to previous behavior.
