# Remote Video Stream Fixes

## Issues Identified and Fixed

### 1. **Video Element Visibility**
**Problem**: The video element was hidden when no remote stream, but this caused display issues even when the stream was present.
**Fix**: Changed from Tailwind classes to inline styles for more reliable display control using `display: hasRemoteStream ? 'block' : 'none'`

### 2. **Video Autoplay Not Working**
**Problem**: The video element had `autoPlay` but no explicit play() call on the stream callback, which can fail in some browsers.
**Fix**: Added explicit `remoteVideoRef.current.play()` call with error handling in the stream callback.

### 3. **Media Constraints**
**Problem**: Video constraints were set to boolean `true`, which uses browser defaults and may not be optimal.
**Fix**: Changed to explicit video constraints:
```typescript
video: consultationType === 'video' ? {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  facingMode: 'user'
} : false,
```

### 4. **Stream Callback Multiple Calls**
**Problem**: `ontrack` event fires separately for audio and video tracks, causing multiple stream callback invocations.
**Fix**: Now logs both audio and video availability to help diagnose when each track arrives, and always calls the callback when tracks are added (this is correct behavior).

### 5. **Video Element Attributes**
**Problem**: Mixed Tailwind classes with potential specificity issues.
**Fix**: Added:
- `key="remote-video"` to force React remounting if needed
- Inline styles for display and sizing
- `controls={false}` to prevent browser controls
- Improved event handlers (onCanPlay, onStalled) for better diagnostics

## Implementation Details

### Stream Flow
1. **Patient joins** → Sends `join_lobby` signal
2. **Doctor admits** → Sends `admit` signal
3. **Patient initializes media** → `getUserMedia()` gets local stream
4. **Doctor initializes media** → `getUserMedia()` gets local stream
5. **WebRTC peers exchange offers/answers**
6. **ICE candidates exchanged**
7. **Remote ontrack events fire** → Audio track received → Callback with audio stream
8. **Remote ontrack events fire** → Video track received → Callback with stream containing both tracks
9. **Video element displays** → `hasRemoteStream` becomes true → Display changes from fallback avatar to video

### Browser Compatibility
- All modern browsers support MediaStream API
- `play()` method may require user interaction in strict security modes (handled with .catch())
- Video constraints use "ideal" values which the browser will try to match

## Debugging Checklist

If remote video still isn't showing:

1. **Check browser console for logs**:
   - `[WebRTC] 🎥 Received remote track: video` - Confirms track received
   - `[WebRTC] 🎥 Calling onStream callback with remote stream` - Stream callback fired
   - `[RemoteVideo] Video playing` - Video element started playing

2. **Check network**:
   - Are WebRTC signals (offer/answer/ICE) being exchanged?
   - Check Supabase webrtc_signals table in real-time

3. **Check permissions**:
   - Are camera/microphone permissions granted on both ends?
   - Check browser permission dialog

4. **Check connectivity**:
   - Are both participants on the same network or can they reach each other?
   - Check if STUN/TURN servers are working (see WebRTC diagnostics)

## Testing

Test scenarios:
1. **Same browser, different tabs** - Both should see video
2. **Same network, different devices** - Both should see video
3. **Different networks** - Should work with STUN/TURN relays
4. **Mobile browser** - Should show responsive video player
5. **Audio-only call** - Should show avatar fallback

## Stream State Machine

```
idle
  ↓
admitting (patient waiting)
  ↓
admitted (patient can initialize media)
  ↓
initializing media (getUserMedia)
  ↓
media ready (local stream available)
  ↓
webrtc signaling (offer/answer/ICE)
  ↓
connecting (peers establishing connection)
  ↓
ontrack events firing (audio then video)
  ↓
remoteStream updated (callback fires)
  ↓
hasRemoteStream = true
  ↓
video displays (hides fallback avatar)
  ↓
connected (ICE connection established)
```
