import { useState, useMemo } from 'react';
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
import { Calendar, Clock, AlertCircle } from 'lucide-react';
import { generateTimeSlots, generateDatesForDayOfWeek } from '@/hooks/useAvailableSlots';
import type { AvailableSlot } from '@/hooks/useAvailableSlots';

interface SlotSelectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slots: AvailableSlot[];
  isLoading: boolean;
  onSlotSelect: (doctor: { id: string; name: string }, date: string, time: string) => void;
}

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
}: SlotSelectionModalProps) {
  const [selectedDoctor, setSelectedDoctor] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);

  // Get available doctors from slots
  const doctors = useMemo(
    () =>
      Array.from(
        new Map(slots.map((slot) => [slot.doctor_id, slot])).values()
      ).map((slot) => ({
        id: slot.doctor_id,
        name: slot.doctor_name,
        specialty: slot.specialty,
      })),
    [slots]
  );

  // Get schedules for selected doctor
  const doctorSchedules = useMemo(
    () => slots.filter((slot) => slot.doctor_id === selectedDoctor),
    [slots, selectedDoctor]
  );

  // Get available dates for selected doctor
  const availableDates = useMemo(() => {
    if (!selectedDoctor) return [];

    const dates = new Set<string>();
    doctorSchedules.forEach((schedule) => {
      const datesForWeekDay = generateDatesForDayOfWeek(schedule.day_of_week, 30);
      datesForWeekDay.forEach((date) => {
        dates.add(date.toISOString().split('T')[0]);
      });
    });

    return Array.from(dates).sort();
  }, [selectedDoctor, doctorSchedules]);

  // Get time slots for selected date
  const timeSlots = useMemo(() => {
    if (!selectedDate || !selectedDoctor) return [];

    const date = new Date(selectedDate);
    const dayOfWeek = date.getDay();

    const schedules = doctorSchedules.filter(
      (s) => s.day_of_week === dayOfWeek && s.available_slots > 0
    );

    const times = new Set<string>();
    schedules.forEach((schedule) => {
      const slots = generateTimeSlots(
        schedule.start_time,
        schedule.end_time,
        schedule.slot_duration_minutes
      );
      slots.forEach((time) => times.add(time));
    });

    return Array.from(times).sort();
  }, [selectedDate, selectedDoctor, doctorSchedules]);

  const handleConfirm = () => {
    if (!selectedDoctor || !selectedDate || !selectedTime) {
      return;
    }

    const doctor = doctors.find((d) => d.id === selectedDoctor);
    if (doctor) {
      onSlotSelect(doctor, selectedDate, selectedTime);
      // Reset state
      setSelectedDoctor(null);
      setSelectedDate(null);
      setSelectedTime(null);
      onOpenChange(false);
    }
  };

  const canConfirm = selectedDoctor && selectedDate && selectedTime;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Select Appointment Slot</DialogTitle>
          <DialogDescription>
            Choose a doctor, date, and time for your appointment
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4 max-h-96 overflow-y-auto">
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
                    <p className="text-xs text-muted-foreground">{doctor.specialty}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

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
                <div className="grid grid-cols-3 gap-2">
                  {availableDates.map((date) => {
                    const dateObj = new Date(date);
                    const dayName = dateObj.toLocaleDateString('en-US', {
                      weekday: 'short',
                    });
                    const dayNum = dateObj.getDate();
                    return (
                      <button
                        key={date}
                        onClick={() => {
                          setSelectedDate(date);
                          setSelectedTime(null);
                        }}
                        className={`p-2 rounded-lg border-2 transition-colors text-center text-xs ${
                          selectedDate === date
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-primary/50'
                        }`}
                      >
                        <div className="font-medium">{dayName}</div>
                        <div className="text-sm">{dayNum}</div>
                      </button>
                    );
                  })}
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
                  {timeSlots.map((time) => (
                    <button
                      key={time}
                      onClick={() => setSelectedTime(time)}
                      className={`p-2 rounded-lg border-2 transition-colors text-xs ${
                        selectedTime === time
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      {time}
                    </button>
                  ))}
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
                  <Calendar className="w-3 h-3" />
                  {new Date(selectedDate).toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-3 h-3" />
                  {selectedTime}
                </div>
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
