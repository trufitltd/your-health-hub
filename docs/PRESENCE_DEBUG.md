# Presence System Debugging Guide

## Confirmed: NO Database Queries
✅ The presence system uses **Supabase Realtime Presence** only (in-memory)
✅ No database reads or writes for online status
✅ All presence data is ephemeral and real-time

## How to Test Presence

### 1. Open Browser Console
Press F12 or right-click → Inspect → Console tab

### 2. Look for These Log Messages

#### When Doctor Logs In:
```
[Presence] doctor tracking started for user: <doctor-user-id>
```

#### When Patient Views Doctor Discovery:
```
[Doctor Presence] Updated presence map: { <doctor-user-id>: 'online' }
[DoctorDiscovery] Current presence map: { ... }
[DoctorDiscovery] Doctor <name> (<user-id>): online
```

### 3. Expected Behavior

#### Doctor Side:
- When doctor logs into DoctorPortal, presence tracking starts automatically
- Doctor broadcasts to `doctors-presence` channel
- Status: `online` → `away` (after 5 min inactivity) → `offline` (on disconnect)

#### Patient Side:
- When patient views DoctorDiscovery page, subscribes to `doctors-presence` channel
- Receives real-time updates when doctors join/leave
- Green dot = online, Yellow dot = away, Gray dot = offline

### 4. Common Issues & Fixes

#### Issue: Doctor shows offline even when online
**Possible Causes:**
1. Doctor not logged in to DoctorPortal
2. Presence tracking not initialized in Layout
3. User ID mismatch between tracking and display

**Debug Steps:**
1. Check console for: `[Presence] doctor tracking started`
2. Verify user ID in tracking matches doctor's user_id in database
3. Check presence map in console logs

#### Issue: Presence not updating in real-time
**Possible Causes:**
1. Supabase Realtime not enabled
2. Network issues
3. Channel subscription failed

**Debug Steps:**
1. Check Supabase project settings → Realtime is enabled
2. Check console for subscription errors
3. Verify channel names match: `doctors-presence` and `patients-presence`

### 5. Manual Test Steps

1. **Open two browser windows:**
   - Window 1: Doctor logged in to DoctorPortal
   - Window 2: Patient viewing DoctorDiscovery

2. **In Window 1 (Doctor):**
   - Open console
   - Look for: `[Presence] doctor tracking started for user: <id>`
   - Note the user ID

3. **In Window 2 (Patient):**
   - Open console
   - Look for: `[Doctor Presence] Updated presence map`
   - Verify the doctor's user ID appears in the map with status 'online'
   - Check the doctor card shows a green dot

4. **Test Away Status:**
   - In Window 1, don't move mouse for 5 minutes
   - In Window 2, doctor should show yellow dot (away)

5. **Test Offline Status:**
   - Close Window 1 (doctor logs out)
   - In Window 2, doctor should show gray dot (offline) within a few seconds

## Architecture

```
┌─────────────────┐
│  Doctor Portal  │
│   (broadcasts)  │
└────────┬────────┘
         │
         ├─> doctors-presence channel (Supabase Realtime)
         │
┌────────▼────────┐
│ Patient Portal  │
│  (subscribes)   │
└─────────────────┘
```

## Key Files

1. **Tracking (Broadcasting):**
   - `/src/components/layout/Layout.tsx` - Tracks all authenticated users
   - `/src/hooks/useTrackUserPresence.ts` - Universal tracking hook

2. **Subscribing (Receiving):**
   - `/src/hooks/useDoctorPresence.ts` - Subscribe to doctor presence
   - `/src/hooks/usePatientPresence.ts` - Subscribe to patient presence

3. **Display:**
   - `/src/pages/DoctorDiscovery.tsx` - Shows doctor online status
   - `/src/pages/DoctorPortal.tsx` - Shows patient online status

## Troubleshooting Commands

### Check if Realtime is working:
```javascript
// In browser console
const channel = supabase.channel('test-channel');
channel.subscribe((status) => {
  console.log('Channel status:', status);
});
```

### Manually track presence:
```javascript
// In browser console
const channel = supabase.channel('doctors-presence');
channel.subscribe(async (status) => {
  if (status === 'SUBSCRIBED') {
    await channel.track({ 
      user_id: 'test-user-id', 
      status: 'online',
      online_at: new Date().toISOString()
    });
    console.log('Tracking started');
  }
});
```

### View presence state:
```javascript
// In browser console
const channel = supabase.channel('doctors-presence');
channel.subscribe(() => {
  const state = channel.presenceState();
  console.log('Current presence:', state);
});
```
