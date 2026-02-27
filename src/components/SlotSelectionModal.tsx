import { useState, useMemo, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Calendar as DateCalendar } from '@/components/ui/calendar';
import { Calendar as CalendarIcon, Clock, AlertCircle } from 'lucide-react';
import { generateTimeSlots, generateDatesForDayOfWeek } from '@/hooks/useAvailableSlots';
import type { AvailableSlot } from '@/hooks/useAvailableSlots';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { isPendingPaymentAppointmentStatus, isSlotBlockingAppointmentStatus } from '@/services/marketplaceTypes';
import { useLocaleFormatter } from '@/lib/locale';

interface SlotSelectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slots: AvailableSlot[];
  isLoading: boolean;
  onSlotSelect: (
    doctor: { id: string; name: string },
    date: string,
    time: string,
    options?: { durationMinutes?: number; consultationType?: 'chat' | 'voice' | 'video' },
  ) => void;
  doctorId?: string | null;
  mode?: 'booking' | 'reschedule';
  currentDurationMinutes?: number | null;
  selectedDurationMinutes?: number;
  onDurationChange?: (durationMinutes: number) => void;
  currentConsultationType?: 'chat' | 'voice' | 'video' | null;
  selectedConsultationType?: 'chat' | 'voice' | 'video';
  onConsultationTypeChange?: (type: 'chat' | 'voice' | 'video') => void;
}

type BookedSlotRow = {
  time: string | null;
  status: string | null;
  slot_locked_until: string | null;
};

const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Slot Selection Modal Component
 * Allows users to select from available doctor slots with time picker
 */
export function SlotSelectionModal({
  open,
  onOpenChange,
  slots,
  isLoading,
  onSlotSelect,
  doctorId,
  mode = 'booking',
  currentDurationMinutes = null,
  selectedDurationMinutes,
  onDurationChange,
  currentConsultationType = null,
  selectedConsultationType,
  onConsultationTypeChange,
}: SlotSelectionModalProps) {
  const [selectedDoctor, setSelectedDoctor] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const { formatDate, formatClockTime, formatCurrency } = useLocaleFormatter();

  // Fetch booked appointments for selected doctor and date
  const { data: bookedSlots = [] } = useQuery({
    queryKey: ['booked-slots', selectedDoctor, selectedDate],
    queryFn: async () => {
      if (!selectedDoctor || !selectedDate) return [];
      
      const { data, error } = await supabase
        .from('appointments')
        .select('time,status,slot_locked_until')
        .eq('doctor_id', selectedDoctor)
        .eq('date', selectedDate);
      
      if (error) throw error;
      const nowMs = Date.now();
      return (data || [])
        .filter((apt) => {
          const typedApt = apt as BookedSlotRow;
          if (!isSlotBlockingAppointmentStatus(typedApt.status)) return false;
          if (!isPendingPaymentAppointmentStatus(typedApt.status)) return true;
          if (!typedApt.slot_locked_until) return false;
          return new Date(typedApt.slot_locked_until).getTime() > nowMs;
        })
        .map((apt) => String((apt as BookedSlotRow).time || '').slice(0, 5));
    },
    enabled: !!selectedDoctor && !!selectedDate,
  });

  // Pricing logic
  const getPricing = (specialty: string) => {
    const isSpecialist = specialty && specialty.toLowerCase() !== 'general practice';
    return isSpecialist ? formatCurrency(8000) : formatCurrency(4000);
  };

  useEffect(() => {
    if (doctorId) {
      setSelectedDoctor(doctorId);
    }
  }, [doctorId, open]);

  // Get available doctors from slots
  const doctors = useMemo(
    () =>
      Array.from(
        new Map(slots.map((slot) => [slot.doctor_id, slot])).values()
      )
      .map((slot) => ({
        id: slot.doctor_id,
        name: slot.doctor_name,
        specialty: slot.specialty,
      }))
      .filter((doctor) => !doctorId || doctor.id === doctorId),
    [slots, doctorId]
  );

  useEffect(() => {
    if (doctorId || selectedDoctor || doctors.length !== 1) return;
    setSelectedDoctor(doctors[0].id);
  }, [doctorId, selectedDoctor, doctors]);

  // Get schedules for selected doctor
  const doctorSchedules = useMemo(
    () => slots.filter((slot) => slot.doctor_id === selectedDoctor),
    [slots, selectedDoctor]
  );

  const effectiveDurationMinutes = useMemo(() => {
    if (mode !== 'reschedule') return null;
    if (typeof selectedDurationMinutes === 'number' && Number.isFinite(selectedDurationMinutes)) {
      return selectedDurationMinutes;
    }
    if (typeof currentDurationMinutes === 'number' && Number.isFinite(currentDurationMinutes)) {
      return currentDurationMinutes;
    }
    return 30;
  }, [mode, selectedDurationMinutes, currentDurationMinutes]);

  const durationOptions = useMemo(() => {
    if (mode !== 'reschedule') return [];
    const options = [15, 30, 45, 60, 90];
    const floor = typeof currentDurationMinutes === 'number' && Number.isFinite(currentDurationMinutes)
      ? currentDurationMinutes
      : 30;
    return options.filter((value) => value >= floor);
  }, [mode, currentDurationMinutes]);

  // Get available dates for selected doctor
  // Only show dates where the doctor has schedules that are marked as available
  const availableDates = useMemo(() => {
    if (!selectedDoctor) return [];

    const dates = new Set<string>();
    doctorSchedules.forEach((schedule) => {
      // Only include dates for schedules where is_available is true
      // The view already filters by is_available = true, so we can include all
      const datesForWeekDay = generateDatesForDayOfWeek(schedule.day_of_week, 30);
      datesForWeekDay.forEach((date) => {
        dates.add(toDateKey(date));
      });
    });

    return Array.from(dates).sort();
  }, [selectedDoctor, doctorSchedules]);

  // Get time slots for selected date, excluding booked slots
  const timeSlots = useMemo(() => {
    if (!selectedDate || !selectedDoctor) return [];

    const date = new Date(`${selectedDate}T00:00:00`);
    const dayOfWeek = date.getDay();

    const schedules = doctorSchedules.filter(
      (s) => s.day_of_week === dayOfWeek
    );

    if (schedules.length === 0) {
      return [];
    }

    const times = new Set<string>();
    schedules.forEach((schedule) => {
      const slotDuration = mode === 'reschedule'
        ? (effectiveDurationMinutes || schedule.slot_duration_minutes)
        : schedule.slot_duration_minutes;

      const slots = generateTimeSlots(
        schedule.start_time,
        schedule.end_time,
        slotDuration
      );
      slots.forEach((time) => times.add(time));
    });

    // Filter out past times if selected date is today
    const now = new Date();
    const isToday = selectedDate === toDateKey(now);
    
    if (isToday) {
      const currentTime = now.toTimeString().slice(0, 5);
      return Array.from(times).filter(time => time > currentTime).sort();
    }

    return Array.from(times).sort();
  }, [selectedDate, selectedDoctor, doctorSchedules, mode, effectiveDurationMinutes]);

  const handleConfirm = () => {
    if (!selectedDoctor || !selectedDate || !selectedTime) {
      return;
    }

    const doctor = doctors.find((d) => d.id === selectedDoctor);
    if (doctor) {
      onSlotSelect(doctor, selectedDate, selectedTime, {
        durationMinutes: effectiveDurationMinutes || undefined,
        consultationType: selectedConsultationType || undefined,
      });
      // Reset state
      setSelectedDoctor(null);
      setSelectedDate(null);
      setSelectedTime(null);
      onOpenChange(false);
    }
  };

  const canConfirm = selectedDoctor && selectedDate && selectedTime;
  const availableDateSet = useMemo(() => new Set(availableDates), [availableDates]);
  const selectedCalendarDate = selectedDate ? new Date(`${selectedDate}T00:00:00`) : undefined;
  const minCalendarDate = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  }, []);
  const maxCalendarDate = useMemo(() => {
    const max = new Date();
    max.setDate(max.getDate() + 29);
    max.setHours(23, 59, 59, 999);
    return max;
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-3xl">
        <DialogHeader>
          <DialogTitle>{mode === 'reschedule' ? 'Select New Appointment Slot' : 'Select Appointment Slot'}</DialogTitle>
          <DialogDescription>
            {mode === 'reschedule'
              ? 'Select a new date/time for this appointment. Duration can only stay the same or be upgraded.'
              : 'Choose a doctor, date, and time for your appointment'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4 max-h-[75vh] overflow-y-auto">
          {/* Doctor Selection */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Doctor</Label>
            {isLoading ? (
              <div className="text-sm text-muted-foreground">Loading doctors...</div>
            ) : doctors.length === 0 ? (
              <div className="flex items-center gap-2 p-2 rounded border border-yellow-200 bg-yellow-50 text-sm text-yellow-800">
                <AlertCircle className="w-4 h-4" />
                No doctors available
              </div>
            ) : (
              <div className="grid gap-2">
                {doctors.map((doctor) => (
                  <button
                    key={doctor.id}
                    onClick={() => {
                      setSelectedDoctor(doctor.id);
                      setSelectedDate(null);
                      setSelectedTime(null);
                    }}
                    className={`text-left p-3 rounded-lg border-2 transition-colors ${
                      selectedDoctor === doctor.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <p className="font-medium text-sm">{doctor.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Specialty: {doctor.specialty}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {mode === 'reschedule' && durationOptions.length > 0 && (
            <div>
              <Label className="text-sm font-medium mb-2 block">Duration (Upgrade Only)</Label>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {durationOptions.map((duration) => {
                  const selected = (effectiveDurationMinutes || 30) === duration;
                  return (
                    <button
                      key={duration}
                      type="button"
                      className={`rounded-lg border-2 px-3 py-2 text-xs font-medium transition-colors ${
                        selected ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
                      }`}
                      onClick={() => {
                        onDurationChange?.(duration);
                        setSelectedTime(null);
                      }}
                    >
                      {duration} min
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {mode === 'reschedule' && currentConsultationType && (
            <div>
              <Label className="text-sm font-medium mb-2 block">Consultation Mode (Upgrade Only)</Label>
              <p className="text-xs text-muted-foreground mb-2">Current: {currentConsultationType.charAt(0).toUpperCase() + currentConsultationType.slice(1)}</p>
              <div className="grid grid-cols-3 gap-2">
                {['chat', 'voice', 'video'].map((type) => {
                  const typeLower = String(type).toLowerCase() as 'chat' | 'voice' | 'video';
                  const typeOrder = { 'chat': 0, 'voice': 1, 'video': 2 };
                  const currentOrder = typeOrder[currentConsultationType as keyof typeof typeOrder] ?? 0;
                  const isDisabled = typeOrder[typeLower as keyof typeof typeOrder] <= currentOrder;
                  const isSelected = selectedConsultationType === typeLower;

                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        if (!isDisabled) {
                          onConsultationTypeChange?.(typeLower);
                          setSelectedTime(null);
                        }
                      }}
                      disabled={isDisabled}
                      className={`rounded-lg border-2 px-3 py-2 text-xs font-medium transition-colors ${
                        isDisabled
                          ? 'border-muted bg-muted/30 text-muted-foreground cursor-not-allowed opacity-50'
                          : isSelected
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      {String(type).charAt(0).toUpperCase() + String(type).slice(1)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Date Selection */}
          {selectedDoctor && (
            <div>
              <Label className="text-sm font-medium mb-2 block">Date</Label>
              {availableDates.length === 0 ? (
                <div className="flex items-center gap-2 p-2 rounded border border-yellow-200 bg-yellow-50 text-sm text-yellow-800">
                  <AlertCircle className="w-4 h-4" />
                  No available dates
                </div>
              ) : (
                <div className="rounded-lg border bg-background/60">
                  <DateCalendar
                    mode="single"
                    selected={selectedCalendarDate}
                    onSelect={(date) => {
                      if (!date) return;
                      const dateKey = toDateKey(date);
                      if (!availableDateSet.has(dateKey)) return;
                      setSelectedDate(dateKey);
                      setSelectedTime(null);
                    }}
                    disabled={(date) => {
                      if (date < minCalendarDate || date > maxCalendarDate) return true;
                      return !availableDateSet.has(toDateKey(date));
                    }}
                    className="mx-auto w-full p-2"
                  />
                </div>
              )}
            </div>
          )}

          {/* Time Selection */}
          {selectedDate && (
            <div>
              <Label className="text-sm font-medium mb-2 block">Time</Label>
              {timeSlots.length === 0 ? (
                <div className="flex items-center gap-2 p-2 rounded border border-yellow-200 bg-yellow-50 text-sm text-yellow-800">
                  <AlertCircle className="w-4 h-4" />
                  No available times on this date
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {timeSlots.map((time) => {
                    const isBooked = bookedSlots.includes(time);
                    const isPast = (() => {
                      const now = new Date();
                      const slotDateTime = new Date(`${selectedDate}T${time}`);
                      return slotDateTime < now;
                    })();
                    const isDisabled = isBooked || isPast;
                    
                    return (
                      <button
                        key={time}
                        onClick={() => !isDisabled && setSelectedTime(time)}
                        disabled={isDisabled}
                        className={`p-2 rounded-lg border-2 transition-colors text-xs ${
                          isDisabled
                            ? 'border-muted bg-muted/50 text-muted-foreground cursor-not-allowed opacity-50'
                            : selectedTime === time
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-primary/50'
                        }`}
                      >
                        {formatClockTime(time)}
                        {isBooked && <span className="block text-[9px] mt-0.5">Booked</span>}
                        {isPast && !isBooked && <span className="block text-[9px] mt-0.5">Past</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Summary */}
          {selectedDoctor && selectedDate && selectedTime && (
            <div className="p-3 rounded-lg bg-success/5 border border-success/20">
              <p className="text-sm font-medium text-success mb-1">Appointment Summary</p>
              <div className="space-y-1 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span className="font-medium">Doctor:</span>
                  {doctors.find((d) => d.id === selectedDoctor)?.name}
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">Specialty:</span>
                  {doctors.find((d) => d.id === selectedDoctor)?.specialty}
                </div>
                <div className="flex items-center gap-2">
                  <CalendarIcon className="w-3 h-3" />
                  {new Date(selectedDate).toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-3 h-3" />
                  {formatClockTime(selectedTime)}
                </div>
                {mode === 'reschedule' && (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">Duration:</span>
                      {effectiveDurationMinutes || 30} min
                    </div>
                    {selectedConsultationType && (
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Mode:</span>
                        {selectedConsultationType.charAt(0).toUpperCase() + selectedConsultationType.slice(1)}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!canConfirm}>
            Confirm Slot
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
