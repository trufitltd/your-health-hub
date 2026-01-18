# Doctor Schedule Management - Complete Implementation

## Overview

Fixed the doctor availability issue by implementing a complete real-time schedule management system. Doctors now automatically get a default schedule when signing up and can modify it in their portal.

## Problem Identified

When doctors signed up, they appeared in the `doctors` table but had **no schedules** in `doctor_schedules`. The patient portal queries doctors with available schedules, so doctors without schedules appeared as unavailable and didn't show up in the booking portal.

## Solution Implemented

### 1. **Schedule Service** (`src/services/scheduleService.ts`)

Complete API service for managing doctor schedules:

- `getDoctorSchedules(doctorId)` - Fetch all schedules for a doctor
- `getMySchedules(doctorId)` - Alias for the above
- `upsertSchedule(doctorId, schedule)` - Create or update schedule for a day
- `deleteSchedule(doctorId, dayOfWeek)` - Remove a day's schedule
- `toggleDayAvailability(doctorId, dayOfWeek, isAvailable)` - Enable/disable a day
- `getFormattedSchedule(doctorId)` - Get human-readable weekly schedule
- `createDefaultSchedule(doctorId)` - Auto-create Mon-Fri, 9 AM - 5 PM schedule
- `subscribeToScheduleChanges(doctorId, callback)` - Real-time subscription

**Features:**

- Validates time ranges (end time > start time)
- Handles conflicts with `ON CONFLICT` upserts
- Formats schedules by day with enabled/disabled status
- Real-time subscriptions via Supabase channels

### 2. **Schedule Hook** (`src/hooks/useSchedules.ts`)

Custom React hook for schedule state management:

```typescript
const {
  // Queries
  schedules, // Raw schedule data
  formattedSchedule, // Weekly schedule by day
  isLoading,
  error,

  // Mutations
  upsertSchedule, // Update a day's schedule
  deleteSchedule, // Remove a day
  toggleAvailability, // Enable/disable a day
  createDefaultSchedule,

  // Mutation states
  isUpdating,
  isDeleting,
  isToggling,
  isCreatingDefault,
} = useSchedules(doctorId);
```

**Key Features:**

- Uses React Query for efficient caching and refetching
- Auto-invalidates related queries on mutations
- Toast notifications for success/error feedback
- Typed schedule data

### 3. **Schedule Editor Component** (`src/components/ScheduleEditor.tsx`)

Interactive UI for managing weekly availability:

**Features:**

- Toggle days on/off with Switch component
- Edit start/end times in modal dialog
- Visual time slot badges
- "Create Default Schedule" button for empty schedules
- Real-time status updates
- Validation (end time > start time)
- Smooth animations on schedule updates

**Usage:**

```tsx
<ScheduleEditor doctorId={user.id} onScheduleUpdate={callback} />
```

### 4. **DoctorPortal Updates** (`src/pages/DoctorPortal.tsx`)

**Changes Made:**

- Removed dummy `weeklySchedule` data
- Imported `ScheduleEditor` component
- Replaced static availability tab with real component:

```tsx
<TabsContent value="availability" className="space-y-6">
  {user && user.id ? (
    <ScheduleEditor doctorId={user.id} />
  ) : (
    <Card>
      <CardContent className="pt-6">
        <p className="text-muted-foreground">
          Please sign in to manage your schedule.
        </p>
      </CardContent>
    </Card>
  )}
</TabsContent>
```

### 5. **Auth.tsx Updates** (`src/pages/Auth.tsx`)

**Changes Made:**

- Added import: `import { createDefaultSchedule } from '@/services/scheduleService'`
- Updated signup handler to automatically create default schedule for doctors:

```typescript
if (role === "doctor" && data.user?.id) {
  try {
    await createDefaultSchedule(data.user.id);
    toast({
      title: "Account created",
      description: "Default schedule created. Check your email...",
    });
  } catch (scheduleErr) {
    // Don't fail signup if schedule creation fails
    console.error("Error creating default schedule:", scheduleErr);
  }
}
```

## How It Works - Doctor Flow

### 1. **Doctor Signs Up**

- Fills registration form with name, email, password
- Selects "Doctor" role
- Submits form
- Trigger fires: `handle_new_doctor_signup()` creates doctor profile in `doctors` table
- Code creates default schedule (Mon-Fri, 9 AM - 5 PM)
- Doctor appears in patient portal immediately

### 2. **Doctor Views Dashboard**

- Navigates to DoctorPortal
- Clicks "Availability" tab
- ScheduleEditor loads doctor's schedules from database
- Shows weekly schedule with current settings

### 3. **Doctor Modifies Schedule**

- Toggles day on/off with Switch
- Clicks "Edit" to change times
- Modal opens with time pickers
- Updates saved to database in real-time
- Toast confirms success

### 4. **Patient Books Appointment**

- Queries `doctors` table with `is_active = true`
- Doctor appears in list because they have is_active flag
- Query includes related `doctor_schedules` through relationships
- Patient selects available time slots
- Appointment created with doctor_id FK

## Database Schema

### doctors table

```sql
id UUID PRIMARY KEY (FK to auth.users)
name TEXT NOT NULL
specialty TEXT
email TEXT UNIQUE
phone TEXT
bio TEXT
avatar_url TEXT
is_active BOOLEAN (auto-sync from auth)
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ (auto on trigger)
```

### doctor_schedules table

```sql
id UUID PRIMARY KEY
doctor_id UUID FK → doctors(id)
day_of_week INT (0=Sunday, 6=Saturday)
start_time TIME
end_time TIME
slot_duration_minutes INT (default 30)
max_patients_per_slot INT (default 1)
is_available BOOLEAN (default true)
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
UNIQUE(doctor_id, day_of_week, start_time, end_time)
```

## RLS Policies

### Doctors table

- Public: View active doctors (is_active = true)
- Doctors: View own profile
- Doctors: Update own profile

### Doctor_schedules table

- Public: View all schedules (for patient booking)
- Doctors: Create/read/update/delete own schedules

## Testing Checklist

### Doctor Signup Flow

- [ ] Sign up as doctor with email/password
- [ ] Verify doctor appears in doctors table
- [ ] Verify default schedule created (Mon-Fri, 9-5)
- [ ] Verify is_active = true
- [ ] Verify 5 schedules in doctor_schedules table

### Doctor Dashboard

- [ ] Login as doctor
- [ ] Navigate to doctor-portal
- [ ] Click "Availability" tab
- [ ] See all 7 days with Mon-Fri enabled, Sat-Sun disabled
- [ ] Verify time slots show (09:00 - 17:00)

### Schedule Editing

- [ ] Click "Edit" on Monday
- [ ] Change start time to 08:00
- [ ] Change end time to 18:00
- [ ] Click "Save Schedule"
- [ ] Verify toast success message
- [ ] Verify time updated in database
- [ ] Toggle day off with switch
- [ ] Verify "Not available" text appears
- [ ] Toggle day back on

### Patient Booking

- [ ] Logout and login as patient
- [ ] Go to patient-portal
- [ ] Navigate to "Book Appointment"
- [ ] Doctor appears in list (because is_active = true)
- [ ] Click doctor to see available slots
- [ ] Available slots from 08:00-18:00 on Mon-Fri
- [ ] Saturday/Sunday have no slots
- [ ] Book appointment for available slot

## Deployment Steps

1. **Run consultation tables migration** (if not done):

   ```
   Paste db/04_create_consultation_tables.sql into Supabase SQL Editor
   ```

2. **Doctor sync already deployed** (previous fix)

   - Doctors auto-sync from auth.users
   - Triggers handle INSERT/UPDATE events

3. **No new migrations needed** for schedule system

   - Uses existing `doctor_schedules` table from db/02
   - Only adding functionality to populate and manage it

4. **Services and Components**
   - All code files created and deployed:
     - `src/services/scheduleService.ts`
     - `src/hooks/useSchedules.ts`
     - `src/components/ScheduleEditor.tsx`
   - Components integrated into `DoctorPortal.tsx` and `Auth.tsx`

## Files Created/Modified

### New Files

- `src/services/scheduleService.ts` (274 lines)
- `src/hooks/useSchedules.ts` (154 lines)
- `src/components/ScheduleEditor.tsx` (155 lines)

### Modified Files

- `src/pages/DoctorPortal.tsx` - Import ScheduleEditor, remove dummy data, update availability tab
- `src/pages/Auth.tsx` - Import schedule service, auto-create schedule on signup

## Key Features

✅ **Automatic Default Schedules** - Doctors get Mon-Fri, 9-5 on signup
✅ **Real-Time Updates** - Changes visible immediately across sessions
✅ **Easy Management** - Toggle days, edit times with simple UI
✅ **Patient Integration** - Doctors appear in booking when they have schedules
✅ **Data Persistence** - All changes saved to Supabase
✅ **Error Handling** - Validation + toast notifications
✅ **Type Safety** - Full TypeScript support
✅ **React Query** - Optimized caching and refetching

## Next Steps

1. Test doctor signup flow
2. Verify schedules appear in patient portal
3. Test booking with different schedule configurations
4. Monitor Supabase logs for any trigger issues
