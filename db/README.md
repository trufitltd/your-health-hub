# Database Migrations

This directory contains SQL migration files for setting up the YourHealthHub database schema.

## Migrations

### 1. `01_create_appointments.sql`

Creates the `appointments` table for storing appointment bookings and enables Row Level Security (RLS).

**Tables created:**

- `appointments`: Stores appointment records with patient info, specialist, date/time, type, notes, and status.

**RLS Policies:**

- Patients can INSERT their own appointments
- Patients can SELECT/UPDATE/DELETE their own appointments

### 2. `02_create_doctors_schedules.sql`

Creates doctor management and scheduling tables.

**Tables created:**

- `doctors`: Basic doctor information (name, specialty, contact info, avatar)
- `doctor_schedules`: Weekly availability for each doctor (day of week, start/end times, slot duration)

**Views:**

- `available_slots`: Shows available appointment slots with conflict detection based on existing appointments

**RLS Policies:**

- Public can view doctors and schedules (for discovery)

**Sample Data:**

- 4 sample doctors inserted with Monday-Friday schedules (9 AM - 5 PM, 30-minute slots)

### 3. `03_add_doctor_id_to_appointments.sql`

Adds the `doctor_id` column to the appointments table to link appointments to specific doctors.

**Changes:**

- Adds `doctor_id` foreign key column to `appointments` table
- Creates index for fast lookups by doctor

## How to Apply Migrations

### Option 1: Supabase Dashboard (Recommended for development)

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Create a new query
4. Copy and paste the contents of each migration file (in order: 01, 02, 03)
5. Run each migration in sequence

### Option 2: Using `supabase` CLI (For teams/production)

```bash
# Install the CLI if you haven't already
npm install -g supabase

# Link your project
supabase link --project-ref <your-project-ref>

# Push migrations
supabase db push
```

## Important Notes

### Before Running Migrations:

- **Backup your database** if you have production data
- Migrations are idempotent (safe to run multiple times - they use `CREATE ... IF NOT EXISTS`)

### After Running Migrations:

1. **Update RLS Policies** (if needed):

   - The default policies allow patients to manage their own appointments
   - Add additional policies for doctors if they need to view/modify appointments

2. **Verify Doctor Schedules**:

   - Sample doctors are created with IDs starting with `550e8400-...`
   - Update or add your own doctors in the `doctors` table
   - Adjust schedules in the `doctor_schedules` table (e.g., change hours, add more days)

3. **Connect Frontend**:
   - The frontend now uses `useAvailableSlots()` hook to fetch doctor schedules
   - Booking validation uses `checkSlotAvailability()` to prevent double-booking
   - Appointments are inserted with `doctor_id` for conflict detection

## Troubleshooting

### "Table already exists" error

These are normal if you run migrations multiple times. The migrations use `CREATE ... IF NOT EXISTS`.

### "Foreign key constraint violated"

Make sure migrations are run in order (01, 02, 03). The `03` migration adds a column that references the `doctors` table created in `02`.

### No available slots showing in UI

1. Check that the `doctors` table has records
2. Check that the `doctor_schedules` table has records for those doctors
3. Verify that the schedules have `is_available = true`
4. Check the browser console for any GraphQL/API errors

## Next Steps

- **Add More Doctors**: Insert doctors into the `doctors` table via SQL Editor or API
- **Customize Schedules**: Edit `doctor_schedules` to match actual doctor availability
- **Add Doctor Profiles**: Store additional info (bio, image, rating) in the `doctors` table
- **Enable Notifications**: Add a trigger to notify patients when their appointment is confirmed
- **Track Ratings**: Add a `ratings` table for patient feedback on consultations

## Schema Diagram

```
doctors (id, name, specialty, email, phone, bio, avatar_url)
    ↓
    ├─→ doctor_schedules (id, doctor_id, day_of_week, start_time, end_time, ...)
    │
    └─→ appointments (id, doctor_id, patient_id, date, time, ...)
                          ↓
                      [conflict detection via view]

available_slots (VIEW) ← used for scheduling UI
```

---

**Last Updated:** January 9, 2026
**Version:** 1.0
