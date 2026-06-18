import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Layout } from '@/components/layout';
import { Mail, Phone, Clock, Send, MessageSquare, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/sonner';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';

export default function ContactPage() {
  const { t } = useLanguage();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    subject: '',
    message: '',
  });

  const contactInfo = [
    {
      icon: Phone,
      title: t('contact.info.phone.title', 'Phone'),
      value: '+2348068006867',
      desc: t('contact.info.phone.desc', 'Mon-Fri from 8am to 6pm'),
    },
    {
      icon: Phone,
      title: t('contact.info.phone.altTitle', 'Alternate Phone'),
      value: '+2347033734785',
      desc: t('contact.info.phone.desc', 'Mon-Fri from 8am to 6pm'),
    },
    {
      icon: Mail,
      title: t('contact.info.email.title', 'Email'),
      value: 'info@myedoctorhealth.com',
      desc: t('contact.info.email.desc', 'We reply within 24 hours'),
    },
    {
      icon: Clock,
      title: t('contact.info.hours.title', 'Hours'),
      value: t('contact.info.hours.value', '24/7 Available'),
      desc: t('contact.info.hours.desc', 'For emergency consultations'),
    },
  ];

  const faqs = [
    {
      q: t('contact.faq.1.q', 'How do I book a consultation?'),
      a: t(
        'contact.faq.1.a',
        'Simply create an account, browse our specialists, select your preferred doctor, choose a time slot, and confirm your booking.',
      ),
    },
    {
      q: t('contact.faq.2.q', 'Are the consultations secure?'),
      a: t(
        'contact.faq.2.a',
        'Yes, all consultations are end-to-end encrypted and comply with healthcare privacy standards.',
      ),
    },
    {
      q: t('contact.faq.3.q', 'Can I get prescriptions online?'),
      a: t(
        'contact.faq.3.a',
        'Yes, our doctors can provide digital prescriptions after your consultation when medically appropriate.',
      ),
    },
    {
      q: t('contact.faq.4.q', 'What payment methods do you accept?'),
      a: t(
        'contact.faq.4.a',
        'We accept all major credit cards, debit cards, and digital payment methods.',
      ),
    },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const { error } = await supabase.from('contact_messages').insert({
        first_name: formData.firstName.trim(),
        last_name: formData.lastName.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim() || null,
        subject: formData.subject.trim(),
        message: formData.message.trim(),
      });

      if (error) {
        console.error('Failed to send contact message:', error);
        throw error;
      }

      setFormData({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        subject: '',
        message: '',
      });
      toast.success(t('contact.toast.success', "Message sent successfully! We'll get back to you soon."));
    } catch (error) {
      toast.error(t('contact.toast.error', 'Failed to send message. Please try again.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Layout>
      {/* Hero */}
      <section className="pt-32 pb-12 gradient-subtle">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center max-w-3xl mx-auto"
          >
            <span className="text-primary font-medium text-sm uppercase tracking-wider">
              {t('contact.hero.badge', 'Contact Us')}
            </span>
            <h1 className="text-4xl md:text-5xl font-bold mt-3 mb-6">
              {t('contact.hero.title', 'Get in Touch')}
            </h1>
            <p className="text-lg text-muted-foreground">
              {t(
                'contact.hero.description',
                "Have questions? We're here to help. Reach out to us through any of the channels below.",
              )}
            </p>
          </motion.div>
        </div>
      </section>

      {/* Contact Info Cards */}
      <section className="py-12">
        <div className="container mx-auto px-4">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {contactInfo.map((item, index) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
                className="bg-card rounded-2xl border border-border p-6 text-center hover:shadow-card transition-shadow"
              >
                <div className="w-14 h-14 rounded-2xl gradient-primary flex items-center justify-center mx-auto mb-4">
                  <item.icon className="w-7 h-7 text-primary-foreground" />
                </div>
                <h3 className="font-semibold mb-1">{item.title}</h3>
                <p className="text-primary font-medium">{item.value}</p>
                <p className="text-sm text-muted-foreground mt-1">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact Form & FAQ */}
      <section className="py-12">
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-12">
            {/* Contact Form */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="bg-card rounded-2xl border border-border p-8"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center">
                  <MessageSquare className="w-5 h-5 text-primary-foreground" />
                </div>
                <h2 className="text-xl font-semibold">{t('contact.form.title', 'Send us a Message')}</h2>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="firstName">{t('contact.form.firstName.label', 'First Name')}</Label>
                    <Input
                      id="firstName"
                      placeholder={t('contact.form.firstName.placeholder', 'John')}
                      className="mt-1.5"
                      value={formData.firstName}
                      onChange={(event) => setFormData((prev) => ({ ...prev, firstName: event.target.value }))}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="lastName">{t('contact.form.lastName.label', 'Last Name')}</Label>
                    <Input
                      id="lastName"
                      placeholder={t('contact.form.lastName.placeholder', 'Doe')}
                      className="mt-1.5"
                      value={formData.lastName}
                      onChange={(event) => setFormData((prev) => ({ ...prev, lastName: event.target.value }))}
                      required
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="email">{t('contact.form.email.label', 'Email Address')}</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder={t('contact.form.email.placeholder', 'john@example.com')}
                    className="mt-1.5"
                    value={formData.email}
                    onChange={(event) => setFormData((prev) => ({ ...prev, email: event.target.value }))}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="phone">{t('contact.form.phone.label', 'Phone Number (Optional)')}</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder={t('contact.form.phone.placeholder', '+1 (234) 567-890')}
                    className="mt-1.5"
                    value={formData.phone}
                    onChange={(event) => setFormData((prev) => ({ ...prev, phone: event.target.value }))}
                  />
                </div>

                <div>
                  <Label htmlFor="subject">{t('contact.form.subject.label', 'Subject')}</Label>
                  <Input
                    id="subject"
                    placeholder={t('contact.form.subject.placeholder', 'How can we help?')}
                    className="mt-1.5"
                    value={formData.subject}
                    onChange={(event) => setFormData((prev) => ({ ...prev, subject: event.target.value }))}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="message">{t('contact.form.message.label', 'Message')}</Label>
                  <Textarea
                    id="message"
                    placeholder={t('contact.form.message.placeholder', 'Tell us more about your inquiry...')}
                    className="mt-1.5 min-h-[120px]"
                    value={formData.message}
                    onChange={(event) => setFormData((prev) => ({ ...prev, message: event.target.value }))}
                    required
                  />
                </div>

                <Button type="submit" variant="gradient" size="lg" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                      {t('contact.form.sending', 'Sending...')}
                    </span>
                  ) : (
                    <>
                      {t('contact.form.submit', 'Send Message')}
                      <Send className="w-4 h-4" />
                    </>
                  )}
                </Button>
              </form>
            </motion.div>

            {/* FAQ */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center">
                  <HelpCircle className="w-5 h-5 text-accent-foreground" />
                </div>
                <h2 className="text-xl font-semibold">{t('contact.faq.title', 'Frequently Asked Questions')}</h2>
              </div>

              <div className="space-y-4">
                {faqs.map((faq, index) => (
                  <div
                    key={index}
                    className="bg-card rounded-2xl border border-border p-6 hover:shadow-card transition-shadow"
                  >
                    <h3 className="font-semibold mb-2">{faq.q}</h3>
                    <p className="text-sm text-muted-foreground">{faq.a}</p>
                  </div>
                ))}
              </div>

              <div className="mt-8 p-6 rounded-2xl bg-muted/50 text-center">
                <p className="text-muted-foreground mb-4">
                  {t('contact.faq.notFound', "Didn't find what you're looking for?")}
                </p>
                <Link to="/faq">
                  <Button variant="outline">
                    {t('contact.faq.viewAll', 'View All FAQs')}
                  </Button>
                </Link>
              </div>
            </motion.div>
          </div>
        </div>
      </section>
    </Layout>
  );
}
