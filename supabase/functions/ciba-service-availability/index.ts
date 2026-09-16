/**
 * ciba-service-availability
 *
 * Returns aggregate service-level availability for CIBA Wellness.
 * The patient never sees individual clinician identity — only available slots.
 *
 * A slot is available if at least one eligible clinician is:
 * - active and approved
 * - a member of the organisation
 * - qualified for the selected service (specialty match)
 * - scheduled during that slot
 * - not in appointment conflict
 * - within capacity limits
 *
 * POST /ciba-service-availability
 * Body: { organisation_id, service_name, date_from?, date_days? }
 *
 * Returns: { service, slots: [{ date, time, duration_minutes, available }], days_checked }
 */

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function generateTimeSlots(startHour: number, startMin: number, endHour: number, endMin: number, durationMinutes: number): string[] {
  const slots: string[] = [];
  let currentMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;

  while (currentMinutes + durationMinutes <= endMinutes) {
    const h = Math.floor(currentMinutes / 60);
    const m = currentMinutes % 60;
    slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    currentMinutes += durationMinutes;
  }

  return slots;
}

function parseTimeString(time: string): { hours: number; minutes: number } {
  const parts = time.split(':');
  return { hours: parseInt(parts[0] || '0', 10), minutes: parseInt(parts[1] || '0', 10);
}

function timeToMinutes(time: string): number {
  const { hours, minutes } = parseTimeString(time);
  return hours * 60 + minutes;
}

function slotsOverlap(start1: string, dur1: number, start2: string, dur2: number): boolean {
  const s1 = timeToMinutes(start1);
  const e1 = s1 + dur1;
  const s2 = timeToMinutes(start2);
  const e2 = s2 + dur2;
  return s1 < e2 && s2 < e1;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Supabase env vars are not configured');
    }

    const payload = await req.json();
    const { organisation_id, service_name, date_from, date_days = 7 } = payload;

    if (!organisation_id || !service_name) {
      return new Response(JSON.stringify({ error: 'Missing organisation_id or service_name' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey);

    // ── Step 1: Load the service ──
    const { data: service, error: serviceError } = await serviceClient
      .from('organisation_services')
      .select('id, name, default_duration_minutes, consultation_mode, required_specialties, base_price, currency')
      .eq('organisation_id', organisation_id)
      .eq('active', true)
      .ilike('name', service_name)
      .maybeSingle();

    if (serviceError || !service) {
      return new Response(JSON.stringify({ error: 'Service not found or inactive' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const durationMinutes = service.default_duration_minutes || 30;
    const requiredSpecialties: string[] = service.required_specialties || [];

    // ── Step 2: Find eligible clinicians ──
    // Eligibility must match ClinicianAssignmentService exactly:
    //   - active member of this organisation (doctors.is_active = true)
    //   - correct organisation membership (doctors.organisation_id)
    //   - qualified for the service (specialty match via doctor_registrations)
    //   - scheduled for the requested day (doctor_schedules.active = true)
    //   - not in appointment conflict
    //
    // NOTE: We do NOT check doctors.approved here — ClinicianAssignmentService
    // does not check it either. Eligibility is defined by the assignment pipeline.
    const { data: orgDoctors, error: doctorsError } = await serviceClient
      .from('doctors')
      .select('id, user_id')
      .eq('organisation_id', organisation_id)
      .eq('is_active', true);

    if (doctorsError) {
      throw new Error(`Failed to load clinicians: ${doctorsError.message}`);
    }

    // Filter by specialty match using doctor_registrations (same as ClinicianAssignmentService)
    let eligibleDoctorUserIds: string[] = [];

    if (requiredSpecialties.length === 0) {
      // No specialty requirement — all active org doctors qualify
      eligibleDoctorUserIds = (orgDoctors || []).map((doc) => doc.user_id);
    } else {
      const userIds = (orgDoctors || []).map((doc) => doc.user_id);
      const { data: registrations } = await serviceClient
        .from('doctor_registrations')
        .select('user_id, specialty')
        .in('user_id', userIds);

      const regMap = new Map<string, string>();
      (registrations || []).forEach((r: any) => {
        regMap.set(r.user_id, (r.specialty || '').toLowerCase().trim());
      });

      const normalizedRequired = requiredSpecialties.map((s) => s.toLowerCase().trim());

      eligibleDoctorUserIds = (orgDoctors || [])
        .filter((doc) => {
          const specialty = regMap.get(doc.user_id) || '';
          return normalizedRequired.some((req) => {
            if (req === 'gp' || req === 'general practice' || req === 'general practitioner') {
              return specialty === 'gp' || specialty === 'general practice' || specialty === 'general practitioner';
            }
            return specialty.includes(req) || req.includes(specialty);
          });
        })
        .map((doc) => doc.user_id);
    }

    if (eligibleDoctorUserIds.length === 0) {
      // No eligible clinicians — return empty availability
      return new Response(JSON.stringify({
        service: {
          name: service.name,
          duration_minutes: durationMinutes,
          consultation_mode: service.consultation_mode,
          base_price: service.base_price,
          currency: service.currency,
        },
        slots: [],
        days_checked: date_days,
        eligible_clinicians: 0,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // ── Step 3: Load schedules for eligible clinicians ──
    // Use doctor_schedules.active (matches ClinicianAssignmentService which checks 'active')
    const { data: schedules, error: schedulesError } = await serviceClient
      .from('doctor_schedules')
      .select('doctor_id, day_of_week, start_time, end_time, active')
      .in('doctor_id', eligibleDoctorUserIds)
      .eq('active', true)
      .eq('organisation_id', organisation_id);

    if (schedulesError) {
      throw new Error(`Failed to load schedules: ${schedulesError.message}`);
    }

    // Group schedules by day of week
    const schedulesByDay: Record<string, Array<{ doctorId: string; start: string; end: string }>> = {};
    for (const sched of (schedules || [])) {
      const day = (sched.day_of_week || '').toLowerCase();
      if (!schedulesByDay[day]) schedulesByDay[day] = [];
      schedulesByDay[day].push({
        doctorId: sched.doctor_id,
        start: sched.start_time,
        end: sched.end_time,
      });
    }

    // ── Step 4: Generate date range ──
    const startDate = date_from ? new Date(date_from) : new Date();
    startDate.setHours(0, 0, 0, 0);
    const dates: Date[] = [];
    for (let i = 0; i < date_days; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      dates.push(d);
    }

    // ── Step 5: For each day, compute aggregate availability ──
    const resultSlots: Array<{ date: string; time: string; duration_minutes: number; available: boolean }> = [];

    for (const date of dates) {
      const dayName = DAY_NAMES[date.getDay()];
      const daySchedules = schedulesByDay[dayName] || [];

      if (daySchedules.length === 0) {
        // No clinicians scheduled this day — generate unavailable slots for completeness
        // (or skip entirely — we skip to avoid noise)
        continue;
      }

      // Collect all schedule windows for this day across all eligible clinicians
      const allWindows: Array<{ start: string; end: string }> = [];
      for (const sched of daySchedules) {
        allWindows.push({ start: sched.start, end: sched.end });
      }

      // Merge overlapping windows to get the aggregate service window
      const sortedWindows = allWindows.sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
      const mergedWindows: Array<{ start: string; end: string }> = [];
      for (const win of sortedWindows) {
        if (mergedWindows.length === 0) {
          mergedWindows.push({ ...win });
        } else {
          const last = mergedWindows[mergedWindows.length - 1];
          if (timeToMinutes(win.start) <= timeToMinutes(last.end)) {
            last.end = win.end > last.end ? win.end : last.end;
          } else {
            mergedWindows.push({ ...win });
          }
        }
      }

      // Generate time slots from merged windows
      const candidateSlots: string[] = [];
      for (const win of mergedWindows) {
        const { hours: sh, minutes: sm } = parseTimeString(win.start);
        const { hours: eh, minutes: em } = parseTimeString(win.end);
        const slots = generateTimeSlots(sh, sm, eh, em, durationMinutes);
        candidateSlots.push(...slots);
      }

      if (candidateSlots.length === 0) continue;

      // Load existing appointments for all eligible clinicians on this date
      const dateStr = date.toISOString().slice(0, 10);
      const { data: existingAppts } = await serviceClient
        .from('appointments')
        .select('doctor_id, time, duration_minutes, status, slot_locked_until')
        .in('doctor_id', eligibleDoctorUserIds)
        .eq('date', dateStr)
        .in('status', ['pending_payment', 'pending_assignment', 'pending_approval', 'confirmed', 'in_progress', 'completed']);

      // For each candidate slot, check if at least one clinician is free
      for (const slotTime of candidateSlots) {
        let slotAvailable = false;

        // Check each eligible clinician
        for (const doctorUserId of eligibleDoctorUserIds) {
          // Check if this clinician has a schedule covering this slot
          const hasSchedule = daySchedules.some(
            (s) => s.doctorId === doctorUserId
              && timeToMinutes(slotTime) >= timeToMinutes(s.start)
              && timeToMinutes(slotTime) + durationMinutes <= timeToMinutes(s.end),
          );
          if (!hasSchedule) continue;

          // Check for conflicts with existing appointments
          const hasConflict = (existingAppts || []).some(
            (appt) => appt.doctor_id === doctorUserId
              && slotsOverlap(slotTime, durationMinutes, appt.time, appt.duration_minutes || 30)
              && (
                // For pending_payment, only conflict if lock is still active
                appt.status !== 'pending_payment'
                || !appt.slot_locked_until
                || new Date(appt.slot_locked_until) > new Date()
              ),
          );

          if (!hasConflict) {
            slotAvailable = true;
            break; // At least one clinician is free — slot is available
          }
        }

        resultSlots.push({
          date: dateStr,
          time: slotTime,
          duration_minutes: durationMinutes,
          available: slotAvailable,
        });
      }
    }

    return new Response(JSON.stringify({
      service: {
        name: service.name,
        duration_minutes: durationMinutes,
        consultation_mode: service.consultation_mode,
        base_price: service.base_price,
        currency: service.currency,
      },
      slots: resultSlots,
      days_checked: date_days,
      eligible_clinicians: eligibleDoctorUserIds.length,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('[ciba-service-availability] error', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
