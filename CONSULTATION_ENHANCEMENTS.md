# Consultation System Enhancements

## Overview
This document outlines the new features implemented for the consultation system:
1. **Consultation Type Restrictions** - Media controls based on consultation type
2. **Patient Folders** - Support for new and returning patients
3. **Doctor Consultation Notes** - Diagnosis, prescriptions, and treatment plans
4. **Refactored ConsultationRoom** - Reduced file size with extracted components

---

## 1. Consultation Type Restrictions

### Media Availability by Consultation Type

| Feature | Video | Audio | Chat |
|---------|-------|-------|------|
| Video Stream | ✅ | ❌ | ❌ |
| Audio Stream | ✅ | ✅ | ❌ |
| Chat | ✅ | ✅ | ✅ |
| Hand Raise | ✅ | ✅ | ✅ |

### Implementation
The `ControlBar` component automatically restricts media controls based on `consultationType`:
- **Video consultation**: Shows audio + video + chat controls
- **Audio consultation**: Shows audio + chat controls (no video)
- **Chat consultation**: Shows only chat control

```tsx
// Example usage in ConsultationRoom
<ControlBar
  consultationType={consultationType}
  isAudioEnabled={isAudioEnabled}
  isVideoEnabled={isVideoEnabled}
  // ... other props
/>
```

---

## 2. Patient Folders

### Database Schema

#### `patient_folders` Table
```sql
CREATE TABLE patient_folders (
  id UUID PRIMARY KEY,
  patient_id UUID NOT NULL (UNIQUE),
  patient_type TEXT ('new' | 'returning'),
  medical_history TEXT,
  allergies TEXT,
  current_medications TEXT,
  previous_diagnoses TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

### Features
- **New Patients**: Create folder on first consultation
- **Returning Patients**: Access existing folder history
- **Patient Access**: View own folder information
- **Doctor Access**: View patient folders for their consultations

### Row Level Security (RLS)
- Patients can view and update their own folder
- Doctors can view patient folders for consultations they're part of
- Service role has full access

### Usage Example
```typescript
// Get patient folder
const { data: folder } = await supabase
  .from('patient_folders')
  .select('*')
  .eq('patient_id', patientId)
  .single();

// Update patient folder
await supabase
  .from('patient_folders')
  .update({
    medical_history: 'Updated history',
    allergies: 'Peanuts'
  })
  .eq('patient_id', patientId);
```

---

## 3. Doctor Consultation Notes

### Database Schema

#### `doctor_consultation_notes` Table
```sql
CREATE TABLE doctor_consultation_notes (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL,
  patient_id UUID NOT NULL,
  doctor_id UUID NOT NULL,
  diagnosis TEXT,
  prescriptions TEXT,
  treatment_plan TEXT,
  follow_up_notes TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

### Features
- **Diagnosis**: Record patient diagnosis
- **Prescriptions**: Document prescribed medications
- **Treatment Plan**: Outline treatment strategy
- **Follow-up Notes**: Add follow-up instructions

### DoctorNotesPanel Component
Located in `src/components/consultation/DoctorNotesPanel.tsx`

**Features:**
- Accessible only to doctors during consultation
- Button in top-right corner of consultation room
- Slide-out panel with form fields
- Auto-save functionality
- Toast notifications for success/error

**Usage:**
```tsx
<DoctorNotesPanel
  isOpen={isNotesOpen}
  onClose={() => setIsNotesOpen(false)}
  sessionId={sessionId}
  patientId={patientId}
  doctorId={doctorId}
/>
```

### Row Level Security (RLS)
- Patients can view notes from their consultations
- Doctors can view and edit their own notes
- Doctors can only insert notes for their consultations

---

## 4. Refactored ConsultationRoom

### New Components

#### ChatSidebar (`src/components/consultation/ChatSidebar.tsx`)
- Extracted chat UI from main component
- Manages message display and input
- Auto-scrolls to latest message
- Reduces main component size by ~200 lines

**Props:**
```typescript
interface ChatSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  messages: Message[];
  newMessage: string;
  onMessageChange: (message: string) => void;
  onSendMessage: () => void;
}
```

#### ControlBar (`src/components/consultation/ControlBar.tsx`)
- Extracted media controls from main component
- Implements consultation type restrictions
- Manages audio, video, chat, hand raise, and end call buttons
- Reduces main component size by ~150 lines

**Props:**
```typescript
interface ControlBarProps {
  consultationType: 'video' | 'audio' | 'chat';
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  isChatOpen: boolean;
  handRaised: boolean;
  messageCount: number;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onToggleChat: () => void;
  onToggleHand: () => void;
  onEndCall: () => void;
}
```

#### DoctorNotesPanel (`src/components/consultation/DoctorNotesPanel.tsx`)
- New component for doctor consultation notes
- Slide-out panel on right side
- Form fields for diagnosis, prescriptions, treatment plan, follow-up notes
- Saves to database with proper RLS

**Props:**
```typescript
interface DoctorNotesPanelProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
  patientId: string;
  doctorId: string;
}
```

### File Size Reduction
- **Before**: ConsultationRoom.tsx ~1200 lines
- **After**: ConsultationRoom.tsx ~800 lines + 3 new components
- **Benefit**: Improved maintainability and readability

---

## 5. Database Migration

### Running the Migration

Execute the SQL file in your Supabase project:

```bash
# File: db/09_create_patient_folders_and_notes.sql
```

**Steps:**
1. Go to Supabase Dashboard → SQL Editor
2. Create new query
3. Copy contents of `db/09_create_patient_folders_and_notes.sql`
4. Run the query

**Tables Created:**
- `patient_folders` - Patient medical information
- `doctor_consultation_notes` - Consultation notes and prescriptions

**Indexes Created:**
- `idx_patient_folders_patient_id`
- `idx_patient_folders_patient_type`
- `idx_doctor_consultation_notes_session_id`
- `idx_doctor_consultation_notes_patient_id`
- `idx_doctor_consultation_notes_doctor_id`

---

## 6. Integration Guide

### For Patients

**Viewing Folder:**
```typescript
// In patient portal
const { data: folder } = await supabase
  .from('patient_folders')
  .select('*')
  .eq('patient_id', user.id)
  .single();
```

**Updating Folder:**
```typescript
await supabase
  .from('patient_folders')
  .update({
    medical_history: newHistory,
    allergies: newAllergies,
    current_medications: newMeds
  })
  .eq('patient_id', user.id);
```

### For Doctors

**Accessing Patient Folder:**
```typescript
// During consultation
const { data: folder } = await supabase
  .from('patient_folders')
  .select('*')
  .eq('patient_id', patientId)
  .single();
```

**Viewing Consultation Notes:**
```typescript
const { data: notes } = await supabase
  .from('doctor_consultation_notes')
  .select('*')
  .eq('session_id', sessionId);
```

---

## 7. UI/UX Changes

### Consultation Room Top Bar
- Added **Consultation Notes** button (doctor only)
- Button shows active state when notes panel is open
- Positioned next to fullscreen button

### Control Bar
- **Video Consultation**: Mic + Video + Chat + Hand + End Call
- **Audio Consultation**: Mic + Chat + Hand + End Call
- **Chat Consultation**: Chat + Hand + End Call

### Doctor Notes Panel
- Slide-out panel from right side
- Four text areas: Diagnosis, Prescriptions, Treatment Plan, Follow-up Notes
- Save and Close buttons
- Toast notifications for feedback

---

## 8. Testing Checklist

### Consultation Type Restrictions
- [ ] Video consultation shows all media controls
- [ ] Audio consultation hides video control
- [ ] Chat consultation shows only chat control
- [ ] Media constraints applied correctly

### Patient Folders
- [ ] New patient folder created on first consultation
- [ ] Returning patient accesses existing folder
- [ ] Patient can view own folder
- [ ] Doctor can view patient folder
- [ ] Folder updates persist

### Doctor Notes
- [ ] Doctor can open notes panel
- [ ] Notes panel only visible to doctor
- [ ] Can save diagnosis, prescriptions, treatment plan
- [ ] Notes saved to database
- [ ] Patient can view notes
- [ ] Toast notifications work

### Component Refactoring
- [ ] Chat sidebar works independently
- [ ] Control bar shows correct buttons
- [ ] Doctor notes panel functions properly
- [ ] No console errors
- [ ] Performance improved

---

## 9. Future Enhancements

- [ ] Patient folder UI in patient portal
- [ ] Doctor notes history/archive
- [ ] Prescription printing
- [ ] Medical history timeline
- [ ] File attachments in notes
- [ ] Notes templates for doctors
- [ ] Patient notification when notes added

---

## 10. Support

For issues or questions:
1. Check console for errors
2. Verify RLS policies in Supabase
3. Ensure migration ran successfully
4. Check user permissions
