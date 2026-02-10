# Doctor Online Presence Implementation

## Overview
Implemented real-time doctor presence tracking using **Supabase Realtime Presence** instead of database storage to reduce database load.

## Benefits
- ✅ Zero database writes for presence updates
- ✅ Real-time updates across all clients
- ✅ Automatic cleanup when users disconnect
- ✅ In-memory storage (no database overhead)
- ✅ Built-in conflict resolution

## Implementation

### 1. useDoctorPresence Hook (`src/hooks/useDoctorPresence.ts`)
- Subscribes to the `doctors-presence` channel
- Maintains a real-time map of doctor presence statuses
- Automatically syncs when doctors join/leave

### 2. useTrackPresence Hook (`src/hooks/useTrackPresence.ts`)
- Tracks doctor's own presence when logged in
- Auto-detects activity (mouse, keyboard, clicks)
- Sets status to 'away' after 5 minutes of inactivity
- Cleans up on logout/unmount

### 3. DoctorDiscovery Page Updates
- Uses `useDoctorPresence()` to get real-time presence data
- Merges presence with doctor data (no DB query needed)
- Shows online/away/offline status indicators

## Usage

### For Doctor Dashboard/Layout
```tsx
import { useTrackPresence } from '@/hooks/useTrackPresence';
import { useAuth } from '@/hooks/useAuth';

function DoctorLayout() {
  const { user, userRole } = useAuth();
  useTrackPresence(user?.id, userRole);
  
  // Rest of component...
}
```

### For Patient Views
```tsx
import { useDoctorPresence } from '@/hooks/useDoctorPresence';

function DoctorList() {
  const { presenceMap } = useDoctorPresence();
  
  // presenceMap[doctorId] gives 'online' | 'away' | 'offline'
}
```

## Database Changes Needed
Remove `online_status` column from `doctors` table (optional cleanup):
```sql
ALTER TABLE doctors DROP COLUMN IF EXISTS online_status;
```

## Supabase Configuration
Ensure Realtime is enabled in your Supabase project (it's enabled by default).

## Status Logic
- **Online**: Active within last 5 minutes
- **Away**: No activity for 5+ minutes but still connected
- **Offline**: Not connected to presence channel
