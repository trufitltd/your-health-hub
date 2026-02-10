# Presence System Implementation

## Overview
Implemented real-time presence tracking for both doctors and patients using Supabase Realtime Presence channels.

## Features Implemented

### 1. Doctor Presence Broadcasting
- **Location**: DoctorPortal component
- **Channel**: `doctors-presence`
- **Status Types**: `online`, `away`, `offline`
- **Auto-detection**: Tracks user activity (mouse, keyboard, clicks)
- **Away Timer**: Sets status to "away" after 5 minutes of inactivity

### 2. Patient Presence Broadcasting
- **Location**: PatientPortal, ConsultationRoom
- **Channel**: `patients-presence`
- **Status Types**: `online`, `away`, `offline`
- **Auto-detection**: Same activity tracking as doctors

### 3. Presence Display Locations

#### Doctor Portal
- **Requests Tab**: Shows patient online status on appointment requests
- **Schedule Tab**: Shows patient presence on confirmed appointments
- **Patients List**: Shows real-time patient online status
- **Overview Dashboard**: Shows presence on upcoming schedule preview

#### Consultation Room
- Both doctors and patients broadcast their presence during consultations
- Presence is tracked for the duration of the consultation session

## Implementation Details

### Hooks Created

1. **usePatientPresence.ts**
   - Subscribes to `patients-presence` channel
   - Returns a map of patient IDs to their presence status
   - Auto-syncs when patients join/leave

2. **useTrackUserPresence.ts**
   - Universal hook for tracking presence (works for both doctors and patients)
   - Automatically selects correct channel based on user role
   - Handles activity detection and away status

3. **useDoctorPresence.ts** (existing)
   - Subscribes to `doctors-presence` channel
   - Returns a map of doctor IDs to their presence status

### UI Components

#### Presence Indicator
```tsx
const getPresenceIndicator = (userId: string) => {
  const status = presenceMap[userId] || 'offline';
  const colors = {
    online: 'bg-green-500',    // Green dot
    away: 'bg-yellow-500',     // Yellow dot
    offline: 'bg-gray-400'     // Gray dot
  };
  return <span className={`w-2 h-2 rounded-full ${colors[status]}`} title={status} />;
};
```

#### Avatar with Presence
- Small colored dot positioned at bottom-right of avatar
- Green = Online (active in last 5 minutes)
- Yellow = Away (inactive for 5+ minutes but still connected)
- Gray = Offline (not connected)

## Benefits

1. **Zero Database Load**: Uses Supabase Realtime Presence (in-memory)
2. **Real-time Updates**: Instant presence changes across all clients
3. **Automatic Cleanup**: Presence automatically removed when user disconnects
4. **Activity Detection**: Smart away detection based on user activity
5. **Scalable**: No database writes for presence updates

## Usage

### For Doctors
```tsx
import { useTrackUserPresence } from '@/hooks/useTrackUserPresence';
import { usePatientPresence } from '@/hooks/usePatientPresence';

function DoctorPortal() {
  const { user, role } = useAuth();
  
  // Track own presence
  useTrackUserPresence(user?.id, role);
  
  // Subscribe to patient presence
  const { presenceMap } = usePatientPresence();
  
  // Use presenceMap[patientId] to get status
}
```

### For Patients
```tsx
import { useTrackUserPresence } from '@/hooks/useTrackUserPresence';
import { useDoctorPresence } from '@/hooks/useDoctorPresence';

function PatientPortal() {
  const { user, role } = useAuth();
  
  // Track own presence
  useTrackUserPresence(user?.id, role);
  
  // Subscribe to doctor presence
  const { presenceMap } = useDoctorPresence();
  
  // Use presenceMap[doctorId] to get status
}
```

## Technical Notes

- Presence data is ephemeral and not stored in database
- Presence channels are separate for doctors and patients
- Activity detection uses debounced event listeners
- Automatic reconnection on network issues
- Clean unsubscribe on component unmount

## Future Enhancements

1. Add "In Consultation" status
2. Show last seen timestamp for offline users
3. Add presence notifications (e.g., "Patient is now online")
4. Typing indicators in chat
5. Custom status messages
