# Quick Setup Guide - Consultation Enhancements

## Step 1: Run Database Migration

1. Open Supabase Dashboard
2. Go to **SQL Editor**
3. Create new query
4. Copy and paste contents from: `db/09_create_patient_folders_and_notes.sql`
5. Click **Run**

**Expected Output:**
- ✅ `patient_folders` table created
- ✅ `doctor_consultation_notes` table created
- ✅ RLS policies enabled
- ✅ Indexes created

---

## Step 2: Verify Components Are Exported

Check `src/components/consultation/index.ts`:

```typescript
export { ConsultationRoom } from './ConsultationRoom';
export { ChatSidebar } from './ChatSidebar';
export { ControlBar } from './ControlBar';
export { DoctorNotesPanel } from './DoctorNotesPanel';
```

✅ All components should be exported

---

## Step 3: Test Consultation Type Restrictions

### Video Consultation
- [ ] Audio button visible
- [ ] Video button visible
- [ ] Chat button visible
- [ ] Hand raise button visible

### Audio Consultation
- [ ] Audio button visible
- [ ] Video button **NOT** visible
- [ ] Chat button visible
- [ ] Hand raise button visible

### Chat Consultation
- [ ] Audio button **NOT** visible
- [ ] Video button **NOT** visible
- [ ] Chat button visible
- [ ] Hand raise button visible

---

## Step 4: Test Doctor Notes Panel

**As Doctor:**
1. Join a consultation
2. Look for **📄 Consultation Notes** button in top-right
3. Click to open notes panel
4. Fill in fields:
   - Diagnosis
   - Prescriptions
   - Treatment Plan
   - Follow-up Notes
5. Click **Save Notes**
6. Verify toast notification appears
7. Close panel

**As Patient:**
1. After consultation ends
2. Go to patient portal
3. View consultation history
4. Should see doctor's notes

---

## Step 5: Test Patient Folders

### Create New Patient Folder
```typescript
// In patient portal or onboarding
const { data, error } = await supabase
  .from('patient_folders')
  .insert({
    patient_id: user.id,
    patient_type: 'new',
    medical_history: 'Initial history',
    allergies: 'None known',
    current_medications: 'None'
  })
  .select()
  .single();
```

### Update Patient Folder
```typescript
const { data, error } = await supabase
  .from('patient_folders')
  .update({
    patient_type: 'returning',
    medical_history: 'Updated history'
  })
  .eq('patient_id', user.id)
  .select()
  .single();
```

### View Patient Folder (Doctor)
```typescript
const { data: folder } = await supabase
  .from('patient_folders')
  .select('*')
  .eq('patient_id', patientId)
  .single();
```

---

## Step 6: Verify RLS Policies

In Supabase Dashboard → Authentication → Policies:

### patient_folders
- ✅ `Allow patients to view own folder`
- ✅ `Allow doctors to view patient folders`
- ✅ `Allow patients to update own folder`
- ✅ `Allow patients to insert own folder`

### doctor_consultation_notes
- ✅ `Allow patients to view own consultation notes`
- ✅ `Allow doctors to view own notes`
- ✅ `Allow doctors to insert consultation notes`
- ✅ `Allow doctors to update own notes`

---

## Step 7: Test End-to-End Flow

### New Patient Flow
1. Patient books appointment
2. Patient joins consultation
3. Doctor admits patient
4. Doctor opens notes panel
5. Doctor fills in diagnosis, prescriptions, treatment plan
6. Doctor saves notes
7. Consultation ends
8. Patient can view notes in history

### Returning Patient Flow
1. Patient books appointment
2. Doctor can view patient's folder (medical history, allergies, etc.)
3. Consultation proceeds
4. Doctor updates notes
5. Patient folder updated with new information

---

## Troubleshooting

### Notes Panel Not Showing
- [ ] Verify user role is 'doctor'
- [ ] Check console for errors
- [ ] Ensure `sessionId` and `patientId` are not null

### Can't Save Notes
- [ ] Check RLS policies in Supabase
- [ ] Verify doctor_id matches authenticated user
- [ ] Check browser console for error messages
- [ ] Ensure `doctor_consultation_notes` table exists

### Patient Folder Not Accessible
- [ ] Verify `patient_folders` table exists
- [ ] Check RLS policies
- [ ] Ensure patient_id is correct UUID
- [ ] Check for unique constraint violation

### Media Controls Not Restricting
- [ ] Verify `consultationType` prop is correct
- [ ] Check ControlBar component receives correct type
- [ ] Clear browser cache
- [ ] Restart development server

---

## File Structure

```
src/components/consultation/
├── ConsultationRoom.tsx          (refactored, ~800 lines)
├── ChatSidebar.tsx               (new, ~120 lines)
├── ControlBar.tsx                (new, ~100 lines)
├── DoctorNotesPanel.tsx          (new, ~150 lines)
├── ConsultationHistory.tsx
├── JoinConsultationButton.tsx
├── PatientLobby.tsx
├── PreConsultationCheck.tsx
└── index.ts                       (updated exports)

db/
├── 01_create_appointments.sql
├── 02_create_doctors_schedules.sql
├── 03_add_doctor_id_to_appointments.sql
├── 04_create_consultation_tables.sql
├── 05_sync_auth_doctors_to_doctors_table.sql
├── 06_cleanup_and_verify_schedules.sql
├── 07_create_webrtc_signals.sql
├── 08_fix_consultation_status_constraint.sql
└── 09_create_patient_folders_and_notes.sql  (new)
```

---

## Key Features Summary

| Feature | Status | Location |
|---------|--------|----------|
| Video/Audio/Chat restrictions | ✅ | ControlBar.tsx |
| Patient folders (new/returning) | ✅ | db/09_*.sql |
| Doctor consultation notes | ✅ | DoctorNotesPanel.tsx |
| Refactored ConsultationRoom | ✅ | ChatSidebar, ControlBar |
| RLS policies | ✅ | db/09_*.sql |
| Component exports | ✅ | index.ts |

---

## Next Steps

1. ✅ Run database migration
2. ✅ Test consultation type restrictions
3. ✅ Test doctor notes panel
4. ✅ Test patient folders
5. ✅ Verify RLS policies
6. ✅ Test end-to-end flow
7. 📋 Add patient folder UI to patient portal
8. 📋 Add consultation history view
9. 📋 Add notes archive/history

---

## Support Resources

- **Consultation Enhancements**: `CONSULTATION_ENHANCEMENTS.md`
- **Database Schema**: `db/09_create_patient_folders_and_notes.sql`
- **Component Code**: `src/components/consultation/`
- **Supabase Docs**: https://supabase.com/docs
