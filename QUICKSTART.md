# 🚀 Doctor Schedule System - START HERE

## What's the Problem?

Doctors weren't appearing in the patient portal even though they signed up.

**Why?** They had no schedules in `doctor_schedules` table.

## What's the Solution?

✅ Auto-create schedules when doctors sign up
✅ Let doctors manage schedules in their dashboard
✅ Show doctors in patient portal when they have schedules

## How to Deploy (5 minutes)

### Open Supabase SQL Editor

Go to: https://supabase.com/dashboard → Your Project → SQL Editor

### Run 3 Migrations in Order

**1️⃣ Copy & Paste:**

```
Open: db/05_sync_auth_doctors_to_doctors_table.sql
Copy entire file → Paste in SQL Editor → Click "Run"
```

**2️⃣ Copy & Paste:**

```
Open: db/02_create_doctors_schedules.sql
Copy entire file → Paste in SQL Editor → Click "Run"
```

**3️⃣ Copy & Paste:**

```
Open: db/06_cleanup_and_verify_schedules.sql
Copy entire file → Paste in SQL Editor → Click "Run"
```

### Verify Success

Run this in SQL Editor:

```sql
SELECT COUNT(*) FROM public.doctor_schedules;
```

✓ Should show at least 5 rows

---

## Test It Works

### 1. Doctor Signs Up

- Go to: http://localhost:5173/auth?mode=register
- Select: **Doctor** role
- Fill in: Email, password, name
- Click: Create Account

### 2. Doctor Logs In

- Email: Your test email
- Password: Your password
- Should redirect to: Doctor Portal

### 3. Check Schedule Tab

- Click: **"Availability"** tab
- Should see: All 7 days with times
- Mon-Fri: Should be ON (09:00 - 17:00)
- Sat-Sun: Should be OFF

### 4. Edit Schedule

- Click: **"Edit"** on Monday
- Change start to: 08:00
- Change end to: 18:00
- Click: **"Save Schedule"**
- Should see: Success message

### 5. Patient Portal

- Log out → Log in as patient
- Go to: **Book Appointment**
- Doctor should appear in list ✅
- Select doctor → See available times
- Monday should show: 08:00 - 18:00 (because you edited it)

---

## If Something Doesn't Work

### Problem: No doctors appear in patient portal

**Quick Fix:**

```sql
-- In Supabase SQL Editor, run:
SELECT COUNT(*) FROM public.doctors WHERE is_active = true;
```

If 0: No doctors signed up yet → Have someone register as doctor

If > 0: Check if they have schedules:

```sql
SELECT COUNT(*) FROM public.doctor_schedules
WHERE doctor_id = (SELECT id FROM public.doctors LIMIT 1);
```

If 0: Run migration 06 again

### Problem: Doctor dashboard shows no schedules

**Quick Fix:**

```sql
-- Check if schedules exist:
SELECT * FROM public.doctor_schedules
WHERE doctor_id = (SELECT id FROM public.doctors LIMIT 1);
```

If empty: Run migration 06 again

```sql
-- Copy entire db/06_cleanup_and_verify_schedules.sql
-- Paste in SQL Editor → Run
```

### Problem: Can't edit schedule

Check browser DevTools Console (F12) for errors.

Common issues:

- Not logged in as doctor
- Invalid time (end time before start time)
- Connection error to database

---

## Database Overview

### doctors table

- Stores: Doctor profiles, linked to auth.users
- Key field: `is_active = true` (shows doctor)

### doctor_schedules table

- Stores: Weekly availability (Mon-Sun)
- Key fields: `doctor_id`, `day_of_week`, `start_time`, `end_time`

### How they work together:

```
Doctor signs up
  → Trigger creates doctor profile with is_active = true
  → Trigger creates default schedules (Mon-Fri 9-5)
  → Patient portal queries: doctors WHERE is_active = true
  → Doctor appears because they have is_active = true
  → Booking shows available slots from schedules
```

---

## File Locations

| What         | File                                |
| ------------ | ----------------------------------- |
| Doctor logic | `src/services/scheduleService.ts`   |
| React hook   | `src/hooks/useSchedules.ts`         |
| UI component | `src/components/ScheduleEditor.tsx` |
| Dashboard    | `src/pages/DoctorPortal.tsx`        |
| Auth         | `src/pages/Auth.tsx`                |
| Migrations   | `db/05...`, `db/02...`, `db/06...`  |

---

## Common Questions

**Q: Do I need to re-run migrations for each doctor?**
A: No! One-time setup. New doctors auto-get schedules.

**Q: Can doctors change their schedule?**
A: Yes! Edit button in Availability tab.

**Q: What's the default schedule?**
A: Monday-Friday, 9:00 AM - 5:00 PM

**Q: Can patients see the schedules?**
A: Indirectly. They see available slots when booking.

**Q: What if I need to change the default schedule?**
A: Edit `src/services/scheduleService.ts`, function `createDefaultSchedule()`

---

## Success Indicators ✅

After deploying:

- ✅ Doctor registers → Auto-gets Mon-Fri schedule
- ✅ Doctor login → Availability tab shows times
- ✅ Doctor edits schedule → Changes saved to database
- ✅ Patient books → Doctor appears in list
- ✅ Patient selects time → Shows available slots

---

## Need More Help?

- **Detailed deployment:** See `DEPLOYMENT_GUIDE.md`
- **SQL commands:** See `SQL_COMMANDS_TO_RUN.md`
- **Technical reference:** See `SCHEDULE_SYSTEM_GUIDE.md`
- **User guide:** See `DOCTOR_SCHEDULE_QUICKSTART.md`

---

## Timeline

- ⏱️ Migrations: 2-3 minutes
- ⏱️ Testing: 5 minutes
- ⏱️ Total: ~10 minutes

**You're ready! Start with the 3 migrations above.** 🎉
