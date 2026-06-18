import { motion } from 'framer-motion';
import { Layout } from '@/components/layout';
import { 
  Users, 
  Clock, 
  Globe, 
  ShieldCheck, 
  BarChart3, 
  Smartphone,
  ArrowRight,
  CheckCircle2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';

export default function ForDoctors() {
  const { t } = useLanguage();

  const benefits = [
    {
      icon: Clock,
      title: 'Flexible Schedule',
      description: 'Set your own hours and manage your consultations around your lifestyle. Work from anywhere, anytime.'
    },
    {
      icon: Users,
      title: 'Expand Your Reach',
      description: 'Connect with patients across the country who need your expertise, beyond the limitations of a physical clinic.'
    },
    {
      icon: ShieldCheck,
      title: 'Secure Platform',
      description: 'Our platform is MDCN and NDPC compliant, ensuring your practice and patient data are protected with enterprise-grade security.'
    },
    {
      icon: BarChart3,
      title: 'Streamlined Practice',
      description: 'Digitize your medical records, prescriptions, and follow-ups. Focus more on patient care and less on paperwork.'
    }
  ];

  const steps = [
    {
      title: 'Register',
      description: 'Create your account and provide your medical credentials for verification.'
    },
    {
      title: 'Verification',
      description: 'Our medical board reviews your license and qualifications to ensure platform standards.'
    },
    {
      title: 'Set Availability',
      description: 'Define your consultation hours and specialties in your doctor portal.'
    },
    {
      title: 'Start Consulting',
      description: 'Begin accepting appointments and providing expert medical care to patients online.'
    }
  ];

  return (
    <Layout>
      {/* Hero Section */}
      <section className="pt-32 pb-20 gradient-subtle overflow-hidden">
        <div className="container mx-auto px-4 relative">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -z-10" />
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="max-w-2xl"
            >
              <span className="text-primary font-medium text-sm uppercase tracking-wider">
                Join our Network
              </span>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mt-3 mb-6">
                Empower Your Practice with <span className="text-gradient">Telemedicine</span>
              </h1>
              <p className="text-lg text-muted-foreground mb-8">
                Join over 120 certified medical professionals on MyE-Doctor. Reach more patients, manage your schedule flexibly, and provide quality care through our secure platform.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link to="/auth?mode=register&role=doctor">
                  <Button variant="hero" size="xl" className="w-full sm:w-auto">
                    Join as a Doctor
                    <ArrowRight className="w-5 h-5" />
                  </Button>
                </Link>
                <Link to="/contact">
                  <Button variant="outline" size="xl" className="w-full sm:w-auto">
                    Contact for Inquiry
                  </Button>
                </Link>
              </div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
              className="relative hidden lg:block"
            >
              <div className="aspect-square rounded-3xl overflow-hidden shadow-2xl">
                <img 
                  src="https://images.unsplash.com/photo-1559839734-2b71f1536785?auto=format&fit=crop&q=80&w=1000" 
                  alt="Doctor using telemedicine"
                  className="w-full h-full object-cover"
                />
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Benefits Grid */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Why Doctors Choose MyE-Doctor</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              We provide the tools and platform you need to modernise your medical practice and reach patients effectively.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {benefits.map((benefit, index) => (
              <motion.div
                key={benefit.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="p-6 rounded-2xl bg-card border border-border hover:shadow-card transition-all"
              >
                <div className="w-12 h-12 rounded-xl bg-primary-light flex items-center justify-center mb-4 text-primary">
                  <benefit.icon className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold mb-2">{benefit.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {benefit.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Simple Onboarding Process</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Getting started with MyE-Doctor is straightforward and secure.
            </p>
          </div>
          <div className="grid md:grid-cols-4 gap-8">
            {steps.map((step, index) => (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="relative text-center"
              >
                <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg mx-auto mb-4">
                  {index + 1}
                </div>
                <h3 className="font-bold mb-2">{step.title}</h3>
                <p className="text-sm text-muted-foreground">{step.description}</p>
                {index < steps.length - 1 && (
                  <div className="hidden md:block absolute top-6 left-[calc(50%+24px)] w-[calc(100%-48px)] h-px bg-border" />
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Features List */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <h2 className="text-3xl md:text-4xl font-bold mb-6">Designed for Modern Healthcare</h2>
              <div className="space-y-4">
                {[
                  'Integrated high-definition video consultations',
                  'E-prescriptions and digital medical records',
                  'Automated appointment scheduling and reminders',
                  'Secure patient-doctor messaging',
                  'Comprehensive practice analytics and reports',
                  'Mobile app for on-the-go practice management'
                ].map((item) => (
                  <div key={item} className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
                    <span className="text-muted-foreground">{item}</span>
                  </div>
                ))}
              </div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="bg-primary-light p-8 rounded-3xl"
            >
              <h3 className="text-2xl font-bold mb-4 text-primary">Compliance & Standards</h3>
              <p className="text-muted-foreground mb-6">
                MyE-Doctor maintains the highest standards of medical practice and data protection. We ensure all doctors on our platform are verified and in compliance with MDCN regulations.
              </p>
              <div className="flex gap-4">
                <div className="px-4 py-2 bg-white rounded-lg shadow-sm text-xs font-bold text-primary border border-primary/10">MDCN COMPLIANT</div>
                <div className="px-4 py-2 bg-white rounded-lg shadow-sm text-xs font-bold text-primary border border-primary/10">NDPC COMPLIANT</div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="container mx-auto px-4 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="p-12 md:p-20 rounded-3xl bg-foreground text-primary-foreground relative overflow-hidden"
          >
            <div className="absolute inset-0 opacity-10">
              <div className="absolute top-0 left-0 w-64 h-64 bg-primary rounded-full blur-3xl" />
            </div>
            <div className="relative z-10">
              <h2 className="text-3xl md:text-5xl font-bold mb-6">Ready to expand your reach?</h2>
              <p className="text-primary-foreground/70 text-lg mb-8 max-w-2xl mx-auto">
                Join our network of medical professionals and start providing quality healthcare services online.
              </p>
              <Link to="/auth?mode=register&role=doctor">
                <Button variant="hero" size="xl">
                  Get Started as a Doctor
                  <ArrowRight className="w-5 h-5" />
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>
    </Layout>
  );
}
