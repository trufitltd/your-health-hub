# Debugging: Admit Patient Button Not Appearing

## Expected Flow

1. **Patient joins** → Sends `join_lobby` signal to database
2. **Doctor joins** → Queries existing `join_lobby` signals, shows "Patient Waiting" toast + admit button
3. **Doctor clicks "Admit"** → Sends `admit` signal
4. **Patient receives admit** → Gets admitted, initializes media

## Console Logs to Check

When testing, open browser DevTools (F12) and watch console. You should see:

### Patient Side (Should Appear First)
```
[Patient] Sending join_lobby signal. sessionId: xxx userId: yyy
[Patient] ✅ join_lobby signal sent successfully
```

### Doctor Side (Should Appear When Joining)
```
[Doctor] Doctor joined, looking for patient waiting signal. patientId: yyy
[Doctor] Query result - signals: 1 error: null
[Doctor] Found signals from patient: [{ type: 'join_lobby', created_at: '2026-01-21T...' }]
[Lobby] Found existing patient waiting signal
[Lobby RT] Channel subscription status: SUBSCRIBED
```

### If Button Still Doesn't Appear

1. **Check if query shows signals**:
   - If `[Doctor] Query result - signals: 0`, the signal wasn't inserted
   - Check `[Patient] ✅ join_lobby signal sent successfully` was logged

2. **Check real-time subscription**:
   - Should see `[Lobby RT] Channel subscription status: SUBSCRIBED`
   - If not subscribed, Supabase real-time might not be working

3. **Check signal data format**:
   - Should be: `{ type: 'join_lobby' }` (exact match)
   - If you see `[Lobby RT] Signal not matching conditions`, signal_data is wrong

## Debugging Steps

### Step 1: Verify Patient Sends Signal
- Open browser as patient
- Go to consultation
- Check console for: `[Patient] ✅ join_lobby signal sent successfully`
- If you see error instead, check database permissions on `webrtc_signals` table

### Step 2: Verify Doctor Queries Correctly
- Open browser as doctor (same appointment)
- Should see: `[Doctor] Doctor joined, looking for patient waiting signal`
- If `patientId: null`, appointment data isn't being fetched correctly

### Step 3: Verify Signal in Database
- Check Supabase dashboard → `webrtc_signals` table
- Should see rows with:
  - `session_id`: matches current session
  - `sender_id`: patient's user ID
  - `signal_data`: `{"type":"join_lobby"}`

### Step 4: Verify Button Element Exists
In browser DevTools Elements tab:
```html
<!-- Should see this when doctor has isPatientWaiting true -->
<button class="bg-green-600 hover:bg-green-700 text-white shadow-lg animate-pulse">
  Admit Patient
</button>
```

If not present, `isPatientWaiting` state is not being set to true

## Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Patient signal not sent | DB write error | Check `webrtc_signals` table permissions |
| Doctor doesn't query signals | `patientId` is null | Appointment data not fetched |
| Button appears but doesn't work | Admit signal not sending | Check WebRTC signals table for write errors |
| Real-time not working | Supabase connection | Check internet, Supabase status |
| Wrong `signal_data` | JSON format issue | Verify `{ type: 'join_lobby' }` format |

## Database Permissions Check

Make sure `webrtc_signals` table allows:
- INSERT: for sending signals (patients and doctors)
- SELECT: for querying existing signals (doctor)
- Realtime enabled: for real-time updates

In Supabase dashboard, check:
1. Table: `webrtc_signals`
2. RLS (Row Level Security): Should allow INSERT/SELECT for authenticated users
3. Realtime: Should be enabled on the table

## Testing Checklist

- [ ] Patient console shows `✅ join_lobby signal sent successfully`
- [ ] Doctor console shows `[Doctor] Found existing patient waiting signal`
- [ ] Toast appears on doctor's screen saying "Patient Waiting"
- [ ] Green "Admit Patient" button appears and is clickable
- [ ] Doctor clicks admit button
- [ ] Patient gets "Admitted" toast
- [ ] Patient initializes media (video/audio streams)
- [ ] Doctor sees remote video/hears remote audio

## Real-Time Debugging

If real-time updates aren't working, the lobby might still work via polling. Check:

```
[Lobby RT] Channel subscription status: SUBSCRIBED
```

If this shows `CLOSED` or error, real-time isn't connected but signals should still work on next query.

## Network Debugging

To verify Supabase connectivity:
- Open DevTools → Network tab
- Look for requests to Supabase API
- Should see POST to `/rest/v1/webrtc_signals` when patient joins
- Should see GET to query signals when doctor joins

## Still Not Working?

1. Check browser console for ANY error messages
2. Check Supabase logs in dashboard
3. Verify appointment ID is correct
4. Verify patient and doctor IDs are correct
5. Check internet connection (real-time needs websocket)
