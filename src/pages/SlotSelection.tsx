import { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import { Layout } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { generateTimeSlots, generateDatesForDayOfWeek } from '@/hooks/useAvailableSlots';
import { toast } from '@/components/ui/use-toast';
import { Calendar, Clock, ChevronRight, AlertCircle, CreditCard } from 'lucide-react';
import { usePaystackPayment } from '@/hooks/usePaystackPayment';

interface LocationState {
  doctorId?: string;
  doctorName?: string;
  specialty?: string;
  profilePicture?: string;
}

export default function SlotSelection() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const state = location.state as LocationState;

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const { initializePayment } = usePaystackPayment();

  const paystackPublicKey = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || '';

  // Scroll to top when page loads
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Auto-scroll to time selection when date is selected
  useEffect(() => {
    if (selectedDate) {
      setTimeout(() => {
        const timeSection = document.getElementById('time-selection');
        if (timeSection) {
          timeSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    }
  }, [selectedDate]);

  // Auto-scroll to summary when time is selected
  useEffect(() => {
    if (selectedTime) {
      setTimeout(() => {
        const summarySection = document.getElementById('appointment-summary');
        if (summarySection) {
          summarySection.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    }
  }, [selectedTime]);

  // Redirect if no doctor selected
  if (!state?.doctorId) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-12">
          <Card className="max-w-md mx-auto">
            <CardContent className="pt-6">
              <div className="text-center">
                <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
                <p className="text-muted-foreground mb-4">No doctor selected</p>
                <Button onClick={() => navigate('/doctor-discovery')}>
                  Back to Doctor Discovery
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  // Fetch doctor schedules and availability
  const { data: schedules = [], isLoading: schedulesLoading } = useQuery({
    queryKey: ['doctor-schedules', state.doctorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('doctor_schedules')
        .select('*')
        .eq('doctor_id', state.doctorId);

      if (error) {
        console.error('Error fetching schedules:', error);
        throw error;
      }
      
      console.log('Fetched schedules:', data);
      return data || [];
    },
  });

  // Get available dates (next 30 days)
  const availableDates = useMemo(() => {
    if (!schedules.length) {
      console.log('No schedules available');
      return [];
    }

    console.log('Processing schedules:', schedules);
    const dates = new Set<string>();
    const today = new Date();

    // Generate dates for the next 30 days
    for (let i = 0; i < 30; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      // Get day of week as number (0=Sunday, 1=Monday, etc.)
      const dayIndex = date.getDay();

      console.log(`Checking date ${dateStr}, dayOfWeek: ${dayIndex}`);

      // Check if doctor works on this day AND has available schedules
      const hasSchedule = schedules.some(s => {
        console.log(`Schedule day_of_week: "${s.day_of_week}", is_available: ${s.is_available}, type: ${typeof s.day_of_week}`);
        return s.day_of_week !== null && parseInt(String(s.day_of_week)) === dayIndex && s.is_available === true;
      });

      if (hasSchedule) {
        console.log(`Adding date: ${dateStr}`);
        dates.add(dateStr);
      }
    }

    console.log('Available dates:', Array.from(dates));
    return Array.from(dates).sort();
  }, [schedules]);

  // Get available times for selected date
  const availableTimes = useMemo(() => {
    if (!selectedDate || !schedules.length) return [];

    const date = new Date(selectedDate);
    // Get day of week as number (0=Sunday, 1=Monday, etc.)
    const dayIndex = date.getDay();

    const daySchedules = schedules.filter(s => 
      s.day_of_week !== null && 
      parseInt(String(s.day_of_week)) === dayIndex && 
      s.is_available === true
    );

    const times = new Set<string>();
    daySchedules.forEach(schedule => {
      const slots = generateTimeSlots(
        schedule.start_time,
        schedule.end_time,
        schedule.slot_duration_minutes
      );
      slots.forEach(time => times.add(time));
    });

    return Array.from(times).sort();
  }, [selectedDate, schedules]);

  const handleConfirm = async () => {
    if (!selectedDate || !selectedTime || !user) {
      toast({ title: 'Missing selection', description: 'Please select both date and time' });
      return;
    }

    if (!paystackPublicKey) {
      toast({ 
        title: 'Configuration Error', 
        description: 'Payment gateway not configured. Please contact support.' 
      });
      return;
    }

    // Calculate consultation fee
    const isSpecialist = state.specialty && !state.specialty.toLowerCase().includes('general');
    const consultationFee = isSpecialist ? 10000 : 5000;
    const amountInKobo = consultationFee * 100; // Convert to kobo

    // Generate unique reference
    const reference = `APT-${Date.now()}-${user.id.substring(0, 8)}`;

    // Fetch user email from profiles table
    const { data: profile } = await supabase
      .from('profiles')
      .select('email')
      .eq('user_id', user.id)
      .single();

    const userEmail = profile?.email || user.email || '';

    // Initialize Paystack payment
    initializePayment({
      email: userEmail,
      amount: amountInKobo,
      reference,
      publicKey: paystackPublicKey,
      metadata: {
        custom_fields: [
          {
            display_name: 'Doctor',
            variable_name: 'doctor_name',
            value: state.doctorName || '',
          },
          {
            display_name: 'Appointment Date',
            variable_name: 'appointment_date',
            value: selectedDate,
          },
          {
            display_name: 'Appointment Time',
            variable_name: 'appointment_time',
            value: selectedTime,
          },
        ],
      },
      onSuccess: async (response) => {
        setIsConfirming(true);
        try {
          // Create appointment after successful payment
          const { error } = await supabase
            .from('appointments')
            .insert([
              {
                patient_id: user.id,
                doctor_id: state.doctorId,
                date: selectedDate,
                time: selectedTime,
                status: 'confirmed',
                notes: `Payment successful. Reference: ${response.reference}`,
              }
            ]);

          if (error) {
            console.error('Booking error:', error);
            toast({ 
              title: 'Booking failed', 
              description: 'Payment successful but failed to create appointment. Please contact support with reference: ' + response.reference
            });
            return;
          }

          toast({ 
            title: 'Appointment booked!', 
            description: `Your appointment with ${state.doctorName} on ${new Date(selectedDate).toLocaleDateString()} at ${selectedTime} has been confirmed.` 
          });

          navigate('/patient-portal?tab=appointments');
        } catch (error) {
          console.error('Booking error:', error);
          toast({ 
            title: 'Error', 
            description: 'Payment successful but an error occurred. Please contact support with reference: ' + response.reference
          });
        } finally {
          setIsConfirming(false);
        }
      },
      onClose: () => {
        toast({ 
          title: 'Payment cancelled', 
          description: 'You cancelled the payment process.' 
        });
      },
    });
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  return (
    <Layout>
      <div className="min-h-screen bg-muted/30 py-8 md:py-12">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            {/* Header with doctor info */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-8"
            >
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(-1)}
                className="mb-6"
              >
                ← Back
              </Button>

              <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <Avatar className="w-16 h-16">
                      <AvatarImage src={state.profilePicture} />
                      <AvatarFallback className="bg-primary/10 text-primary text-lg">
                        {state.doctorName?.split(' ').map(n => n[0]).join('') || 'DR'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <h1 className="text-2xl font-bold">{state.doctorName}</h1>
                      <p className="text-muted-foreground">{state.specialty}</p>
                    </div>
                    <Badge className="bg-primary text-primary-foreground">Available</Badge>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Progress Steps */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="mb-8 flex items-center justify-between"
            >
              {[
                { step: 1, label: 'Date' },
                { step: 2, label: 'Time' },
                { step: 3, label: 'Confirm' },
              ].map((item, index) => (
                <div key={item.step} className="flex items-center flex-1">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm ${
                    selectedDate && selectedTime && item.step <= 3 ? 'bg-primary text-primary-foreground' :
                    (item.step === 1 && selectedDate) || (item.step === 2 && selectedTime) ? 'bg-primary text-primary-foreground' :
                    'bg-muted text-muted-foreground'
                  }`}>
                    {item.step}
                  </div>
                  <p className={`ml-2 text-sm font-medium ${
                    (item.step === 1 && selectedDate) || (item.step === 2 && selectedTime) ? 'text-primary' : 'text-muted-foreground'
                  }`}>
                    {item.label}
                  </p>
                  {index < 2 && (
                    <div className={`flex-1 h-1 mx-2 rounded ${
                      (item.step === 1 && selectedDate) || (item.step === 2 && selectedTime) ? 'bg-primary' : 'bg-muted'
                    }`} />
                  )}
                </div>
              ))}
            </motion.div>

            {/* Date Selection */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mb-8"
            >
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="w-5 h-5" />
                    Select Date
                  </CardTitle>
                  <CardDescription>Choose your preferred appointment date</CardDescription>
                </CardHeader>
                <CardContent>
                  {schedulesLoading ? (
                    <div className="text-center py-8">
                      <p className="text-muted-foreground">Loading available dates...</p>
                    </div>
                  ) : availableDates.length === 0 ? (
                    <div className="text-center py-8">
                      <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-muted-foreground">No available dates</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                      {availableDates.map(date => (
                        <motion.button
                          key={date}
                          whileHover={{ scale: 1.05 }}
                          onClick={() => {
                            setSelectedDate(date);
                            setSelectedTime(null); // Reset time when date changes
                          }}
                          className={`p-3 rounded-lg border-2 transition-all text-center ${
                            selectedDate === date
                              ? 'border-primary bg-primary/10 text-primary font-semibold'
                              : 'border-border hover:border-primary/50 text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          <div className="text-xs">{formatDate(date).split(',')[0]}</div>
                          <div className="text-sm font-medium">{new Date(date).getDate()}</div>
                          <div className="text-xs">{formatDate(date).split(' ')[1]}</div>
                        </motion.button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>

            {/* Time Selection */}
            {selectedDate && (
              <motion.div
                id="time-selection"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="mb-8"
              >
                <Card className="border-primary/30 bg-primary/5">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Clock className="w-5 h-5" />
                      Select Time
                    </CardTitle>
                    <CardDescription>
                      Available times on {new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {availableTimes.length === 0 ? (
                      <div className="text-center py-8">
                        <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                        <p className="text-muted-foreground">No available times for this date</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                        {availableTimes.map(time => (
                          <motion.button
                            key={time}
                            whileHover={{ scale: 1.05 }}
                            onClick={() => setSelectedTime(time)}
                            className={`p-3 rounded-lg border-2 transition-all text-center text-sm font-medium ${
                              selectedTime === time
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-border hover:border-primary/50 text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            {time}
                          </motion.button>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Confirmation Summary */}
            {selectedDate && selectedTime && (
              <motion.div
                id="appointment-summary"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="mb-8"
              >
                <Card className="border-success/30 bg-success/5">
                  <CardHeader>
                    <CardTitle className="text-success">Appointment Summary</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 rounded-lg bg-background/50">
                        <span className="text-muted-foreground">Doctor</span>
                        <span className="font-medium">{state.doctorName}</span>
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-lg bg-background/50">
                        <span className="text-muted-foreground">Date</span>
                        <span className="font-medium">{new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-lg bg-background/50">
                        <span className="text-muted-foreground">Time</span>
                        <span className="font-medium">{selectedTime}</span>
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-lg bg-primary/10 border border-primary/20">
                        <span className="text-muted-foreground">Consultation Fee</span>
                        <span className="font-semibold text-primary">₦{state.specialty?.toLowerCase().includes('general') ? '5,000' : '10,000'}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Action Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="flex gap-4 justify-end"
            >
              <Button variant="outline" onClick={() => navigate(-1)}>
                Cancel
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={!selectedDate || !selectedTime || isConfirming}
                className="gap-2"
              >
                <CreditCard className="w-4 h-4" />
                {isConfirming ? 'Processing...' : 'Pay & Confirm Booking'}
                <ChevronRight className="w-4 h-4" />
              </Button>
            </motion.div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
