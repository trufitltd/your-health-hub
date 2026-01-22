# WebRTC Remote Video Streaming Fix

## Problem

Remote video was not streaming between doctor and patient in video calls. Both participants could connect but the remote video element remained empty.

## Root Causes Identified and Fixed

### 1. **Improper Remote Stream Handling**

**Issue**: The `ontrack` callback was directly passing `event.streams[0]` which could be empty or undefined.

**Fix**: Created a dedicated `remoteStream` MediaStream object that properly collects all incoming tracks:

```typescript
const remoteStream = new MediaStream();

this.peerConnection.ontrack = (event) => {
  if (!remoteStream.getTracks().some((t) => t.id === event.track.id)) {
    remoteStream.addTrack(event.track);
  }
  if (this.onStreamCallback && remoteStream.getTracks().length > 0) {
    this.onStreamCallback(remoteStream);
  }
};
```

### 2. **Signaling State Validation Issues**

**Issue**: The offer handler was checking for `signalingState === 'stable'` but WebRTC connections don't necessarily start in stable state after initialization.

**Fix**: Removed unnecessary state checks for offer handling and added proper RTCSessionDescription wrapping:

```typescript
if (signalData.type === "offer") {
  await this.peerConnection.setRemoteDescription(
    new RTCSessionDescription(signalData.offer),
  );
  const answer = await this.peerConnection.createAnswer();
  await this.peerConnection.setLocalDescription(answer);
  await this.sendSignal({ type: "answer", answer });
}
```

### 3. **ICE Candidate Wrapping**

**Issue**: ICE candidates weren't being wrapped in `RTCIceCandidate` objects.

**Fix**: Properly wrap candidates:

```typescript
await this.peerConnection.addIceCandidate(
  new RTCIceCandidate(signalData.candidate),
);
```

### 4. **Video Playback Not Triggered**

**Issue**: The remote video element had `autoPlay` but wasn't actively calling `.play()` with proper error handling.

**Fix**: Explicitly call play() with retry logic:

```typescript
remoteVideoRef.current.play().catch((e) => {
  console.warn("Remote video autoplay failed:", e);
  setTimeout(() => {
    remoteVideoRef.current
      ?.play()
      .catch((err) => console.error("Retry play failed:", err));
  }, 500);
});
```

### 5. **Video Element Configuration**

**Issue**: Missing background styling and incomplete video element attributes.

**Fix**: Added `backgroundColor: '#000'` to prevent white flash while streaming loads.

## Files Modified

1. **`src/services/webrtcService.ts`**
   - Enhanced `initializePeer()` to create proper remote stream
   - Fixed `handleSignal()` to properly wrap RTCSessionDescription and RTCIceCandidate
   - Improved logging for debugging

2. **`src/components/consultation/ConsultationRoom.tsx`**
   - Enhanced remote stream callback with explicit track logging
   - Added retry logic for video playback
   - Improved video element styling

## Testing Checklist

- [ ] Test video call between doctor and patient
- [ ] Verify both local and remote video streams appear
- [ ] Check browser console for proper signaling logs
- [ ] Test on different browsers (Chrome, Firefox, Safari)
- [ ] Test with different network conditions (use throttling)
- [ ] Verify audio works alongside video
- [ ] Test video enable/disable toggle

## Expected Behavior

1. Doctor initiates call (creates offer)
2. Patient receives offer and sends answer
3. Both parties exchange ICE candidates
4. Remote video stream appears within 2-5 seconds
5. Both participants can see each other's video feeds

## Debugging Tips

If issues persist:

1. Check browser console for WebRTC errors
2. Verify microphone/camera permissions are granted
3. Check STUN server connectivity (`stun:stun.l.google.com:19302`)
4. Ensure both participants are in the same consultation session
5. Check database: verify `webrtc_signals` table exists and has records
6. Monitor network tab for signaling message delivery

## Performance Considerations

- Remote stream callback now only fires when tracks are available
- ICE candidate throttling via polling mechanism (3-second intervals)
- Proper cleanup on session destroy to prevent memory leaks
