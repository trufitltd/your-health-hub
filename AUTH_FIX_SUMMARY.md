# Auth Signup Fix - Summary

## Problem Identified
- **Error**: HTTP 500 "Database error saving new user" on all signup attempts
- **Root Cause**: Database trigger on `auth.users` table was checking for `role` in user metadata, but we removed all metadata to debug the issue
- **Effect**: New users couldn't be created in auth.users

## Solution Applied

### 1. Frontend Changes (Auth.tsx)
✅ **Removed all metadata from signup call** (line 108-111)
- Changed from: `signUp({ email, password, options: { data: { ...metadata } } })`
- Changed to: `signUp({ email, password })`

✅ **Fixed role determination on email verify** (line 398)
- Now uses `pendingUserData.role` from the signup form (available during verify)
- Previously tried to use user.user_metadata.role which didn't exist

✅ **Fixed role determination on login** (lines 439-453)
- Queries `doctor_registrations` table to check if user is a doctor
- Fallback to 'patient' role if no doctor registration exists
- This allows login even without metadata

### 2. Database Changes Required
**You must run this SQL in Supabase Dashboard → SQL Editor:**

```sql
-- Fix auth user creation triggers - remove metadata dependency
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();

DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();
```

## Steps to Complete Recovery

1. **Run the SQL above** in your Supabase SQL Editor
2. **Test signup** in the app at http://localhost:5173
3. **Verify patient/doctor registration** still populates via direct upsert in Auth.tsx

## Data Flow After These Changes

### Patient Signup
1. User fills out patient form and clicks "Sign up"
2. `signUp({email, password})` creates auth.users entry
3. `pendingUserData` stored with all form data (including role='patient')
4. User receives verification email
5. User clicks email link → `handleVerifyEmail()` 
6. Uses `pendingUserData` to upsert patient data into `patient_registrations` table
7. Session created, redirects to `/patient-portal`

### Doctor Signup
- Same flow but with doctor-specific fields
- After verify: inserts into `doctor_registrations` table with `verification_status='pending'`
- Admin must approve doctor in CentralAdmin dashboard
- Doctor then appears as available for patient booking (after approval)

### Login
1. User enters email/password
2. `signInWithPassword()` authenticates
3. Query `doctor_registrations` to determine if user is doctor
4. Redirect to `/doctor-portal` (if doctor) or `/patient-portal` (if patient)

## Files Modified
- `src/pages/Auth.tsx` - Signup, verify, and login flows
- `db/21_simplify_auth_triggers.sql` - Database trigger fix (run this!)

## Files for Reference
- `db/21_disable_auth_triggers_debug.sql` - Alternative (not needed)
- `db/21_fix_auth_triggers.sql` - Alternative with error handling (not needed)

## Testing Checklist
- [ ] Run SQL migration in Supabase (REQUIRED!)
- [ ] Patient signup works (verify email sent)
- [ ] Patient email verification works (data appears in patient_registrations)
- [ ] Doctor signup works  
- [ ] Doctor approval workflow functions (Central Admin page)
- [ ] Login redirects correctly (doctor vs patient)
