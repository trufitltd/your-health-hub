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
import { formatSpecialtyLabel } from '@/lib/utils';
import { useLocaleFormatter } from '@/lib/locale';
import {
  isSlotBlockedByAppointments,
  normalizeDurationMinutes,
  type AppointmentIntervalRow,
} from '@/lib/appointmentIntervals';
import {
  DEFAULT_BOOKING_DURATION_MINUTES,
  DEFAULT_CONSULTATION_TYPE,
  DEFAULT_PRICING_FEATURE_FLAGS,
} from '@/config/marketplaceDefaults';
import { AvailabilityService } from '@/services/AvailabilityService';

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
  reschedulePricingPreview?: {
    proposedFinalPrice: number;
    previewLoading: boolean;
    alreadyPaidAmount: number;
    upgradeAmount: number;
    walletAppliedIfSelected: number;
    paystackDueIfSelected: number;
  } | null;
}

type BookedSlotRow = AppointmentIntervalRow & {
  time: string | null;
  duration_minutes: number | null;
};

const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const calendarClassNames = {
  cell:
    "h-9 w-9 text-center text-sm p-0 relative first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20 [&:has([aria-selected].day-outside)]:bg-primary/10 [&:has([aria-selected])]:bg-primary/15",
  day_today: "border border-primary/40 text-primary font-semibold",
  day_selected:
    "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
  day_outside:
    "day-outside text-muted-foreground opacity-50 aria-selected:bg-primary/10 aria-selected:text-muted-foreground aria-selected:opacity-40",
  day_range_middle: "aria-selected:bg-primary/15 aria-selected:text-foreground",
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
  reschedulePricingPreview = null,
}: SlotSelectionModalProps) {
  const [selectedDoctor, setSelectedDoctor] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const { formatDate, formatClockTime, formatCurrency } = useLocaleFormatter();

  const { data: allowedDurations = [] } = useQuery({
    queryKey: ['allowed-durations-slot-selection-modal'],
    queryFn: () => AvailabilityService.getAllowedDurations(),
  });

  const { data: featureFlags = DEFAULT_PRICING_FEATURE_FLAGS } = useQuery({
    queryKey: ['pricing-feature-flags-slot-selection-modal'],
    queryFn: () => AvailabilityService.getFeatureFlags(),
  });

  const durationPricingEnabled = featureFlags.duration_pricing;
  const consultationTypePricingEnabled = featureFlags.consultation_type_pricing;

  const hasConfiguredDurations = allowedDurations.length > 0;

  // Fetch blocking appointments for selected doctor and date
  const { data: bookedAppointments = [] } = useQuery({
    queryKey: ['booked-appointments', selectedDoctor, selectedDate],
    queryFn: async () => {
      if (!selectedDoctor || !selectedDate) return [];
      
      const { data, error } = await supabase
        .from('appointments')
        .select('time,duration_minutes,status,slot_locked_until')
        .eq('doctor_id', selectedDoctor)
        .eq('date', selectedDate);
      
      if (error) throw error;

      return (data || [])
        .map((apt) => apt as BookedSlotRow);
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
    if (!durationPricingEnabled) return DEFAULT_BOOKING_DURATION_MINUTES;
    if (typeof selectedDurationMinutes === 'number' && Number.isFinite(selectedDurationMinutes)) {
      return selectedDurationMinutes;
    }
    if (typeof currentDurationMinutes === 'number' && Number.isFinite(currentDurationMinutes)) {
      return currentDurationMinutes;
    }
    return DEFAULT_BOOKING_DURATION_MINUTES;
  }, [mode, selectedDurationMinutes, currentDurationMinutes, durationPricingEnabled]);

  const durationOptions = useMemo(() => {
    if (mode !== 'reschedule') return [];
    if (!durationPricingEnabled) return [];
    if (!hasConfiguredDurations) return [];

    const options = allowedDurations;
    const floor = typeof currentDurationMinutes === 'number' && Number.isFinite(currentDurationMinutes)
      ? currentDurationMinutes
      : DEFAULT_BOOKING_DURATION_MINUTES;
    const upgraded = options.filter((value) => value >= floor);

    return upgraded;
  }, [mode, currentDurationMinutes, allowedDurations, hasConfiguredDurations, durationPricingEnabled]);

  useEffect(() => {
    if (mode !== 'reschedule' || !onDurationChange) return;

    if (!durationPricingEnabled) {
      if (selectedDurationMinutes !== DEFAULT_BOOKING_DURATION_MINUTES) {
        onDurationChange(DEFAULT_BOOKING_DURATION_MINUTES);
        setSelectedTime(null);
      }
      return;
    }

    if (durationOptions.length === 0) return;
    if (
      typeof effectiveDurationMinutes === 'number'
      && durationOptions.includes(effectiveDurationMinutes)
    ) {
      return;
    }

    onDurationChange(durationOptions[0]);
    setSelectedTime(null);
  }, [mode, onDurationChange, durationOptions, effectiveDurationMinutes, durationPricingEnabled, selectedDurationMinutes]);

  useEffect(() => {
    if (mode !== 'reschedule' || !onConsultationTypeChange) return;
    if (!consultationTypePricingEnabled && selectedConsultationType !== DEFAULT_CONSULTATION_TYPE) {
      onConsultationTypeChange(DEFAULT_CONSULTATION_TYPE);
      setSelectedTime(null);
    }
  }, [mode, onConsultationTypeChange, consultationTypePricingEnabled, selectedConsultationType]);

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

  const timeSlotDurations = useMemo(() => {
    if (!selectedDate || !selectedDoctor) return new Map<string, number>();

    const date = new Date(`${selectedDate}T00:00:00`);
    const dayOfWeek = date.getDay();

    const schedules = doctorSchedules.filter(
      (s) => s.day_of_week === dayOfWeek
    );

    if (schedules.length === 0) {
      return new Map<string, number>();
    }

    const durationsByTime = new Map<string, number>();
    schedules.forEach((schedule) => {
      const slotDuration = mode === 'reschedule'
        ? (effectiveDurationMinutes || schedule.slot_duration_minutes)
        : schedule.slot_duration_minutes;
      const normalizedDuration = normalizeDurationMinutes(slotDuration, DEFAULT_BOOKING_DURATION_MINUTES);

      const slots = generateTimeSlots(
        schedule.start_time,
        schedule.end_time,
        slotDuration
      );
      slots.forEach((time) => {
        const existingDuration = durationsByTime.get(time);
        if (typeof existingDuration === 'number') {
          durationsByTime.set(time, Math.min(existingDuration, normalizedDuration));
        } else {
          durationsByTime.set(time, normalizedDuration);
        }
      });
    });

    return durationsByTime;
  }, [selectedDate, selectedDoctor, doctorSchedules, mode, effectiveDurationMinutes]);

  // Get time slots for selected date, excluding past times
  const timeSlots = useMemo(() => {
    let sorted = Array.from(timeSlotDurations.keys()).sort();

    // Filter out past times if selected date is today
    const now = new Date();
    const isToday = selectedDate === toDateKey(now);
    
    if (isToday) {
      const currentTime = now.toTimeString().slice(0, 5);
      sorted = sorted.filter((time) => time > currentTime);
    }

    return sorted;
  }, [selectedDate, timeSlotDurations]);

  const blockedStartTimes = useMemo(() => {
    if (!timeSlots.length) return new Set<string>();

    const fallbackDuration = normalizeDurationMinutes(
      effectiveDurationMinutes || DEFAULT_BOOKING_DURATION_MINUTES,
      DEFAULT_BOOKING_DURATION_MINUTES,
    );
    const blocked = new Set<string>();

    timeSlots.forEach((time) => {
      const duration = timeSlotDurations.get(time) || fallbackDuration;
      if (isSlotBlockedByAppointments(time, duration, bookedAppointments)) {
        blocked.add(time);
      }
    });

    return blocked;
  }, [timeSlots, timeSlotDurations, bookedAppointments, effectiveDurationMinutes]);

  const handleConfirm = () => {
    if (!selectedDoctor || !selectedDate || !selectedTime) {
      return;
    }
    if (mode === 'reschedule' && !durationSelectionValid) {
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

  const durationSelectionValid = mode !== 'reschedule'
    || !durationPricingEnabled
    || (typeof effectiveDurationMinutes === 'number' && allowedDurations.includes(effectiveDurationMinutes));
  const canConfirm = selectedDoctor && selectedDate && selectedTime && durationSelectionValid;
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
                      Specialty: {formatSpecialtyLabel(doctor.specialty)}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {mode === 'reschedule' && durationPricingEnabled && durationOptions.length > 0 && (
            <div>
              <Label className="text-sm font-medium mb-2 block">Duration (Upgrade Only)</Label>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {durationOptions.map((duration) => {
                  const selected = (effectiveDurationMinutes || DEFAULT_BOOKING_DURATION_MINUTES) === duration;
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

          {mode === 'reschedule' && !durationPricingEnabled && (
            <div className="rounded border border-border p-3 text-sm text-muted-foreground">
              Duration: {DEFAULT_BOOKING_DURATION_MINUTES} min (default).
            </div>
          )}

          {mode === 'reschedule' && durationPricingEnabled && !hasConfiguredDurations && (
            <div className="rounded border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              No allowed durations are configured.
            </div>
          )}

          {mode === 'reschedule' && !consultationTypePricingEnabled && (
            <div className="rounded border border-border p-3 text-sm text-muted-foreground">
              Consultation mode: {DEFAULT_CONSULTATION_TYPE.charAt(0).toUpperCase() + DEFAULT_CONSULTATION_TYPE.slice(1)} (default).
            </div>
          )}

          {mode === 'reschedule' && consultationTypePricingEnabled && currentConsultationType && (
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
                    classNames={calendarClassNames}
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
                    const isBooked = blockedStartTimes.has(time);
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
                  {formatSpecialtyLabel(doctors.find((d) => d.id === selectedDoctor)?.specialty)}
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
                      {durationPricingEnabled
                        ? `${effectiveDurationMinutes || DEFAULT_BOOKING_DURATION_MINUTES} min`
                        : `${DEFAULT_BOOKING_DURATION_MINUTES} min (default)`}
                    </div>
                    {(selectedConsultationType || !consultationTypePricingEnabled) && (
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Mode:</span>
                        {consultationTypePricingEnabled
                          ? selectedConsultationType!.charAt(0).toUpperCase() + selectedConsultationType!.slice(1)
                          : `${DEFAULT_CONSULTATION_TYPE.charAt(0).toUpperCase() + DEFAULT_CONSULTATION_TYPE.slice(1)} (default)`}
                      </div>
                    )}
                    {reschedulePricingPreview && (
                      <>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">New Price:</span>
                          {reschedulePricingPreview.previewLoading
                            ? 'Calculating...'
                            : formatCurrency(reschedulePricingPreview.proposedFinalPrice)}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">Already Paid:</span>
                          {formatCurrency(reschedulePricingPreview.alreadyPaidAmount)}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">Balance to Pay:</span>
                          {formatCurrency(reschedulePricingPreview.upgradeAmount)}
                        </div>
                        {reschedulePricingPreview.upgradeAmount > 0 && (
                          <div className="rounded-md border border-primary/20 bg-primary/5 px-2 py-1 text-[11px] text-primary">
                            {reschedulePricingPreview.paystackDueIfSelected > 0
                              ? `Wallet can apply ${formatCurrency(reschedulePricingPreview.walletAppliedIfSelected)} and remaining ${formatCurrency(reschedulePricingPreview.paystackDueIfSelected)} will continue via Paystack automatically.`
                              : `Wallet can fully cover this upgrade amount.`}
                          </div>
                        )}
                      </>
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
