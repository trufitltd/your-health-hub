# Quick Start: Doctor Schedule System

## What's New?

Doctors now get **automatic schedules** when they sign up:

- ✅ Monday-Friday: 9:00 AM - 5:00 PM
- ✅ Saturday-Sunday: Not available
- ✅ Doctors can edit/toggle days in their portal
- ✅ Patients see doctors with available slots when booking

## For Doctors

### First Time Setup (Automatic)

1. Sign up as a doctor
2. Default schedule is created automatically
3. Login to doctor portal
4. Manage schedule anytime in the "Availability" tab

### Edit Your Schedule

1. Go to Doctor Portal → Availability tab
2. **Toggle days**: Switch on/off for Saturday/Sunday
3. **Edit times**: Click "Edit" button to change hours
   - Change start/end times
   - Click "Save Schedule"
4. Changes saved to database immediately

### Create Default Schedule

If your schedule gets deleted:

1. Go to Availability tab
2. Click "Create Default Schedule" button
3. Mon-Fri 9-5 created automatically

## For Patients

### Find Doctors by Schedule

1. Go to Patient Portal → Book Appointment
2. Select a date
3. Only doctors with available schedules appear
4. Pick a doctor → See available time slots
5. Book your appointment

## Technical Files

- **Service**: `src/services/scheduleService.ts` - Database operations
- **Hook**: `src/hooks/useSchedules.ts` - State management
- **Component**: `src/components/ScheduleEditor.tsx` - UI for editing
- **Integration**: `DoctorPortal.tsx` (Availability tab), `Auth.tsx` (auto-create)

## Database

- **doctors** table: `is_active` flag (auto-synced from auth)
- **doctor_schedules** table: Mon-Sun time slots
- **Trigger**: Auto-creates schedules on doctor signup

## Example Flow

```
Doctor Signs Up
  ↓
  Trigger: handle_new_doctor_signup()
  ↓
  Doctor profile created in doctors table
  ↓
  Code: createDefaultSchedule(doctor_id)
  ↓
  5 schedules created (Mon-Fri, 9-5)
  ↓
  Doctor appears in patient portal
  ↓
  Patients can book appointments
```

## Troubleshooting

**Doctor signed up but doesn't appear in patient portal:**

- Check `doctors` table: is_active = true?
- Check `doctor_schedules`: At least 1 schedule for their timezone?
- Check Supabase logs for trigger errors

**Can't edit schedule:**

- Ensure you're logged in as the doctor
- Check browser console for errors
- Verify `doctor_id` matches `auth.users.id`

**Times showing wrong:**

- Check time format: HH:MM (24-hour)
- Verify database timezone settings
- Clear browser cache and refresh

## Time Format

- Start time: `09:00` (9 AM)
- End time: `17:00` (5 PM)
- Validation: End time must be after start time

## Default Duration

- Slot duration: 30 minutes (configurable)
- Max patients per slot: 1 (configurable)
