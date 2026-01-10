import { motion } from 'framer-motion';
import { Layout } from '@/components/layout';
import {
  Video,
  Phone,
  MessageSquare,
  Calendar,
  FileText,
  Shield,
  Clock,
  Users,
  Heart,
  ArrowRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

const services = [
  {
    id: 'video',
    icon: Video,
    title: 'Video Consultation',
    description: 'Face-to-face consultations with certified doctors through high-quality video calls. Get diagnosed, receive prescriptions, and get follow-up care.',
    features: ['HD video quality', 'Screen sharing', 'Recording available', 'Cross-device support'],
    color: 'bg-primary',
  },
  {
    id: 'audio',
    icon: Phone,
    title: 'Audio Consultation',
    description: 'When video isn\'t possible, connect with your doctor through secure voice calls. Perfect for follow-ups and quick consultations.',
    features: ['Crystal clear audio', 'Low bandwidth', 'Privacy focused', 'Quick connect'],
    color: 'bg-accent',
  },
  {
    id: 'chat',
    icon: MessageSquare,
    title: 'Secure Chat',
    description: 'Chat with your doctor during consultations. Share symptoms, ask questions, and receive guidance in real-time.',
    features: ['End-to-end encrypted', 'File sharing', 'Image upload', 'Chat history'],
    color: 'bg-success',
  },
  {
    id: 'booking',
    icon: Calendar,
    title: 'Easy Booking',
    description: 'Book appointments with general practitioners or specialists in just a few clicks. Choose your preferred time slot.',
    features: ['Instant confirmation', 'Calendar sync', 'Reminders', 'Reschedule option'],
    color: 'bg-warning',
  },
  {
    id: 'records',
    icon: FileText,
    title: 'Digital Health Records',
    description: 'Access your consultation history, prescriptions, and medical records anytime. Securely stored and always available.',
    features: ['Secure storage', 'Easy access', 'Download option', 'Share with doctors'],
    color: 'bg-primary',
  },
  {
    id: 'specialist',
    icon: Users,
    title: 'Specialist Clinics',
    description: 'Access our network of specialist e-clinics. Book appointments with cardiologists, dermatologists, pediatricians, and more.',
    features: ['15+ specialties', 'Expert doctors', 'Priority booking', 'Second opinions'],
    color: 'bg-accent',
  },
];

const processSteps = [
  {
    step: '01',
    title: 'Create Account',
    description: 'Sign up for free and complete your health profile',
  },
  {
    step: '02',
    title: 'Choose Doctor',
    description: 'Browse specialists and select based on your needs',
  },
  {
    step: '03',
    title: 'Book Appointment',
    description: 'Pick a convenient time slot and confirm booking',
  },
  {
    step: '04',
    title: 'Consult Online',
    description: 'Connect via video, audio, or chat for your consultation',
  },
];

export default function ServicesPage() {
  return (
    <Layout>
      {/* Hero */}
      <section className="pt-32 pb-20 gradient-subtle">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center max-w-3xl mx-auto"
          >
            <span className="text-primary font-medium text-sm uppercase tracking-wider">Our Services</span>
            <h1 className="text-4xl md:text-5xl font-bold mt-3 mb-6">
              Comprehensive Healthcare Services
            </h1>
            <p className="text-lg text-muted-foreground">
              Experience modern healthcare with our suite of telemedicine services designed for your convenience, comfort, and peace of mind.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Services Grid */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {services.map((service, index) => (
              <motion.div
                key={service.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="group p-8 rounded-2xl bg-card border border-border hover:shadow-card hover:border-primary/20 transition-all duration-300"
              >
                <div className={`w-14 h-14 rounded-2xl ${service.color} flex items-center justify-center mb-6`}>
                  <service.icon className="w-7 h-7 text-primary-foreground" />
                </div>
                <h3 className="text-xl font-semibold mb-3">{service.title}</h3>
                <p className="text-muted-foreground text-sm mb-6">{service.description}</p>
                <ul className="space-y-2">
                  {service.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Heart className="w-4 h-4 text-primary" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <span className="text-primary font-medium text-sm uppercase tracking-wider">How It Works</span>
            <h2 className="text-3xl md:text-4xl font-bold mt-3 mb-4">
              Getting Started is Easy
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Follow these simple steps to start your online healthcare journey
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {processSteps.map((step, index) => (
              <motion.div
                key={step.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="text-center"
              >
                <div className="text-5xl font-bold text-primary/20 mb-4">{step.step}</div>
                <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
                <p className="text-sm text-muted-foreground">{step.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Security Section */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <span className="text-primary font-medium text-sm uppercase tracking-wider">Security & Privacy</span>
              <h2 className="text-3xl md:text-4xl font-bold mt-3 mb-6">
                Your Data is Safe With Us
              </h2>
              <p className="text-muted-foreground mb-8">
                We take your privacy seriously. All consultations are encrypted end-to-end, and your health data is protected with enterprise-grade security measures.
              </p>
              <div className="space-y-4">
                {[
                  { icon: Shield, title: 'End-to-End Encryption', desc: 'All communications are fully encrypted' },
                  { icon: Clock, title: 'HIPAA Compliant', desc: 'Meeting healthcare data protection standards' },
                  { icon: Users, title: 'Role-Based Access', desc: 'Only authorized personnel can access your data' },
                ].map((item) => (
                  <div key={item.title} className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-primary-light flex items-center justify-center shrink-0">
                      <item.icon className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-semibold">{item.title}</h4>
                      <p className="text-sm text-muted-foreground">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="relative"
            >
              <div className="aspect-square rounded-3xl gradient-primary flex items-center justify-center">
                <Shield className="w-32 h-32 text-primary-foreground/30" />
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Ready to Get Started?
            </h2>
            <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
              Join thousands of patients who trust MyEdoctor for their healthcare needs.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/booking">
                <Button variant="gradient" size="lg">
                  Book Consultation
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              <Link to="/auth?mode=register">
                <Button variant="outline" size="lg">
                  Create Account
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>
    </Layout>
  );
}
