import { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import { Layout } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Calendar as DateCalendar } from '@/components/ui/calendar';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { generateTimeSlots } from '@/hooks/useAvailableSlots';
import { toast } from '@/components/ui/use-toast';
import { Calendar as CalendarIcon, Clock, ChevronRight, AlertCircle, CreditCard, Wallet } from 'lucide-react';
import { usePaystackPayment } from '@/hooks/usePaystackPayment';
import { formatSpecialtyLabel } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';
import { useLocaleFormatter } from '@/lib/locale';
import { AvailabilityService } from '@/services/AvailabilityService';
import { BookingService } from '@/services/BookingService';
import { PatientWalletService } from '@/services/PatientWalletService';
import {
  isSlotBlockedByAppointments,
  normalizeDurationMinutes,
  type AppointmentIntervalRow,
} from '@/lib/appointmentIntervals';

interface LocationState {
  doctorId?: string;
  doctorName?: string;
  specialty?: string;
  profilePicture?: string;
}

type BookedAppointmentRow = AppointmentIntervalRow & {
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

export default function SlotSelection() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { t } = useLanguage();
  const { formatDate: formatLocaleDate, formatClockTime, formatCurrency } = useLocaleFormatter();
  const state = location.state as LocationState;

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [selectedDuration, setSelectedDuration] = useState<number>(30);
  const [selectedConsultationType, setSelectedConsultationType] = useState<'chat' | 'voice' | 'video'>('video');
  const [isConfirming, setIsConfirming] = useState(false);
  const [finalPrice, setFinalPrice] = useState<number | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'paystack' | 'wallet'>('paystack');
  const { initializePayment } = usePaystackPayment();

  const paystackPublicKey = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || '';

  // Scroll to top when page loads
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Redirect if no doctor selected
  if (!state?.doctorId) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-12">
          <Card className="max-w-md mx-auto">
            <CardContent className="pt-6">
              <div className="text-center">
                <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
                <p className="text-muted-foreground mb-4">{t('slotSelection.noDoctorSelected', 'No doctor selected')}</p>
                <Button onClick={() => navigate('/doctor-discovery')}>
                  {t('slotSelection.backToDoctorDiscovery', 'Back to Doctor Discovery')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  const { data: featureFlags = { duration_pricing: true, tier_pricing: true, consultation_type_pricing: false } } = useQuery({
    queryKey: ['pricing-feature-flags-slot-selection'],
    queryFn: () => AvailabilityService.getFeatureFlags(),
  });

  const durationPricingEnabled = featureFlags.duration_pricing;

  const { data: allowedDurations = [] } = useQuery({
    queryKey: ['allowed-durations-slot-selection'],
    queryFn: () => AvailabilityService.getAllowedDurations(),
  });

  const hasConfiguredDurations = allowedDurations.length > 0;
  const selectedDurationIsAllowed = allowedDurations.includes(selectedDuration);

  const { data: consultationTypes = [] } = useQuery({
    queryKey: ['active-consultation-types-slot-selection'],
    queryFn: () => AvailabilityService.getActiveConsultationTypes(),
  });

  const { data: patientWallet } = useQuery({
    queryKey: ['patient-wallet', user?.id],
    queryFn: () => PatientWalletService.getPatientWallet(user!.id),
    enabled: !!user?.id,
  });

  useEffect(() => {
    if (!durationPricingEnabled) {
      setSelectedTime(null);
      setFinalPrice(null);
    }
  }, [durationPricingEnabled]);

  useEffect(() => {
    if (!hasConfiguredDurations) {
      setSelectedTime(null);
      setFinalPrice(null);
      return;
    }
    if (allowedDurations.includes(selectedDuration)) return;

    setSelectedDuration(allowedDurations[0]);
    setSelectedTime(null);
    setFinalPrice(null);
  }, [allowedDurations, hasConfiguredDurations, selectedDuration]);

  useEffect(() => {
    if (!consultationTypes.length) return;

    const existing = consultationTypes.find((type: any) => type.name === selectedConsultationType);
    if (!existing) {
      const firstType = consultationTypes[0]?.name;
      if (firstType === 'chat' || firstType === 'voice' || firstType === 'video') {
        setSelectedConsultationType(firstType);
        setFinalPrice(null);
      }
    }
  }, [consultationTypes, selectedConsultationType]);

  // Auto-scroll to time selection when date is selected
  useEffect(() => {
    if (selectedDate && durationPricingEnabled) {
      setTimeout(() => {
        const timeSection = document.getElementById('time-selection');
        if (timeSection) {
          timeSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    }
  }, [selectedDate, durationPricingEnabled]);

  // Auto-scroll to summary when ready
  useEffect(() => {
    const ready = selectedDate && (!durationPricingEnabled || selectedTime);
    if (ready) {
      setTimeout(() => {
        const summarySection = document.getElementById('appointment-summary');
        if (summarySection) {
          summarySection.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    }
  }, [selectedDate, selectedTime, durationPricingEnabled]);

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

      return data || [];
    },
  });

  // Fetch blocking appointments for selected doctor and date
  const { data: bookedAppointments = [] } = useQuery({
    queryKey: ['booked-appointments', state.doctorId, selectedDate],
    queryFn: async () => {
      if (!state.doctorId || !selectedDate) return [];

      const { data, error } = await supabase
        .from('appointments')
        .select('time, duration_minutes, status, slot_locked_until')
        .eq('doctor_id', state.doctorId)
        .eq('date', selectedDate);

      if (error) throw error;

      return (data || [])
        .map((apt) => apt as BookedAppointmentRow);
    },
    enabled: !!state.doctorId && !!selectedDate,
  });

  // Get available dates (next 30 days)
  const availableDates = useMemo(() => {
    if (!schedules.length) return [];

    const dates = new Set<string>();
    const today = new Date();

    for (let i = 0; i < 30; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() + i);
      const dateStr = toDateKey(date);
      const dayIndex = date.getDay();

      const hasSchedule = schedules.some((s: any) => {
        return s.day_of_week !== null && parseInt(String(s.day_of_week), 10) === dayIndex && s.is_available === true;
      });

      if (hasSchedule) dates.add(dateStr);
    }

    return Array.from(dates).sort();
  }, [schedules]);

  // Get available times for selected date, excluding booked slots
  const availableTimes = useMemo(() => {
    if (!selectedDate || !schedules.length) return [];
    if (durationPricingEnabled && !hasConfiguredDurations) return [];

    const date = new Date(`${selectedDate}T00:00:00`);
    const dayIndex = date.getDay();

    const daySchedules = schedules.filter((s: any) =>
      s.day_of_week !== null &&
      parseInt(String(s.day_of_week), 10) === dayIndex &&
      s.is_available === true,
    );

    const times = new Set<string>();
    daySchedules.forEach((schedule: any) => {
      const duration = durationPricingEnabled
        ? selectedDuration
        : Number(schedule.slot_duration_minutes || 30);

      const slots = generateTimeSlots(
        String(schedule.start_time).slice(0, 5),
        String(schedule.end_time).slice(0, 5),
        duration,
      );
      slots.forEach((time) => times.add(time));
    });

    // Filter out past times if selected date is today
    const now = new Date();
    const isToday = selectedDate === toDateKey(now);

    let sorted = Array.from(times).sort();
    if (isToday) {
      const currentTime = now.toTimeString().slice(0, 5);
      sorted = sorted.filter((time) => time > currentTime);
    }

    return sorted;
  }, [selectedDate, schedules, selectedDuration, durationPricingEnabled, hasConfiguredDurations]);

  const blockedStartTimes = useMemo(() => {
    if (!availableTimes.length) return new Set<string>();

    const requestedDuration = normalizeDurationMinutes(selectedDuration, 30);
    const blocked = new Set<string>();

    availableTimes.forEach((time) => {
      if (isSlotBlockedByAppointments(time, requestedDuration, bookedAppointments)) {
        blocked.add(time);
      }
    });

    return blocked;
  }, [availableTimes, bookedAppointments, selectedDuration]);

  const summaryReady = !!(
    selectedDate &&
    (
      !durationPricingEnabled ||
      (hasConfiguredDurations && selectedDurationIsAllowed && selectedTime)
    )
  );

  const {
    data: previewPrice,
    isLoading: previewPriceLoading,
    isFetching: previewPriceFetching,
  } = useQuery({
    queryKey: [
      'price-preview-slot-selection',
      user?.id,
      state.doctorId,
      selectedDuration,
      selectedConsultationType,
      selectedDate,
      selectedTime,
      durationPricingEnabled,
    ],
    queryFn: () =>
      AvailabilityService.calculatePricePreview({
        doctorId: state.doctorId!,
        duration: selectedDuration,
        consultationType: selectedConsultationType,
      }),
    enabled: !!user && !!state.doctorId && summaryReady,
    retry: false,
  });

  const displayedPrice = finalPrice ?? previewPrice ?? null;
  const isPreviewingPrice = summaryReady && finalPrice === null && (previewPriceLoading || previewPriceFetching);
  const patientWalletBalance = Number(patientWallet?.available_balance || 0);
  const autoHybridForWallet = paymentMethod === 'wallet' && displayedPrice !== null && patientWalletBalance < displayedPrice;
  const effectivePaymentMethod: 'paystack' | 'wallet' | 'hybrid' = useMemo(() => {
    if (paymentMethod === 'wallet' && autoHybridForWallet) return 'hybrid';
    return paymentMethod;
  }, [paymentMethod, autoHybridForWallet]);
  const walletAppliedForHybrid = effectivePaymentMethod === 'hybrid' && displayedPrice !== null
    ? Math.min(patientWalletBalance, displayedPrice)
    : 0;
  const paystackDueForHybrid = effectivePaymentMethod === 'hybrid' && displayedPrice !== null
    ? Math.max(displayedPrice - walletAppliedForHybrid, 0)
    : 0;
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

  const handleConfirm = async () => {
    if (!selectedDate || !user) {
      toast({
        title: t('slotSelection.toast.missingSelectionTitle', 'Missing selection'),
        description: t('slotSelection.toast.selectAppointmentDate', 'Please select an appointment date.')
      });
      return;
    }

    if (durationPricingEnabled && !hasConfiguredDurations) {
      toast({
        title: t('slotSelection.toast.configurationErrorTitle', 'Configuration Error'),
        description: 'No allowed durations are configured. Please contact support.',
        variant: 'destructive',
      });
      return;
    }

    if (durationPricingEnabled && !selectedTime) {
      toast({
        title: t('slotSelection.toast.missingSelectionTitle', 'Missing selection'),
        description: t('slotSelection.toast.selectAppointmentTime', 'Please select an appointment time.')
      });
      return;
    }

    const paystackRequiredForSelection = effectivePaymentMethod === 'paystack'
      || (effectivePaymentMethod === 'hybrid' && (displayedPrice === null || paystackDueForHybrid > 0));

    if (paystackRequiredForSelection && !paystackPublicKey) {
      toast({
        title: t('slotSelection.toast.configurationErrorTitle', 'Configuration Error'),
        description: t('slotSelection.toast.paymentGatewayNotConfigured', 'Payment gateway not configured. Please contact support.'),
        variant: 'destructive',
      });
      return;
    }

    setIsConfirming(true);

    try {
      const booking = await BookingService.initiateBooking({
        doctorId: state.doctorId,
        preferredDate: selectedDate,
        preferredTime: durationPricingEnabled ? (selectedTime || undefined) : undefined,
        duration: selectedDuration,
        consultationType: selectedConsultationType,
        paymentMethod: effectivePaymentMethod,
      });

      setFinalPrice(booking.finalPrice);
      const walletChargedAmount = Number(booking.walletChargedAmount || 0);
      const paystackAmountDue = Number(
        booking.paystackAmountDue
        ?? (booking.paymentInitialization ? Number(booking.paymentInitialization.amountInKobo || 0) / 100 : 0),
      );

      if (booking.paidWithWallet || booking.paymentMethod === 'wallet' || paystackAmountDue <= 0) {
        setIsConfirming(false);
        toast({
          title: t('slotSelection.toast.walletBookingSuccessTitle', 'Booking successful'),
          description: walletChargedAmount > 0
            ? `Wallet charged ${formatCurrency(walletChargedAmount)}. Your booking is now pending doctor approval.`
            : t(
              'slotSelection.toast.walletBookingSuccessDescription',
              'Your booking has been paid from wallet and is now pending doctor approval.',
            ),
        });
        setTimeout(() => {
          navigate('/patient-portal?tab=appointments');
        }, 800);
        return;
      }

      const paymentInit = booking.paymentInitialization;
      if (!paymentInit) {
        throw new Error('Missing payment initialization response');
      }

      let paymentCompleted = false;
      initializePayment({
        email: paymentInit.email || user.email || '',
        amount: paymentInit.amountInKobo,
        reference: paymentInit.reference,
        publicKey: paystackPublicKey,
        metadata: paymentInit.metadata,
        onSuccess: async (response: any) => {
          paymentCompleted = true;
          const paidReference = String(response?.reference || paymentInit.reference || '').trim();

          try {
            let confirmResult: { error?: string; alreadyProcessed?: boolean } | null = null;
            let lastConfirmError: any = null;

            for (let attempt = 0; attempt < 3; attempt += 1) {
              try {
                const { data: confirmData, error: confirmError } = await supabase.functions.invoke('booking-payment-confirm', {
                  body: { reference: paidReference },
                });
                if (confirmError) throw confirmError;

                const parsed = (confirmData || {}) as { error?: string; alreadyProcessed?: boolean };
                if (parsed.error) throw new Error(parsed.error);
                confirmResult = parsed;
                lastConfirmError = null;
                break;
              } catch (attemptError: any) {
                lastConfirmError = attemptError;
                if (attempt < 2) {
                  await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)));
                }
              }
            }

            if (!confirmResult) {
              throw lastConfirmError || new Error('Payment confirmation failed');
            }

            toast({
              title: t('booking.paymentSuccessTitle', 'Payment successful'),
              description: walletChargedAmount > 0
                ? `Wallet applied ${formatCurrency(walletChargedAmount)} and Paystack paid ${formatCurrency(paystackAmountDue)}. Your appointment is pending doctor approval.`
                : confirmResult.alreadyProcessed
                ? t(
                  'slotSelection.toast.appointmentAlreadyProcessed',
                  'This payment was already processed and your appointment remains pending doctor approval.',
                )
                : t(
                  'slotSelection.toast.appointmentPendingApproval',
                  'Payment successful. Your appointment is pending doctor approval.',
                ),
            });
          } catch (confirmErr: any) {
            console.warn('[slot-selection] booking payment client confirmation failed:', confirmErr);
            toast({
              title: t('booking.paymentSuccessTitle', 'Payment successful'),
              description: walletChargedAmount > 0
                ? `Wallet applied ${formatCurrency(walletChargedAmount)} and Paystack paid ${formatCurrency(paystackAmountDue)}. Your appointment will appear after payment confirmation processing completes.`
                : t(
                  'slotSelection.toast.paymentSuccessPendingWebhook',
                  'Payment succeeded. Your appointment will appear once confirmation processing completes.',
                ),
            });
          } finally {
            setIsConfirming(false);
            setTimeout(() => {
              navigate('/patient-portal?tab=appointments');
            }, 800);
          }
        },
        onClose: () => {
          if (paymentCompleted) return;
          setIsConfirming(false);
          toast({
            title: t('booking.paymentCancelledTitle', 'Payment cancelled'),
            description: t('slotSelection.toast.paymentCancelledDescription', 'You cancelled the payment process.'),
          });
        },
      });
    } catch (error: any) {
      setIsConfirming(false);
      toast({
        title: t('booking.failedTitle', 'Booking failed'),
        description: error?.message || 'Unable to initiate booking right now.',
        variant: 'destructive',
      });
    }
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
                {t('slotSelection.back', '← Back')}
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
                      <p className="text-muted-foreground">{formatSpecialtyLabel(state.specialty)}</p>
                    </div>
                    <Badge className="bg-primary text-primary-foreground">{t('slotSelection.available', 'Available')}</Badge>
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
                { step: 1, label: t('slotSelection.step.date', 'Date') },
                { step: 2, label: durationPricingEnabled ? t('slotSelection.step.time', 'Time') : t('slotSelection.step.autoSlot', 'Auto Slot') },
                { step: 3, label: t('slotSelection.step.confirm', 'Confirm') },
              ].map((item, index) => {
                const active = item.step === 1
                  ? !!selectedDate
                  : item.step === 2
                  ? (!durationPricingEnabled || !!selectedTime)
                  : !!summaryReady;

                return (
                  <div key={item.step} className="flex items-center flex-1">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm ${
                      active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                    }`}>
                      {item.step}
                    </div>
                    <p className={`ml-2 text-sm font-medium ${active ? 'text-primary' : 'text-muted-foreground'}`}>
                      {item.label}
                    </p>
                    {index < 2 && (
                      <div className={`flex-1 h-1 mx-2 rounded ${active ? 'bg-primary' : 'bg-muted'}`} />
                    )}
                  </div>
                );
              })}
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
                    <CalendarIcon className="w-5 h-5" />
                    {t('slotSelection.selectDate', 'Select Date')}
                  </CardTitle>
                  <CardDescription>
                    {t('slotSelection.selectDateDescription', 'Pick a date from the calendar. Only available days are enabled.')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {schedulesLoading ? (
                    <div className="text-center py-8">
                      <p className="text-muted-foreground">{t('slotSelection.loadingAvailableDates', 'Loading available dates...')}</p>
                    </div>
                  ) : availableDates.length === 0 ? (
                    <div className="text-center py-8">
                      <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-muted-foreground">{t('slotSelection.noAvailableDates', 'No available dates')}</p>
                    </div>
                  ) : (
                    <div className="grid gap-4 lg:grid-cols-[320px,1fr]">
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
                            setFinalPrice(null);
                          }}
                          disabled={(date) => {
                            if (date < minCalendarDate || date > maxCalendarDate) return true;
                            return !availableDateSet.has(toDateKey(date));
                          }}
                          className="mx-auto"
                        />
                      </div>

                      <div className="space-y-3">
                        <div className="rounded-lg border bg-background/50 p-4">
                          <p className="text-sm font-medium">{t('slotSelection.selectedDate', 'Selected Date')}</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {selectedDate
                              ? new Date(`${selectedDate}T00:00:00`).toLocaleDateString('en-US', {
                                  weekday: 'long',
                                  month: 'long',
                                  day: 'numeric',
                                  year: 'numeric',
                                })
                              : t('slotSelection.chooseAvailableDate', 'Choose an available date from the calendar')}
                          </p>
                        </div>
                        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                          <p className="text-sm font-medium text-primary">{t('slotSelection.flowTipTitle', 'Flow Tip')}</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {t('slotSelection.flowTipDescription', 'After selecting a date, pick your consultation details and then a time slot.')}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>

            {/* Duration + Consultation mode */}
            {selectedDate && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
                className="mb-8"
              >
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Clock className="w-5 h-5" />
                      {t('slotSelection.consultationDetailsTitle', 'Consultation Details')}
                    </CardTitle>
                    <CardDescription>
                      Configure your booking preferences before payment.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <label className="text-sm font-medium">{t('slotSelection.consultationMode', 'Consultation Mode')}</label>
                      <select
                        value={selectedConsultationType}
                        onChange={(e) => {
                          setSelectedConsultationType(e.target.value as 'chat' | 'voice' | 'video');
                          setFinalPrice(null);
                        }}
                        className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        {(consultationTypes.length ? consultationTypes : [{ name: 'video' }]).map((type: any) => (
                          <option key={type.name} value={type.name}>
                            {String(type.name).charAt(0).toUpperCase() + String(type.name).slice(1)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-sm font-medium">{t('slotSelection.duration', 'Duration')}</label>
                      {durationPricingEnabled ? (
                        hasConfiguredDurations ? (
                          <div className="mt-2 grid grid-cols-4 gap-2">
                            {allowedDurations.map((mins) => (
                              <button
                                key={mins}
                                type="button"
                                onClick={() => {
                                  setSelectedDuration(mins);
                                  setSelectedTime(null);
                                  setFinalPrice(null);
                                }}
                                className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                                  selectedDuration === mins
                                    ? 'border-primary bg-primary text-primary-foreground'
                                    : 'border-border hover:border-primary/40'
                                }`}
                              >
                                {t('slotSelection.minutesShort', '{minutes} min').replace('{minutes}', String(mins))}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-2 text-sm text-destructive">
                            No allowed durations are configured.
                          </p>
                        )
                      ) : (
                        <p className="mt-2 text-sm text-muted-foreground">
                          {t('slotSelection.autoAssignDescription', 'Time selection is disabled by current pricing configuration. The system will auto-assign the next available slot.')}
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Time Selection */}
            {selectedDate && durationPricingEnabled && hasConfiguredDurations && (
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
                      {t('slotSelection.selectTime', 'Select Time')}
                    </CardTitle>
                    <CardDescription>
                      Available times on {formatLocaleDate(selectedDate, { weekday: 'long', month: 'long', day: 'numeric' })}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {availableTimes.length === 0 ? (
                      <div className="text-center py-8">
                        <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                        <p className="text-muted-foreground">{t('slotSelection.noAvailableTimesForDate', 'No available times for this date')}</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                        {availableTimes.map(time => {
                          const isBooked = blockedStartTimes.has(time);
                          const isPast = (() => {
                            const now = new Date();
                            const slotDateTime = new Date(`${selectedDate}T${time}`);
                            return slotDateTime < now;
                          })();
                          const isDisabled = isBooked || isPast;

                          return (
                            <motion.button
                              key={time}
                              whileHover={!isDisabled ? { scale: 1.05 } : {}}
                              onClick={() => {
                                if (!isDisabled) {
                                  setSelectedTime(time);
                                  setFinalPrice(null);
                                }
                              }}
                              disabled={isDisabled}
                              className={`p-3 rounded-lg border-2 transition-all text-center text-sm font-medium ${
                                isDisabled
                                  ? 'border-muted bg-muted/50 text-muted-foreground cursor-not-allowed opacity-50'
                                  : selectedTime === time
                                  ? 'border-primary bg-primary text-primary-foreground'
                                  : 'border-border hover:border-primary/50 text-muted-foreground hover:text-foreground'
                              }`}
                            >
                              {formatClockTime(time)}
                              {isBooked && <span className="block text-[10px] mt-0.5">{t('slotSelection.booked', 'Booked')}</span>}
                              {isPast && !isBooked && <span className="block text-[10px] mt-0.5">{t('slotSelection.past', 'Past')}</span>}
                            </motion.button>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Confirmation Summary */}
            {summaryReady && (
              <motion.div
                id="appointment-summary"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="mb-8"
              >
                <Card className="border-success/30 bg-success/5">
                  <CardHeader>
                    <CardTitle className="text-success">{t('slotSelection.summaryTitle', 'Appointment Summary')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 rounded-lg bg-background/50">
                        <span className="text-muted-foreground">{t('slotSelection.summary.doctor', 'Doctor')}</span>
                        <span className="font-medium">{state.doctorName}</span>
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-lg bg-background/50">
                        <span className="text-muted-foreground">{t('slotSelection.summary.date', 'Date')}</span>
                        <span className="font-medium">{formatLocaleDate(selectedDate, { weekday: 'long', month: 'long', day: 'numeric' })}</span>
                      </div>
                      {durationPricingEnabled && selectedTime && (
                        <div className="flex items-center justify-between p-3 rounded-lg bg-background/50">
                          <span className="text-muted-foreground">{t('slotSelection.summary.time', 'Time')}</span>
                          <span className="font-medium">{selectedTime}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between p-3 rounded-lg bg-background/50">
                        <span className="text-muted-foreground">{t('slotSelection.summary.mode', 'Mode')}</span>
                        <span className="font-medium capitalize">{selectedConsultationType}</span>
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-lg bg-background/50">
                        <span className="text-muted-foreground">{t('slotSelection.summary.duration', 'Duration')}</span>
                        <span className="font-medium">
                          {t('slotSelection.summary.durationMinutes', '{minutes} minutes').replace('{minutes}', String(selectedDuration))}
                        </span>
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-lg bg-primary/10 border border-primary/20">
                        <span className="text-muted-foreground">{t('slotSelection.summary.consultationFee', 'Consultation Fee')}</span>
                        <span className="font-semibold text-primary">
                          {displayedPrice !== null
                            ? formatCurrency(displayedPrice)
                            : isPreviewingPrice
                            ? t('slotSelection.summary.calculating', 'Calculating...')
                            : t('slotSelection.summary.unableToPreview', 'Unable to preview right now')}
                        </span>
                      </div>
                      <div className="rounded-lg border p-3 bg-background/50">
                        <p className="text-sm font-medium mb-2">
                          {t('slotSelection.summary.paymentMethod', 'Payment Method')}
                        </p>
                        <div className="space-y-2 text-sm">
                          <label className="flex items-center justify-between rounded-md border px-3 py-2 cursor-pointer">
                            <span>{t('slotSelection.summary.paystack', 'Paystack')}</span>
                            <input
                              type="radio"
                              name="booking-payment-method"
                              checked={paymentMethod === 'paystack'}
                              onChange={() => setPaymentMethod('paystack')}
                            />
                          </label>
                          <label className="flex items-center justify-between rounded-md border px-3 py-2 cursor-pointer">
                            <span>
                              {t('slotSelection.summary.wallet', 'Wallet')} ({formatCurrency(patientWalletBalance)})
                            </span>
                            <input
                              type="radio"
                              name="booking-payment-method"
                              checked={paymentMethod === 'wallet'}
                              onChange={() => setPaymentMethod('wallet')}
                            />
                          </label>
                        </div>
                        {paymentMethod === 'wallet' && displayedPrice !== null && (
                          <div className="mt-2 rounded-md border bg-muted/30 p-2 text-xs space-y-1">
                            {paystackDueForHybrid > 0 ? (
                              <>
                                <p>
                                  <span className="font-medium">From wallet:</span> {formatCurrency(walletAppliedForHybrid)}
                                </p>
                                <p>
                                  <span className="font-medium">Paystack balance:</span> {formatCurrency(paystackDueForHybrid)}
                                </p>
                              </>
                            ) : (
                              <p>
                                <span className="font-medium">Wallet covers full amount:</span> {formatCurrency(displayedPrice)}
                              </p>
                            )}
                          </div>
                        )}
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
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={!summaryReady || isConfirming}
                className="gap-2"
              >
                {effectivePaymentMethod === 'wallet' ? <Wallet className="w-4 h-4" /> : <CreditCard className="w-4 h-4" />}
                {isConfirming
                  ? t('slotSelection.processing', 'Processing...')
                  : effectivePaymentMethod === 'wallet'
                  ? t('slotSelection.confirmWithWallet', 'Confirm with Wallet')
                  : effectivePaymentMethod === 'hybrid'
                  ? paystackDueForHybrid > 0
                  ? t('slotSelection.confirmHybrid', 'Pay Balance & Confirm')
                  : t('slotSelection.confirmWithWallet', 'Confirm with Wallet')
                  : t('slotSelection.payAndConfirmBooking', 'Pay & Confirm Booking')}
                <ChevronRight className="w-4 h-4" />
              </Button>
            </motion.div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
