import { useState } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '@/components/layout';
import { Calendar, Clock, Video, Phone, MessageSquare, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const consultationTypes = [
  { id: 'video', icon: Video, label: 'Video Call', desc: 'Face-to-face consultation' },
  { id: 'audio', icon: Phone, label: 'Audio Call', desc: 'Voice-only consultation' },
  { id: 'chat', icon: MessageSquare, label: 'Chat', desc: 'Text-based consultation' },
];

const timeSlots = [
  '09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM',
  '11:00 AM', '11:30 AM', '02:00 PM', '02:30 PM',
  '03:00 PM', '03:30 PM', '04:00 PM', '04:30 PM',
];

const mockDoctor = {
  name: 'Dr. Sarah Johnson',
  specialty: 'Cardiology',
  image: 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=300&h=300&fit=crop',
  price: 75,
};

export default function BookingPage() {
  const [step, setStep] = useState(1);
  const [consultationType, setConsultationType] = useState('video');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedTime, setSelectedTime] = useState<string | null>(null);

  const generateDays = () => {
    const days = [];
    const today = new Date();
    for (let i = 0; i < 14; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      days.push(date);
    }
    return days;
  };

  const days = generateDays();

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  return (
    <Layout>
      <section className="pt-32 pb-20">
        <div className="container mx-auto px-4 max-w-4xl">
          {/* Progress */}
          <div className="flex items-center justify-center gap-4 mb-12">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center gap-2">
                <div
                  className={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-all',
                    step >= s
                      ? 'gradient-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {step > s ? <Check className="w-5 h-5" /> : s}
                </div>
                <span className={cn(
                  'text-sm font-medium hidden sm:block',
                  step >= s ? 'text-foreground' : 'text-muted-foreground'
                )}>
                  {s === 1 ? 'Type' : s === 2 ? 'Date & Time' : 'Confirm'}
                </span>
                {s < 3 && <div className="w-8 h-0.5 bg-border" />}
              </div>
            ))}
          </div>

          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
          >
            {/* Step 1: Consultation Type */}
            {step === 1 && (
              <div>
                <h1 className="text-3xl font-bold text-center mb-2">Choose Consultation Type</h1>
                <p className="text-muted-foreground text-center mb-8">
                  Select how you'd like to connect with your doctor
                </p>

                <div className="grid md:grid-cols-3 gap-4 mb-8">
                  {consultationTypes.map((type) => (
                    <button
                      key={type.id}
                      onClick={() => setConsultationType(type.id)}
                      className={cn(
                        'p-6 rounded-2xl border-2 text-left transition-all duration-200',
                        consultationType === type.id
                          ? 'border-primary bg-primary-light'
                          : 'border-border hover:border-primary/50'
                      )}
                    >
                      <div className={cn(
                        'w-12 h-12 rounded-xl flex items-center justify-center mb-4',
                        consultationType === type.id ? 'gradient-primary' : 'bg-muted'
                      )}>
                        <type.icon className={cn(
                          'w-6 h-6',
                          consultationType === type.id ? 'text-primary-foreground' : 'text-muted-foreground'
                        )} />
                      </div>
                      <h3 className="font-semibold mb-1">{type.label}</h3>
                      <p className="text-sm text-muted-foreground">{type.desc}</p>
                    </button>
                  ))}
                </div>

                <div className="flex justify-center">
                  <Button variant="gradient" size="lg" onClick={() => setStep(2)}>
                    Continue
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Step 2: Date & Time */}
            {step === 2 && (
              <div>
                <h1 className="text-3xl font-bold text-center mb-2">Select Date & Time</h1>
                <p className="text-muted-foreground text-center mb-8">
                  Choose your preferred appointment slot
                </p>

                {/* Date Selection */}
                <div className="mb-8">
                  <h3 className="font-semibold mb-4 flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-primary" />
                    Select Date
                  </h3>
                  <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                    {days.map((day) => (
                      <button
                        key={day.toISOString()}
                        onClick={() => setSelectedDate(day)}
                        className={cn(
                          'flex flex-col items-center px-4 py-3 rounded-xl min-w-[80px] transition-all',
                          selectedDate.toDateString() === day.toDateString()
                            ? 'gradient-primary text-primary-foreground'
                            : 'bg-muted hover:bg-muted/80'
                        )}
                      >
                        <span className="text-xs">{formatDate(day).split(' ')[0]}</span>
                        <span className="text-lg font-semibold">{day.getDate()}</span>
                        {isToday(day) && (
                          <span className="text-xs">Today</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Time Selection */}
                <div className="mb-8">
                  <h3 className="font-semibold mb-4 flex items-center gap-2">
                    <Clock className="w-5 h-5 text-primary" />
                    Available Slots
                  </h3>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                    {timeSlots.map((time) => (
                      <button
                        key={time}
                        onClick={() => setSelectedTime(time)}
                        className={cn(
                          'py-3 px-2 rounded-xl text-sm font-medium transition-all',
                          selectedTime === time
                            ? 'gradient-primary text-primary-foreground'
                            : 'bg-muted hover:bg-muted/80'
                        )}
                      >
                        {time}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex justify-between">
                  <Button variant="ghost" onClick={() => setStep(1)}>
                    <ChevronLeft className="w-4 h-4" />
                    Back
                  </Button>
                  <Button
                    variant="gradient"
                    size="lg"
                    onClick={() => setStep(3)}
                    disabled={!selectedTime}
                  >
                    Continue
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Step 3: Confirmation */}
            {step === 3 && (
              <div>
                <h1 className="text-3xl font-bold text-center mb-2">Confirm Booking</h1>
                <p className="text-muted-foreground text-center mb-8">
                  Review your appointment details
                </p>

                <div className="bg-card rounded-2xl border border-border p-6 mb-8">
                  {/* Doctor Info */}
                  <div className="flex items-center gap-4 pb-6 border-b border-border mb-6">
                    <img
                      src={mockDoctor.image}
                      alt={mockDoctor.name}
                      className="w-16 h-16 rounded-2xl object-cover"
                    />
                    <div>
                      <h3 className="font-semibold">{mockDoctor.name}</h3>
                      <p className="text-sm text-primary">{mockDoctor.specialty}</p>
                    </div>
                  </div>

                  {/* Booking Details */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Consultation Type</span>
                      <span className="font-medium capitalize">{consultationType}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Date</span>
                      <span className="font-medium">
                        {selectedDate.toLocaleDateString('en-US', { 
                          weekday: 'long',
                          month: 'long',
                          day: 'numeric'
                        })}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Time</span>
                      <span className="font-medium">{selectedTime}</span>
                    </div>
                    <div className="flex items-center justify-between pt-4 border-t border-border">
                      <span className="text-muted-foreground">Consultation Fee</span>
                      <span className="text-2xl font-bold text-primary">${mockDoctor.price}</span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-between">
                  <Button variant="ghost" onClick={() => setStep(2)}>
                    <ChevronLeft className="w-4 h-4" />
                    Back
                  </Button>
                  <Button variant="gradient" size="lg">
                    Confirm & Pay
                    <Check className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      </section>
    </Layout>
  );
}
