# WebRTC Connection Troubleshooting Guide

## Quick Test

1. Open browser DevTools (F12)
2. Go to Console tab
3. Doctor joins → look for `[WebRTC] Initializing WebRTC for doctor`
4. Patient joins → look for `[Lobby] 🔔 Patient has joined the lobby`
5. Doctor admits → look for `[Lobby] 🎉 Doctor is admitting patient to call`
6. Both should show `[WebRTC] 🎉 Connection established via callback`

---

## If Still Stuck in "Connecting"

### Check 1: WebRTC Initialization
```
✅ Doctor: [WebRTC] Initializing WebRTC for doctor
✅ Patient: [WebRTC] Initializing WebRTC for patient
```

If patient shows "Initializing" twice → old code still running, clear cache:
- Hard refresh: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
- Or clear browser cache

### Check 2: Signal Exchange
Look for these in console:
```
✅ [WebRTC] Sending signal: ready
✅ [WebRTC] Sending signal: offer
✅ [WebRTC] Sending signal: answer
✅ [WebRTC] Sending signal: ice-candidate
```

If missing → signals not being sent, check database

### Check 3: Connection State
```
✅ Connection state: connecting
✅ Connection state: connected
```

If stuck on "connecting" → ICE candidates not connecting, check network

### Check 4: Remote Stream
```
✅ [WebRTC] Remote stream received, tracks: 2
```

If not appearing → peer connection not established

---

## Common Issues & Fixes

### Issue: "Cannot set answer - no local description"
**Cause**: Duplicate WebRTC initialization  
**Fix**: Already applied! Clear cache and reload

### Issue: "Connecting..." never changes to "Connected"
**Cause**: ICE connection failed  
**Fix**: 
- Check firewall/network
- Try different network (mobile hotspot)
- Check STUN server availability

### Issue: No video/audio
**Cause**: Media stream not attached  
**Fix**:
- Check browser permissions
- Reload page
- Try different browser

### Issue: Patient sees "Waiting Room" forever
**Cause**: Doctor didn't click "Admit to Call"  
**Fix**: Doctor should see "Patient Waiting" overlay with "Admit to Call" button

---

## Network Diagnostics

### Check STUN Servers
Open DevTools → Network tab → look for requests to:
- `stun.l.google.com:19302`
- `stun1.l.google.com:19302`
- `openrelay.metered.ca:80`

Should see successful responses (200 OK)

### Check WebRTC Stats
In DevTools Console:
```javascript
// Get connection state
console.log(pc.connectionState);  // Should be "connected"
console.log(pc.iceConnectionState);  // Should be "connected"
console.log(pc.signalingState);  // Should be "stable"
```

---

## Database Checks

### Verify Signals Are Being Saved
```sql
SELECT * FROM webrtc_signals 
WHERE session_id = 'YOUR_SESSION_ID'
ORDER BY created_at DESC
LIMIT 20;
```

Should see:
- `join_lobby` from patient
- `ready` from both
- `offer` from doctor
- `answer` from patient
- Multiple `ice-candidate` entries

### Verify Session Exists
```sql
SELECT * FROM consultation_sessions 
WHERE id = 'YOUR_SESSION_ID';
```

Should show:
- `status`: 'active'
- `patient_id`: patient UUID
- `doctor_id`: doctor UUID
- `consultation_type`: 'video'/'audio'/'chat'

---

## Browser Console Commands

### Check WebRTC Service State
```javascript
// In browser console while in consultation
window.webrtcService?.getConnectionState()
// Should return: "connected"
```

### Monitor Connection Changes
```javascript
// Add to console to watch state changes
setInterval(() => {
  console.log('Connection:', pc?.connectionState);
  console.log('ICE:', pc?.iceConnectionState);
}, 1000);
```

---

## Step-by-Step Debug

1. **Doctor joins**
   - [ ] See "Waiting for Patient"
   - [ ] Console shows `[WebRTC] Initializing WebRTC for doctor`
   - [ ] Console shows `[WebRTC] Initialization complete`

2. **Patient joins**
   - [ ] See "Waiting Room"
   - [ ] Doctor sees "Patient Waiting" overlay
   - [ ] Console shows `[Lobby] 🔔 Patient has joined the lobby`

3. **Doctor admits**
   - [ ] Click "Admit to Call" button
   - [ ] Patient sees "Admitted to Call" toast
   - [ ] Patient console shows `[WebRTC] Initializing WebRTC for patient`

4. **Connection establishes**
   - [ ] Both see "Connecting..." status
   - [ ] After 2-3 seconds, see "Connected"
   - [ ] Both show call duration timer
   - [ ] Video/audio visible

5. **Chat works**
   - [ ] Click chat button
   - [ ] Type message
   - [ ] Message appears on both sides

---

## If All Else Fails

### Nuclear Option: Full Reset
1. Close browser completely
2. Clear all browser data (cache, cookies, storage)
3. Restart browser
4. Go to consultation URL
5. Test again

### Check Browser Support
WebRTC requires:
- Chrome/Edge 25+
- Firefox 22+
- Safari 11+
- Not supported in IE

### Test WebRTC Connectivity
Visit: https://test.webrtc.org/
- Should show green checkmarks
- If red X's → network/firewall issue

---

## Logs to Share for Support

If you need help, collect:
1. Browser console output (copy all logs)
2. Network tab (webrtc_signals requests)
3. Your session ID
4. Doctor and patient user IDs
5. Timestamp of when issue occurred

---

## Performance Tips

- Close other tabs/apps
- Use wired connection if possible
- Disable VPN if having issues
- Use Chrome for best compatibility
- Check CPU/memory usage

---

## Success Indicators ✅

You'll know it's working when:
- [ ] Status shows "Connected" (green)
- [ ] Call duration timer visible
- [ ] Remote video/audio playing
- [ ] Chat messages sending/receiving
- [ ] Can toggle audio/video
- [ ] Can raise hand
- [ ] Can end call
