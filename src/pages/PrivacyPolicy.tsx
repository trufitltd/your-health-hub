import { motion } from 'framer-motion';
import { Layout } from '@/components/layout';
import { Shield, Lock, Eye, FileText, ChevronRight } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

export default function PrivacyPolicy() {
  const { t } = useLanguage();

  const sections = [
    {
      title: '1. Introduction',
      content: 'Welcome to MyE-Doctor. We are committed to protecting your personal information and your right to privacy. If you have any questions or concerns about our policy, or our practices with regards to your personal information, please contact us at info@myedoctorhealth.com.',
      icon: Shield
    },
    {
      title: '2. Information We Collect',
      content: 'We collect personal information that you provide to us such as name, address, contact information, passwords and security data, and payment information. We also collect health-related information necessary for providing medical consultations.',
      icon: FileText
    },
    {
      title: '3. How We Use Your Information',
      content: 'We use personal information collected via our Services for a variety of business purposes described below. We process your personal information for these purposes in reliance on our legitimate business interests, in order to enter into or perform a contract with you, with your consent, and/or for compliance with our legal obligations.',
      icon: Eye
    },
    {
      title: '4. Sharing Your Information',
      content: 'We only share information with your consent, to comply with laws, to provide you with services, to protect your rights, or to fulfill business obligations. Your medical information is only shared with the healthcare providers you consult with.',
      icon: Lock
    }
  ];

  return (
    <Layout>
      <section className="pt-32 pb-20 gradient-subtle">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-3xl mx-auto text-center"
          >
            <h1 className="text-4xl md:text-5xl font-bold mb-6">Privacy Policy</h1>
            <p className="text-lg text-muted-foreground">
              Last updated: June 17, 2026. Please read this privacy policy carefully as it will help you make informed decisions about sharing your personal information with us.
            </p>
          </motion.div>
        </div>
      </section>

      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="grid gap-12">
              {sections.map((section, index) => (
                <motion.div
                  key={section.title}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  className="flex gap-6"
                >
                  <div className="hidden sm:flex w-12 h-12 rounded-2xl bg-primary-light items-center justify-center shrink-0">
                    <section.icon className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                      <span className="sm:hidden w-8 h-8 rounded-lg bg-primary-light flex items-center justify-center">
                        <section.icon className="w-4 h-4 text-primary" />
                      </span>
                      {section.title}
                    </h2>
                    <p className="text-muted-foreground leading-relaxed">
                      {section.content}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="mt-20 p-8 rounded-3xl bg-muted/50 border border-border"
            >
              <h3 className="text-xl font-bold mb-4">Contact Us</h3>
              <p className="text-muted-foreground mb-6">
                If you have questions or comments about this policy, you may email us at info@myedoctorhealth.com or by post to:
              </p>
              <div className="text-sm">
                <p className="font-semibold text-foreground">MyE-Doctor Health Limited</p>
                <p className="text-muted-foreground">123 Healthcare Street, Medical City</p>
                <p className="text-muted-foreground">Lagos, Nigeria</p>
              </div>
            </motion.div>
          </div>
        </div>
      </section>
    </Layout>
  );
}
