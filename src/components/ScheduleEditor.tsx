import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useSchedules } from '@/hooks/useSchedules';
import { motion } from 'framer-motion';

interface ScheduleEditorProps {
  doctorId: string;
  onScheduleUpdate?: () => void;
}

export const ScheduleEditor = ({ doctorId, onScheduleUpdate }: ScheduleEditorProps) => {
  const { formattedSchedule, isLoading, isUpdating, isToggling, createDefaultSchedule, isCreatingDefault } = useSchedules(doctorId);
  const [editingDay, setEditingDay] = useState<number | null>(null);
  // Local state to manage multiple slots while editing a day
  const [localSlots, setLocalSlots] = useState<Array<{ id?: string; start: string; end: string }>>([]);
  const [newStart, setNewStart] = useState('09:00');
  const [newEnd, setNewEnd] = useState('17:00');
  const [validationError, setValidationError] = useState<string | null>(null);
  const { upsertSchedule, toggleAvailability, deleteSchedule } = useSchedules(doctorId);

  const handleEditDay = (dayOfWeek: number, currentStart?: string, currentEnd?: string) => {
    setEditingDay(dayOfWeek);
    // Initialize localSlots from formattedSchedule for this day
    const day = formattedSchedule.find(d => d.dayOfWeek === dayOfWeek);
    const slots = (day?.schedules || []).map(s => ({ id: s.id, start: s.start_time, end: s.end_time }));
    setLocalSlots(sortSlots(slots));
    setNewStart(currentStart || '09:00');
    setNewEnd(currentEnd || '17:00');
    setValidationError(null);
  };

  const sortSlots = (slots: Array<{ id?: string; start: string; end: string }>) => {
    return slots.slice().sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
  };

  // Editing an existing slot
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [editingStart, setEditingStart] = useState('09:00');
  const [editingEnd, setEditingEnd] = useState('09:30');

  const handleStartEdit = (slot: { id?: string; start: string; end: string }) => {
    setEditingSlotId(slot.id || null);
    setEditingStart(slot.start);
    setEditingEnd(slot.end);
    setValidationError(null);
  };

  // Helpers for validation
  const timeToMinutes = (t: string) => {
    const [hh, mm] = t.split(':').map(Number);
    return hh * 60 + mm;
  };

  const isOnHalfHour = (t: string) => {
    const mm = Number(t.split(':')[1] || 0);
    return mm % 30 === 0;
  };

  const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) => {
    return aStart < bEnd && bStart < aEnd;
  };

  const handleAddSlot = async () => {
    setValidationError(null);
    if (!editingDay) return;
    if (!newStart || !newEnd) {
      setValidationError('Please provide both start and end times');
      return;
    }

    if (!isOnHalfHour(newStart) || !isOnHalfHour(newEnd)) {
      setValidationError('Times must be on the hour or half hour (e.g. 09:00 or 09:30)');
      return;
    }

    const s = timeToMinutes(newStart);
    const e = timeToMinutes(newEnd);
    if (s >= e) {
      setValidationError('End time must be after start time');
      return;
    }

    // Check overlap with localSlots
    for (const slot of localSlots) {
      const os = timeToMinutes(slot.start);
      const oe = timeToMinutes(slot.end);
      if (overlaps(s, e, os, oe)) {
        setValidationError('New slot overlaps with existing slot');
        return;
      }
    }

    try {
      // Insert new slot and get created record
      const created = await upsertSchedule({
        day_of_week: editingDay,
        start_time: newStart,
        end_time: newEnd,
        slot_duration_minutes: 30,
        is_available: true,
      });

      // Add to local list with returned id and sort
      setLocalSlots(prev => sortSlots([...prev, { id: created.id, start: newStart, end: newEnd }]));
      setNewStart('09:00');
      setNewEnd('17:00');
    } catch (err) {
      setValidationError('Failed to add slot');
    }
  };

  const handleRemoveSlot = async (slotId?: string, start?: string, end?: string) => {
    // If slot has an id, delete from backend; otherwise just remove locally
    try {
      if (slotId) {
        await deleteSchedule(slotId);
      }
      setLocalSlots(prev => sortSlots(prev.filter(s => !(s.id ? s.id === slotId : s.start === start && s.end === end))));
    } catch (err) {
      setValidationError('Failed to remove slot');
    }
  };

  const handleSaveEdit = async () => {
    if (!editingDay) return;
    setValidationError(null);
    if (!editingStart || !editingEnd) {
      setValidationError('Please provide both start and end times');
      return;
    }
    if (!isOnHalfHour(editingStart) || !isOnHalfHour(editingEnd)) {
      setValidationError('Times must be on the hour or half hour (e.g. 09:00 or 09:30)');
      return;
    }
    const s = timeToMinutes(editingStart);
    const e = timeToMinutes(editingEnd);
    if (s >= e) {
      setValidationError('End time must be after start time');
      return;
    }

    // Check overlap with other slots
    for (const slot of localSlots) {
      if (slot.id === editingSlotId) continue;
      const os = timeToMinutes(slot.start);
      const oe = timeToMinutes(slot.end);
      if (overlaps(s, e, os, oe)) {
        setValidationError('Edited slot overlaps with existing slot');
        return;
      }
    }

    try {
      // If we have an id, update; otherwise insert a new slot and replace best-effort
      if (editingSlotId) {
        const updated = await upsertSchedule({
          id: editingSlotId,
          day_of_week: editingDay,
          start_time: editingStart,
          end_time: editingEnd,
          slot_duration_minutes: 30,
          is_available: true,
        });
        setLocalSlots(prev => sortSlots(prev.map(s => s.id === editingSlotId ? { id: updated.id, start: updated.start_time, end: updated.end_time } : s)));
      } else {
        const created = await upsertSchedule({
          day_of_week: editingDay,
          start_time: editingStart,
          end_time: editingEnd,
          slot_duration_minutes: 30,
          is_available: true,
        });
        setLocalSlots(prev => sortSlots(prev.map(s => (s.start === newStart && s.end === newEnd) ? { id: created.id, start: created.start_time, end: created.end_time } : s)));
      }

      setEditingSlotId(null);
    } catch (err) {
      setValidationError('Failed to save slot edit');
    }
  };

  const handleToggleDay = (dayOfWeek: number, currentEnabled: boolean) => {
    console.log(`[ScheduleEditor] Toggling day ${dayOfWeek} from ${currentEnabled} to ${!currentEnabled}`);
    toggleAvailability({ dayOfWeek, isAvailable: !currentEnabled });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Weekly Schedule</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            Loading schedule...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Weekly Availability</CardTitle>
          <CardDescription>Set your consultation hours for each day</CardDescription>
        </div>
        {formattedSchedule.length === 0 && (
          <Button
            onClick={() => createDefaultSchedule()}
            disabled={isCreatingDefault}
            size="sm"
          >
            {isCreatingDefault ? 'Creating...' : 'Create Default Schedule'}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {formattedSchedule.map((day, index) => (
            <motion.div
              key={day.dayOfWeek}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <div className="flex items-center justify-between p-4 rounded-xl border border-border hover:border-primary/30 transition-colors">
                <div className="flex items-center gap-4 flex-1">
                  <Switch
                    checked={day.enabled}
                    onCheckedChange={() => handleToggleDay(day.dayOfWeek, day.enabled)}
                    disabled={isToggling}
                  />
                  <div className="flex-1">
                    <p className="font-semibold">{day.day}</p>
                    {day.enabled && day.slots.length > 0 ? (
                      <div className="flex gap-2 mt-1 flex-wrap">
                        {day.slots.map((slot, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">
                            {slot}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Not available</p>
                    )}
                  </div>
                </div>

                {day.enabled && (
                  <Dialog open={editingDay === day.dayOfWeek} onOpenChange={(open) => !open && setEditingDay(null)}>
                    <DialogTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const firstSlot = day.schedules?.[0];
                          handleEditDay(
                            day.dayOfWeek,
                            firstSlot?.start_time,
                            firstSlot?.end_time
                          );
                        }}
                      >
                        Edit
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Edit {day.day} Schedule</DialogTitle>
                        <DialogDescription>
                          Add multiple time slots for {day.day} (30-minute granularity)
                        </DialogDescription>
                      </DialogHeader>

                      <div className="space-y-4 py-4">
                        {/* Existing slots list */}
                        <div>
                          <Label>Existing Slots</Label>
                          <div className="mt-2 space-y-2">
                            {localSlots.length === 0 ? (
                              <p className="text-sm text-muted-foreground">No slots defined for this day.</p>
                            ) : (
                              localSlots.map((slot, idx) => (
                                <div key={slot.id || `${slot.start}-${slot.end}-${idx}`} className="flex items-center justify-between p-2 rounded border border-border">
                                  {editingSlotId === slot.id || (editingSlotId === null && !slot.id && editingStart === slot.start && editingEnd === slot.end) ? (
                                    <div className="flex-1 grid grid-cols-3 gap-2 items-center">
                                      <Input type="time" step={1800} value={editingStart} onChange={(e) => setEditingStart(e.target.value)} />
                                      <Input type="time" step={1800} value={editingEnd} onChange={(e) => setEditingEnd(e.target.value)} />
                                      <div className="flex gap-2">
                                        <Button size="sm" onClick={handleSaveEdit}>Save</Button>
                                        <Button size="sm" variant="outline" onClick={() => setEditingSlotId(null)}>Cancel</Button>
                                      </div>
                                    </div>
                                  ) : (
                                    <>
                                      <div className="text-sm">{slot.start} - {slot.end}</div>
                                      <div className="flex items-center gap-2">
                                        <Button size="sm" variant="ghost" onClick={() => handleStartEdit(slot)}>Edit</Button>
                                        <Button size="sm" variant="ghost" onClick={() => handleRemoveSlot(slot.id, slot.start, slot.end)}>
                                          <X className="w-4 h-4" />
                                        </Button>
                                      </div>
                                    </>
                                  )}
                                </div>
                              ))
                            )}
                          </div>
                        </div>

                        {/* Add new slot */}
                        <div>
                          <Label>New Slot</Label>
                          <div className="grid grid-cols-3 gap-2 mt-2 items-end">
                            <div>
                              <Input
                                id="new-start"
                                type="time"
                                step={1800}
                                value={newStart}
                                onChange={(e) => setNewStart(e.target.value)}
                              />
                            </div>
                            <div>
                              <Input
                                id="new-end"
                                type="time"
                                step={1800}
                                value={newEnd}
                                onChange={(e) => setNewEnd(e.target.value)}
                              />
                            </div>
                            <div>
                              <Button size="sm" onClick={handleAddSlot}>+ Add</Button>
                            </div>
                          </div>
                          {validationError && <p className="text-sm text-destructive mt-2">{validationError}</p>}
                        </div>

                        <div className="flex gap-3 pt-2">
                          <Button
                            variant="outline"
                            onClick={() => setEditingDay(null)}
                          >
                            Close
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
