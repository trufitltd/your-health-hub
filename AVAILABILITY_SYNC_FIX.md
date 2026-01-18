# Doctor Availability Synchronization Fix

## Problem

When doctors set their availability in the doctor dashboard, the changes were not immediately reflected in the patient portal's booking interface. Patients would see outdated availability information even after a doctor toggled their schedule on/off.

## Root Causes

1. **Missing Cache Invalidation**: The doctor's schedule mutations (`toggleAvailability`, `upsertSchedule`, etc.) invalidated the doctor-specific schedules cache but NOT the global `available-slots` cache used by patients.

2. **No Real-time Subscriptions**: The `useAvailableSlots` hook was performing one-time queries without subscribing to real-time changes in the database.

3. **Stale Cache Policy**: The query had a 5-minute stale time, meaning patients could see outdated data for up to 5 minutes.

## Solution

### 1. Added Real-time Subscriptions (useAvailableSlots.ts)

- Added `useEffect` hook to subscribe to `doctor_schedules` table changes via Supabase real-time
- When ANY schedule changes, the `available-slots` cache is automatically invalidated
- Added real-time subscription to `doctors` table for doctor profile changes
- Added console logging to track when cache is invalidated

```typescript
// Subscribe to real-time changes to doctor_schedules
useEffect(() => {
  const subscription = supabase
    .channel(`schedules-${doctorId || 'all'}`)
    .on('postgres_changes', {...})
    .subscribe();
  return () => subscription.unsubscribe();
}, [queryClient, doctorId, daysAhead]);
```

### 2. Added Refetch Policies (useAvailableSlots.ts)

- `refetchInterval: 30000` - Refetch every 30 seconds as a fallback
- `refetchOnWindowFocus: true` - Refetch when patient returns to the browser tab
- These ensure patient data stays fresh even if real-time subscriptions fail

### 3. Fixed Cache Invalidation (useSchedules.ts)

Updated all schedule mutations to invalidate the `available-slots` cache:

- `toggleAvailability` mutation
- `upsertSchedule` mutation
- `deleteSchedule` mutation
- `createDefaultSchedule` mutation

```typescript
// Invalidate BOTH doctor's schedules AND patient's available slots
queryClient.invalidateQueries({ queryKey: ["schedules", doctorId] });
queryClient.invalidateQueries({ queryKey: ["schedules-formatted", doctorId] });
queryClient.invalidateQueries({ queryKey: ["available-slots"] }); // ← NEW
```

### 4. Improved Slot Filtering (SlotSelectionModal.tsx)

- Added clear comments about `is_available` filtering
- Ensured dates are only generated from schedules where doctor is available
- Time slots properly filtered to exclude unavailable days

## How It Works Now

### Doctor Makes Change

```
Doctor toggles Monday OFF
↓
toggleDayAvailability() executes
↓
Mutation onSuccess invalidates caches:
  - 'schedules' cache (doctor dashboard)
  - 'schedules-formatted' cache
  - 'available-slots' cache (patient portal)
↓
Patient's SlotSelectionModal refetches available slots
↓
Patient immediately sees Monday removed from available dates
```

### Fallback Mechanisms

1. **Real-time Subscription**: Instant updates when database changes
2. **30-second Refetch**: Catches updates if subscription fails
3. **Window Focus**: Refetch when patient returns to browser tab
4. **Manual Refetch**: Patient can refresh the page

## Testing Checklist

### Doctor Portal

- [ ] Login as doctor
- [ ] Go to Availability tab
- [ ] Toggle a day ON/OFF
- [ ] Verify success toast appears
- [ ] Check that day is now marked as available/unavailable

### Patient Portal (Same Browser)

- [ ] Open patient portal in another tab (without closing doctor portal)
- [ ] Click "Book Appointment"
- [ ] Verify toggled day appears/disappears from available dates
- [ ] Verify times for that day show/hide appropriately

### Patient Portal (Different Browser/Incognito)

- [ ] Open patient portal in new incognito window
- [ ] Click "Book Appointment"
- [ ] Verify you see the doctor with toggled availability
- [ ] Wait 30 seconds if needed for fallback refetch
- [ ] Confirm availability matches what doctor set

## Database Schema Notes

The `available_slots` view filters by:

```sql
WHERE ds.is_available = true AND d.is_active = true
```

This means:

- Only schedules with `is_available = true` appear
- Only active doctors appear
- When `is_available = false`, that schedule row is excluded from the view entirely

## Architecture

```
Doctor Updates Schedule
    ↓
useSchedules hook mutation success
    ↓
Invalidate 'available-slots' cache
    ↓
Real-time subscription triggers (immediate)
    ↓
useAvailableSlots refetches available_slots view
    ↓
SlotSelectionModal re-renders with updated data
    ↓
Patient sees current availability
```

## Performance Impact

- **Real-time subscriptions**: Minimal overhead, uses Supabase's built-in real-time pubsub
- **30-second refetch**: One HTTP request every 30 seconds per patient (very light)
- **Cache invalidation**: Immediate, no unnecessary refetches unless data changed

## Future Improvements

1. Could add WebSocket connection pooling if real-time subscriptions become expensive at scale
2. Could implement optimistic updates in the UI (show change immediately before server confirms)
3. Could add doctor availability notifications to patients (email/push when schedule changes)
