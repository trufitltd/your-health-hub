import { useState } from 'react';
import { Clock, X } from 'lucide-react';
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
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const { upsertSchedule, toggleAvailability } = useSchedules(doctorId);

  const handleEditDay = (dayOfWeek: number, currentStart?: string, currentEnd?: string) => {
    setEditingDay(dayOfWeek);
    if (currentStart) setStartTime(currentStart);
    if (currentEnd) setEndTime(currentEnd);
  };

  const handleSaveSchedule = () => {
    if (!startTime || !endTime) {
      alert('Please fill in both start and end times');
      return;
    }

    if (startTime >= endTime) {
      alert('End time must be after start time');
      return;
    }

    upsertSchedule({
      day_of_week: editingDay!,
      start_time: startTime,
      end_time: endTime,
    });

    setEditingDay(null);
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
                          Set consultation hours for {day.day}
                        </DialogDescription>
                      </DialogHeader>

                      <div className="space-y-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="start-time">Start Time</Label>
                            <Input
                              id="start-time"
                              type="time"
                              value={startTime}
                              onChange={(e) => setStartTime(e.target.value)}
                            />
                          </div>
                          <div>
                            <Label htmlFor="end-time">End Time</Label>
                            <Input
                              id="end-time"
                              type="time"
                              value={endTime}
                              onChange={(e) => setEndTime(e.target.value)}
                            />
                          </div>
                        </div>

                        <div className="flex gap-2 text-sm text-muted-foreground">
                          <Clock className="w-4 h-4" />
                          <span>
                            Consultation duration: 30 minutes per slot
                          </span>
                        </div>

                        <div className="flex gap-3 pt-2">
                          <Button
                            variant="outline"
                            onClick={() => setEditingDay(null)}
                          >
                            Cancel
                          </Button>
                          <Button
                            onClick={handleSaveSchedule}
                            disabled={isUpdating}
                          >
                            {isUpdating ? 'Saving...' : 'Save Schedule'}
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
