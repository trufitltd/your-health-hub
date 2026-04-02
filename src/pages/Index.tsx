import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight, Calendar, Video, Shield, Clock, Star, Users, Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Layout } from '@/components/layout';
import { FloatingLanguageSelector } from "@/components/LanguageSelector";
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';
import { useLocaleFormatter } from '@/lib/locale';
import heroDoctor from '@/assets/hero-doctor.jpg';
import heroDoctor2 from '@/assets/myedoctor_hero.png';
import heroDoctor3 from '@/assets/myedoctor_hero3.jpeg';
import heroDoctor4 from '@/assets/myedoctor_hero4.jpeg';
import heroDoctor5 from '@/assets/myedoctor_hero5.jpeg';

const Index = () => {
  const { t } = useLanguage();
  const { formatNumber } = useLocaleFormatter();
  const features = [
    {
      icon: Video,
      title: t('landing.features.video.title', 'Video Consultations'),
      description: t('landing.features.video.description', 'Face-to-face consultations with certified doctors from anywhere'),
    },
    {
      icon: Calendar,
      title: t('landing.features.booking.title', 'Easy Booking'),
      description: t('landing.features.booking.description', 'Book appointments with specialists in just a few clicks'),
    },
    {
      icon: Shield,
      title: t('landing.features.secure.title', 'Secure & Private'),
      description: t('landing.features.secure.description', 'Your health data is protected with enterprise-grade security'),
    },
    {
      icon: Clock,
      title: t('landing.features.availability.title', '24/7 Availability'),
      description: t('landing.features.availability.description', 'Access healthcare services anytime, anywhere you need'),
    },
  ];

  const stats = [
    { value: `${formatNumber(50)}+`, label: t('landing.stats.certifiedDoctors', 'Certified Doctors') },
    { value: `${formatNumber(1000)}+`, label: t('landing.stats.happyPatients', 'Happy Patients') },
    { value: `${formatNumber(15)}+`, label: t('landing.stats.specialties', 'Specialties') },
    { value: `${formatNumber(99)}%`, label: t('landing.stats.satisfactionRate', 'Satisfaction Rate') },
  ];

  const specialties = [
    { key: 'General Medicine', name: t('landing.specialties.generalMedicine', 'General Medicine'), icon: Heart, color: 'bg-primary' },
    { key: 'Cardiology', name: t('landing.specialties.cardiology', 'Cardiology'), icon: Heart, color: 'bg-accent' },
    { key: 'Dermatology', name: t('landing.specialties.dermatology', 'Dermatology'), icon: Users, color: 'bg-success' },
    { key: 'Pediatrics', name: t('landing.specialties.pediatrics', 'Pediatrics'), icon: Users, color: 'bg-warning' },
  ];

  const heroSlides = [
    {
      image: heroDoctor4,
      text: t('landing.hero.slide2.attractingText', 'Connect with certified specialists instantly'),
    },
    {
      image: heroDoctor3,
      text: t('landing.hero.slide1.attractingText', 'Expert medical care from the comfort of your home'),
    },
    {
      image: heroDoctor5,
      text: t('landing.hero.slide3.attractingText', 'Secure and private healthcare for your peace of mind'),
    }
  ];

  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % heroSlides.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [heroSlides.length]);

  const trustedBadgeText = (() => {
    const template = t('landing.badgeTrusted', 'Trusted by 1000+ patients');
    if (template.includes('{count}')) {
      return template.replace('{count}', formatNumber(1000));
    }
    return template.replace(/1,?000/g, formatNumber(1000));
  })();

  return (
    <Layout>
      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center pt-32 sm:pt-40 lg:pt-36 overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0 gradient-subtle" />
        <div className="absolute top-20 right-0 w-[600px] h-[600px] bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-accent/5 rounded-full blur-3xl" />

        <div className="container mx-auto px-4 relative z-10">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Content */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="text-center lg:text-left"
            >
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary-light text-primary text-sm font-medium mb-6">
                <Star className="w-4 h-4 fill-primary" />
                {trustedBadgeText}
              </span>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight mb-6">
                {t('landing.heroTitlePrefix', 'Your Doctor,')}{' '}
                <span className="text-gradient">{t('landing.heroTitleHighlight', 'Anytime, Anywhere')}</span>
              </h1>
              <p className="text-lg text-muted-foreground mb-8 max-w-xl mx-auto lg:mx-0">
                {t(
                  'landing.heroDescription',
                  'Connect with certified doctors and specialists instantly. Get expert medical consultations through secure video calls, chat, and more — all from the comfort of your home.',
                )}
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                <Link to="/booking">
                  <Button variant="hero" size="xl" className="w-full sm:w-auto">
                    {t('landing.ctaBookConsultation', 'Book Consultation')}
                    <ArrowRight className="w-5 h-5" />
                  </Button>
                </Link>
                <Link to="/services">
                  <Button variant="outline" size="xl" className="w-full sm:w-auto">
                    {t('landing.ctaExploreServices', 'Explore Services')}
                  </Button>
                </Link>
              </div>
            </motion.div>

            {/* Hero Image Carousel */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="relative"
            >
              <div className="relative rounded-3xl overflow-hidden shadow-2xl h-[450px] md:h-[650px] lg:h-[750px] bg-muted">
                <AnimatePresence>
                  <motion.div
                    key={currentSlide}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 1.2, ease: "easeInOut" }}
                    className="absolute inset-0"
                  >
                    <img
                      src={heroSlides[currentSlide].image}
                      alt={t('landing.heroImageAlt', 'Telemedicine consultation')}
                      className="w-full h-full object-cover object-[center_top]"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-foreground/70 via-foreground/20 to-transparent flex items-end p-8 md:p-12">
                      <motion.p 
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.3 }}
                        className="text-white text-xl md:text-3xl font-bold max-w-lg leading-tight"
                      >
                        {heroSlides[currentSlide].text}
                      </motion.p>
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Slide Indicators */}
              <div className="absolute bottom-4 right-8 flex gap-2 z-20">
                {heroSlides.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentSlide(index)}
                    className={cn(
                      "w-2 h-2 rounded-full transition-all duration-300",
                      currentSlide === index ? "w-6 bg-white" : "bg-white/50"
                    )}
                  />
                ))}
              </div>

              {/* Floating Cards */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.5 }}
                className="absolute -left-4 top-1/4 glass-card p-4 rounded-2xl hidden lg:block"
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center">
                    <Video className="w-6 h-6 text-primary-foreground" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{t('landing.floatCard.video.title', 'Video Call')}</p>
                    <p className="text-xs text-muted-foreground">{t('landing.floatCard.video.subtitle', 'HD Quality')}</p>
                  </div>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.7 }}
                className="absolute -right-4 bottom-1/4 glass-card p-4 rounded-2xl hidden lg:block"
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-success flex items-center justify-center">
                    <Shield className="w-6 h-6 text-success-foreground" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{t('landing.floatCard.secure.title', '100% Secure')}</p>
                    <p className="text-xs text-muted-foreground">{t('landing.floatCard.secure.subtitle', 'End-to-end encrypted')}</p>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 bg-card border-y border-border">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="text-center"
              >
                <p className="text-3xl md:text-4xl font-bold text-primary mb-2">{stat.value}</p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 md:py-32">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <span className="text-primary font-medium text-sm uppercase tracking-wider">{t('landing.whyChooseUs', 'Why Choose Us')}</span>
            <h2 className="text-3xl md:text-4xl font-bold mt-3 mb-4">
              {t('landing.healthcareMadeSimple', 'Healthcare Made Simple')}
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              {t(
                'landing.healthcareMadeSimpleDescription',
                'Experience modern healthcare with our comprehensive telemedicine platform designed for your convenience.',
              )}
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="group p-6 rounded-2xl bg-card border border-border hover:shadow-card hover:border-primary/20 transition-all duration-300"
              >
                <div className="w-14 h-14 rounded-2xl gradient-primary flex items-center justify-center mb-4 group-hover:shadow-glow transition-shadow">
                  <feature.icon className="w-7 h-7 text-primary-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Specialties Section */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <span className="text-primary font-medium text-sm uppercase tracking-wider">{t('landing.specialties.title', 'Specialties')}</span>
            <h2 className="text-3xl md:text-4xl font-bold mt-3 mb-4">
              {t('landing.findYourSpecialist', 'Find Your Specialist')}
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              {t(
                'landing.findYourSpecialistDescription',
                'Browse our wide range of medical specialties and book with experts in their field.',
              )}
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {specialties.map((specialty, index) => (
              <motion.div
                key={specialty.key}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              >
                <Link
                  to={`/specialists?specialty=${specialty.key}`}
                  className="block p-6 rounded-2xl bg-card border border-border hover:shadow-lg hover:border-primary/20 transition-all duration-300 group"
                >
                  <div className={`w-12 h-12 rounded-xl ${specialty.color} flex items-center justify-center mb-4`}>
                    <specialty.icon className="w-6 h-6 text-primary-foreground" />
                  </div>
                  <h3 className="font-semibold mb-1 group-hover:text-primary transition-colors">{specialty.name}</h3>
                  <p className="text-sm text-muted-foreground">{t('landing.viewSpecialists', 'View specialists')} →</p>
                </Link>
              </motion.div>
            ))}
          </div>

          <div className="text-center mt-12">
            <Link to="/specialists">
              <Button variant="outline" size="lg">
                {t('landing.viewAllSpecialties', 'View All Specialties')}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 md:py-32">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="relative rounded-3xl gradient-hero p-8 md:p-16 text-center overflow-hidden"
          >
            <div className="absolute inset-0 opacity-10">
              <div className="absolute top-0 left-0 w-64 h-64 bg-primary-foreground rounded-full blur-3xl" />
              <div className="absolute bottom-0 right-0 w-96 h-96 bg-primary-foreground rounded-full blur-3xl" />
            </div>
            <div className="relative z-10">
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-primary-foreground mb-6">
                {t('landing.readyTitle', 'Ready to Start Your Health Journey?')}
              </h2>
              <p className="text-primary-foreground/80 text-lg mb-8 max-w-2xl mx-auto">
                {t(
                  'landing.readyDescription',
                  'Join thousands of patients who trust MyEdoctor for their healthcare needs. Book your first consultation today.',
                )}
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link to="/auth?mode=register">
                  <Button variant="secondary" size="xl" className="w-full sm:w-auto">
                    {t('landing.createFreeAccount', 'Create Free Account')}
                  </Button>
                </Link>
                <Link to="/contact">
                  <Button variant="glass" size="xl" className="w-full sm:w-auto border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10">
                    {t('landing.contactUs', 'Contact Us')}
                  </Button>
                </Link>
              </div>
            </div>
          </motion.div>
        </div>
      </section>
      <FloatingLanguageSelector />
    </Layout>
  );
};

export default Index;
