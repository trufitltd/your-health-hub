# Integration Guide: Adding Real-Time Consultations to Existing Pages

## Patient Portal Integration

### Show Consultation History

In `src/pages/PatientPortal.tsx`, add this to a new tab:

```tsx
import { ConsultationHistory } from '@/components/consultation';

// In the tabs section, add:
{
  id: 'consultations',
  label: 'Consultation History',
  icon: FileText
}

// In TabsContent, add:
{activeTab === 'consultations' && (
  <ConsultationHistory />
)}
```

### Join Consultation Button

Already integrated via `JoinConsultationButton` in appointment cards:

```tsx
<JoinConsultationButton
  appointmentId={appointment.id}
  consultationType={appointment.type as "video" | "audio" | "chat"}
  participantName={doctorName}
  status={appointment.status}
/>
```

## Doctor Portal Integration

### Show Consultation History

Same as patient portal:

```tsx
import { ConsultationHistory } from "@/components/consultation";

{
  activeTab === "consultations" && <ConsultationHistory />;
}
```

### Start Consultation

In schedule view:

```tsx
<JoinConsultationButton
  appointmentId={appointment.id}
  consultationType={appointment.type as "video" | "audio" | "chat"}
  participantName={patientName}
  status={appointment.status}
/>
```

## Consultation Page (Already Set Up)

The `/consultation/:appointmentId` page is fully functional:

```tsx
// URL: /consultation/123?type=video&participant=Dr%20Jane%20Doe
// Automatically:
// - Creates session
// - Loads message history
// - Subscribes to real-time messages
// - Tracks duration
// - Saves session on end
```

## Add to Services Page

Show available consultation types:

```tsx
const consultationServices = [
  {
    id: "video",
    name: "Video Consultation",
    description: "Face-to-face video call with your doctor",
    icon: Video,
    price: "$45",
  },
  {
    id: "audio",
    name: "Audio Consultation",
    description: "Phone call consultation with your doctor",
    icon: Phone,
    price: "$35",
  },
  {
    id: "chat",
    name: "Chat Consultation",
    description: "Text-based messaging consultation",
    icon: MessageSquare,
    price: "$25",
  },
];

// With "Start Now" button that navigates to booking
```

## Add to Booking Flow

When booking appointment, allow selecting consultation type:

```tsx
const [consultationType, setConsultationType] = useState<
  "video" | "audio" | "chat"
>("video");

// In booking form:
<div className="space-y-3 mb-6">
  <label className="text-sm font-semibold">Consultation Type</label>
  <div className="grid grid-cols-3 gap-3">
    {["video", "audio", "chat"].map((type) => (
      <button
        key={type}
        onClick={() => setConsultationType(type as any)}
        className={`p-4 rounded-lg border-2 transition-all ${
          consultationType === type
            ? "border-primary bg-primary/10"
            : "border-border"
        }`}
      >
        {type.charAt(0).toUpperCase() + type.slice(1)}
      </button>
    ))}
  </div>
</div>;

// Save to database when creating appointment
payload.type = consultationType;
```

## Dashboard Widgets

### Show Upcoming Consultations

```tsx
import { ConsultationHistory } from "@/components/consultation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

<Card>
  <CardHeader>
    <CardTitle>Recent Consultations</CardTitle>
  </CardHeader>
  <CardContent>
    <ConsultationHistory />
  </CardContent>
</Card>;
```

### Show Statistics

```tsx
const [stats, setStats] = useState({
  totalConsultations: 0,
  thisMonthConsultations: 0,
  totalMinutes: 0,
});

useEffect(() => {
  const loadStats = async () => {
    const sessions = await consultationService.getSessionHistory(
      user.id,
      role as "patient" | "doctor"
    );

    setStats({
      totalConsultations: sessions.length,
      thisMonthConsultations: sessions.filter(
        (s) => new Date(s.started_at).getMonth() === new Date().getMonth()
      ).length,
      totalMinutes: Math.floor(
        sessions.reduce((sum, s) => sum + s.duration_seconds, 0) / 60
      ),
    });
  };

  loadStats();
}, [user, role]);

return (
  <div className="grid grid-cols-3 gap-4">
    <Card>
      <CardContent className="pt-6">
        <div className="text-3xl font-bold">{stats.totalConsultations}</div>
        <p className="text-sm text-muted-foreground">Total Consultations</p>
      </CardContent>
    </Card>
    <Card>
      <CardContent className="pt-6">
        <div className="text-3xl font-bold">{stats.thisMonthConsultations}</div>
        <p className="text-sm text-muted-foreground">This Month</p>
      </CardContent>
    </Card>
    <Card>
      <CardContent className="pt-6">
        <div className="text-3xl font-bold">{stats.totalMinutes}</div>
        <p className="text-sm text-muted-foreground">Total Minutes</p>
      </CardContent>
    </Card>
  </div>
);
```

## Appointment Card Enhancement

Update appointment cards to show consultation type:

```tsx
import { Video, Phone, MessageSquare } from "lucide-react";

const consultationIcons = {
  video: Video,
  audio: Phone,
  chat: MessageSquare,
};

const ConsultationIcon = consultationIcons[appointment.type];

<div className="flex items-center gap-2">
  <ConsultationIcon className="w-4 h-4" />
  <span className="text-sm capitalize">{appointment.type}</span>
</div>;
```

## Add Consultation Notes to Appointment Details

After consultation, doctors can add notes:

```tsx
const [notes, setNotes] = useState("");

const handleSaveNotes = async (sessionId: string) => {
  const session = await consultationService.getSession(sessionId);
  const duration = Math.floor(
    (new Date().getTime() - new Date(session.started_at).getTime()) / 1000
  );

  await consultationService.endSession(sessionId, duration, notes);
};

<div className="space-y-4">
  <label className="text-sm font-semibold">Consultation Notes</label>
  <textarea
    value={notes}
    onChange={(e) => setNotes(e.target.value)}
    placeholder="Add notes about the consultation..."
    className="w-full min-h-[100px] p-3 rounded-lg border border-border"
  />
  <Button onClick={() => handleSaveNotes(sessionId)}>Save Notes</Button>
</div>;
```

## Real-Time Status Updates

Show live consultation status in appointment list:

```tsx
const [liveConsultations, setLiveConsultations] = useState<string[]>([]);

useEffect(() => {
  // Subscribe to all user's active sessions
  appointments.forEach((apt) => {
    const session = consultationService.getSessionByAppointmentId(apt.id);
    if (session?.status === "active") {
      setLiveConsultations((prev) => [...prev, apt.id]);
    }
  });
}, [appointments]);

// In appointment card:
{
  liveConsultations.includes(appointment.id) && (
    <Badge className="animate-pulse bg-success">Live</Badge>
  );
}
```

## Mobile Optimization

For mobile devices, optimize consultation room:

```tsx
// In ConsultationRoom, detect mobile
const isMobile = window.innerWidth < 768;

// Auto-close chat on mobile for better video view
useEffect(() => {
  if (isMobile && consultationType === "video") {
    setIsChatOpen(false);
  }
}, [isMobile, consultationType]);

// Or show chat fullscreen on mobile
{
  isMobile ? (
    <div className="w-full">{/* Chat takes full width */}</div>
  ) : (
    <div className="flex gap-4">{/* Video and chat side by side */}</div>
  );
}
```

## Email Notifications

Send emails when consultations are scheduled/completed:

```tsx
// After booking appointment
const sendConsultationEmail = async (appointment) => {
  await supabase.functions.invoke("send-consultation-email", {
    body: {
      type: "scheduled",
      appointmentId: appointment.id,
      consultationType: appointment.type,
      doctorEmail: appointment.doctor_email,
      patientEmail: appointment.patient_email,
    },
  });
};

// After consultation ends
const sendFollowUpEmail = async (session) => {
  await supabase.functions.invoke("send-consultation-email", {
    body: {
      type: "completed",
      sessionId: session.id,
      duration: session.duration_seconds,
      notes: session.notes,
    },
  });
};
```

## Testing Integration

1. Add ConsultationHistory to patient dashboard
2. Start a consultation
3. Send messages from both sides
4. Verify real-time delivery
5. End consultation
6. Verify it appears in history
7. Check timestamps and duration
8. Verify doctor can see notes

## Deployment Checklist

- [ ] Run database migration on production
- [ ] Test real-time messages work
- [ ] Verify RLS policies prevent data leaks
- [ ] Monitor Supabase metrics
- [ ] Test on mobile devices
- [ ] Test video/audio permissions
- [ ] Add consultation type to booking form
- [ ] Update appointment cards with consultation type
- [ ] Add ConsultationHistory to dashboards
- [ ] Set up email notifications
- [ ] Train support team

## Performance Considerations

- Limit message history load (implement pagination)
- Archive old consultations
- Monitor Supabase connection count
- Consider caching consultation history
- Optimize database queries with indexes

## Next Steps

1. Implement WebRTC for real peer-to-peer video
2. Add recording capability
3. Implement message encryption
4. Add file sharing during consultation
5. Create prescription from consultation
6. Add follow-up appointment scheduling
7. Implement sentiment analysis
8. Create consultation reports
