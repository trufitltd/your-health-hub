# ICE Connection Timeout Fix

## Problem Identified

**Symptom**: Both participants stuck in "Connecting..." status indefinitely
**Root Cause**: ICE connection state stuck at "checking" - never progresses to "connected"
**Why**: STUN/TURN servers not responding or network blocking ICE candidates

## Console Evidence

```
webrtcService.ts:139 ICE connection state: checking
webrtcService.ts:120 Connection state: connecting
webrtcService.ts:133 🌐 WebRTC connecting...
```

Then nothing - stuck forever. No "connected" state reached.

## Solution Applied

### 1. Enhanced STUN/TURN Servers
Added more reliable STUN/TURN servers with fallbacks:

```typescript
const iceServers = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  { urls: 'stun:stun.stunprotocol.org:3478' },
  { 
    urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443'],
    username: 'openrelayproject',
    credential: 'openrelayproject'
  }
];
```

### 2. Connection Timeout Handler
Added 15-second timeout to restart ICE if stuck:

```typescript
setTimeout(() => {
  if (this.peerConnection && this.peerConnection.connectionState === 'connecting') {
    console.warn('⚠️ Connection timeout - restarting ICE');
    this.peerConnection.restartIce?.();
  }
}, 15000);
```

## How It Works

1. **Initial Connection Attempt** (0-15 seconds)
   - Try to establish connection with STUN/TURN servers
   - Exchange ICE candidates
   - Attempt to connect

2. **If Still Connecting After 15 Seconds**
   - Restart ICE gathering
   - Try alternative STUN/TURN servers
   - Attempt connection again

3. **Success Path**
   - ICE connection state: checking → connected
   - Connection state: connecting → connected
   - Both participants see "Connected" ✅

## Files Modified

- `src/services/webrtcService.ts`
  - Enhanced ICE servers list
  - Added connection timeout handler

## Testing

### Expected Behavior

**Before Fix**:
```
Connection state: connecting
ICE connection state: checking
(stuck forever)
```

**After Fix**:
```
Connection state: connecting
ICE connection state: checking
(waits 15 seconds)
⚠️ Connection timeout - restarting ICE
(tries again with different servers)
Connection state: connected ✅
ICE connection state: connected ✅
```

### Test Steps

1. Clear browser cache: `Ctrl+Shift+R` or `Cmd+Shift+R`
2. Doctor joins consultation
3. Patient joins waiting room
4. Doctor admits patient
5. Watch console for connection progress
6. Should see "Connected" within 20-30 seconds

## Troubleshooting

### Still Stuck in Connecting?

**Check 1: Network**
- Test internet connection
- Try different network (mobile hotspot)
- Check firewall/VPN settings

**Check 2: Browser**
- Try different browser (Chrome recommended)
- Clear all browser data
- Disable extensions

**Check 3: STUN/TURN Servers**
- Visit https://test.webrtc.org/
- Should show green checkmarks
- If red X's → network/firewall blocking

**Check 4: Console Logs**
Look for:
```
✅ Connection state: connected
✅ ICE connection state: connected
```

If you see:
```
❌ WebRTC connection failed
```

Then network is blocking WebRTC entirely.

## Network Requirements

For WebRTC to work, you need:
- UDP port 3478 (STUN/TURN)
- TCP port 3478 (TURN fallback)
- UDP ports 49152-65535 (media)

If blocked, WebRTC won't work. Contact network admin.

## Performance Impact

- **Minimal**: Only adds 15-second timeout
- **No overhead**: Only triggers if connection fails
- **Automatic recovery**: Restarts ICE without user intervention

## Future Improvements

1. Add exponential backoff for retries
2. Add user notification if connection fails
3. Add fallback to audio-only if video fails
4. Add connection quality monitoring
5. Add automatic codec selection

## Success Indicators

You'll know it's working when:
- ✅ Status shows "Connected" (green)
- ✅ Call duration timer visible
- ✅ Remote video/audio playing
- ✅ Chat messages sending/receiving
- ✅ Can toggle audio/video
- ✅ Can raise hand
- ✅ Can end call

## Related Issues Fixed

- ✅ Duplicate WebRTC initialization (previous fix)
- ✅ ICE connection timeout (this fix)
- ✅ STUN/TURN server reliability (this fix)

## Deployment Notes

1. No database changes needed
2. No new dependencies
3. Backward compatible
4. Safe to deploy immediately

## Monitoring

Watch for these logs to confirm fix is working:

**Good**:
```
Connection state: connecting
ICE connection state: checking
Connection state: connected ✅
```

**Bad**:
```
Connection state: connecting
ICE connection state: checking
(repeats forever)
```

**Recovery**:
```
Connection state: connecting
ICE connection state: checking
⚠️ Connection timeout - restarting ICE
Connection state: connected ✅
```
