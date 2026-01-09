# Slot Selection & Conflict Prevention - Implementation Guide

This guide walks you through the new slot selection and conflict prevention features added to the YourHealthHub patient portal.

## What's New

The booking flow now includes:

1. **Slot Selection Modal**: Browse available doctors, dates, and time slots
2. **Conflict Prevention**: Automatic checking to prevent double-booking
3. **Doctor Schedules**: Manage doctor availability (Monday-Friday, 9 AM - 5 PM by default)
4. **Real-time Validation**: Slots are checked against existing appointments before confirming

## Architecture Overview

### Database Schema

```
doctors (id, name, specialty, email, phone, bio, avatar_url)
    ↓
doctor_schedules (id, doctor_id, day_of_week, start_time, end_time, slot_duration_minutes, ...)
    ↓
appointments (id, patient_id, doctor_id, date, time, type, notes, status)
```

### Frontend Flow

```
Patient clicks "Book Appointment"
    ↓
SlotSelectionModal Opens
    ├─ Select Doctor
    ├─ Select Date (based on doctor's availability)
    ├─ Select Time Slot (30-minute intervals)
    └─ Conflict Check (via checkSlotAvailability)
    ↓
Booking Confirmation Modal
    ├─ Review Selected Slot
    ├─ Choose Call Type (Video/Audio)
    ├─ Add Notes (Optional)
    └─ Final Conflict Check & Insert to DB
```

## Step-by-Step Setup

### Step 1: Run Database Migrations

Apply the three migration files in order:

```bash
# Via Supabase Dashboard SQL Editor:
# 1. Copy & run: db/01_create_appointments.sql
# 2. Copy & run: db/02_create_doctors_schedules.sql
# 3. Copy & run: db/03_add_doctor_id_to_appointments.sql
```

Or via CLI:

```bash
supabase db push
```

**Expected Result:**

- `appointments` table with RLS policies
- `doctors` table with 4 sample doctors
- `doctor_schedules` table with sample Mon-Fri schedules
- `available_slots` view for easy slot querying

### Step 2: Start the Development Server

```bash
npm run dev
```

### Step 3: Test the Booking Flow

1. Sign in as a patient (or create a test account)
2. Click "Book Appointment" button in the portal
3. The **Slot Selection Modal** will open showing:
   - List of available doctors
   - Available dates (for the next 30 days)
   - Time slots for selected doctor/date
4. Select a doctor, date, and time
5. Review the slot summary
6. Click "Confirm Slot" to proceed to confirmation
7. In the confirmation modal:
   - Review your selection
   - Choose call type (Video/Audio)
   - Add optional notes
   - Click "Confirm Booking"
8. See the appointment appear in your "Appointments" list

## Code Structure

### New Files

#### `src/hooks/useAvailableSlots.ts`

React Query hooks for fetching doctor data and available slots:

- `useDoctors()`: Fetch all doctors
- `useAvailableSlots()`: Fetch available slots with conflict detection
- `checkSlotAvailability()`: Check if a specific slot is available
- Helper functions for date/time manipulation

#### `src/components/SlotSelectionModal.tsx`

A reusable modal component for slot selection with:

- Doctor picker
- Date picker (shows available dates for selected doctor)
- Time picker (shows 30-minute slots for selected date)
- Appointment summary preview

#### Database Files (`db/`)

- `01_create_appointments.sql`: Initial appointments table
- `02_create_doctors_schedules.sql`: Doctor and schedule management
- `03_add_doctor_id_to_appointments.sql`: Links appointments to doctors

### Modified Files

#### `src/pages/PatientPortal.tsx`

Updated booking flow:

- Added `slotSelectionOpen` state to manage slot selection modal
- Added imports for new hooks and component
- `handleSlotSelect()`: Validates slot availability when selected
- `createBooking()`: Added final conflict check before insertion
- Now passes `doctor_id` when creating appointments

## How Conflict Prevention Works

### Client-Side (Immediate Feedback)

When a user selects a slot:

1. `handleSlotSelect()` is called
2. `checkSlotAvailability()` queries the database for conflicts
3. If a conflict is found, user sees a toast error
4. User can select a different slot

### Server-Side (Final Validation)

When confirming a booking:

1. `createBooking()` runs a final conflict check
2. If the slot was booked by another user, the error is caught
3. User can select a new slot and retry

### Database-Level (Safety Net)

- RLS policies ensure patients can only see/modify their own appointments
- Unique constraints prevent duplicate bookings
- Foreign key constraints maintain data integrity

## Customizing Doctor Schedules

### Add/Edit Doctors

Via Supabase SQL Editor:

```sql
INSERT INTO public.doctors (name, specialty, email, phone, bio)
VALUES (
  'Dr. Your Name',
  'Your Specialty',
  'email@hospital.com',
  '+1 (555) 000-0000',
  'Your bio'
);
```

### Modify Doctor Schedules

Change working hours, add weekends, or restrict availability:

```sql
-- Update existing schedule
UPDATE public.doctor_schedules
SET start_time = '08:00', end_time = '18:00'
WHERE doctor_id = '<doctor_id>' AND day_of_week = 1; -- Monday

-- Add weekend availability
INSERT INTO public.doctor_schedules (doctor_id, day_of_week, start_time, end_time, slot_duration_minutes)
VALUES ('<doctor_id>', 6, '10:00', '14:00', 30); -- Saturday
```

### Adjust Slot Duration

Change slot duration (in doctor_schedules table):

```sql
UPDATE public.doctor_schedules
SET slot_duration_minutes = 60 -- 1-hour slots instead of 30 mins
WHERE doctor_id = '<doctor_id>';
```

## Testing Edge Cases

### Test Double-Booking Prevention

1. Open app in two browser windows
2. Sign in as different patients in each window
3. Try to book the same slot simultaneously
4. One should succeed, the other should see "Slot unavailable" error

### Test Date Range Filtering

1. Modify `useAvailableSlots` hook parameter `daysAhead` (default: 7)
2. Slots should only show within that date range

### Test With No Available Slots

1. Update doctor schedule to `is_available = false` in database
2. Slot selection modal should show "No available dates" message

## Troubleshooting

### "No doctors available" in slot selection modal

- Check that `doctors` table has records
- Check `doctor_schedules` table has schedules for those doctors
- Verify `is_available = true` in schedules

### "No available times on this date"

- Verify the selected date matches a doctor's working day
- Check that `day_of_week` in schedules matches the calendar date
- Confirm `end_time > start_time` for the schedule

### Slot disappears after selection

- This is normal if another user books it simultaneously
- User should select a different slot and retry

### "Slot unavailable" error when booking

- Another user booked this slot between selection and confirmation
- User should go back and select a different slot

## Performance Optimization Tips

### For Large Doctor Networks

If you have many doctors/schedules:

1. Add pagination to the doctor list in SlotSelectionModal
2. Filter doctors by specialty before showing slots
3. Cache doctor data longer (update React Query staleTime)

### For Busy Practices

1. Add `max_patients_per_slot > 1` if doctor can see multiple patients
2. Implement booking buffers (e.g., 15-minute slots instead of 30)
3. Use database indexes (already created in migrations)

## Future Enhancements

- [ ] Recurring appointment slots (weekly/monthly)
- [ ] Doctor unavailability (vacation, sick days)
- [ ] Patient preferences (preferred doctor, call type)
- [ ] Automated confirmations (email/SMS)
- [ ] Appointment rescheduling/cancellation
- [ ] Wait-list for fully booked slots
- [ ] Insurance verification integration

## API Reference

### `useDoctors()`

```typescript
const { data: doctors, isLoading, error } = useDoctors();
// Returns: Doctor[]
```

### `useAvailableSlots(doctorId?, daysAhead?)`

```typescript
const { data: slots, isLoading, error } = useAvailableSlots("doctor-uuid", 30);
// Returns: AvailableSlot[] with computed nextOccurrence
```

### `checkSlotAvailability(doctorId, date, time)`

```typescript
const isAvailable = await checkSlotAvailability(
  "doctor-id",
  "2026-01-15",
  "10:00"
);
// Returns: boolean
// Throws error if database query fails
```

## Database Schema Details

### available_slots View

Shows real-time available slots with conflict detection:

```sql
SELECT
  schedule_id,
  doctor_id,
  doctor_name,
  specialty,
  day_of_week,
  start_time,
  end_time,
  slot_duration_minutes,
  max_patients_per_slot,
  booked_count,
  available_slots -- max_patients_per_slot - booked_count
FROM public.available_slots
WHERE doctor_id = $1
```

---

**For more info**, see `db/README.md` for migration details and schema documentation.

**Questions?** Check the inline comments in:

- `src/hooks/useAvailableSlots.ts` (hook logic)
- `src/components/SlotSelectionModal.tsx` (UI component)
- `src/pages/PatientPortal.tsx` (integration)
