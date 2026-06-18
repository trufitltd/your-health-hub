import { motion } from 'framer-motion';
import { Layout } from '@/components/layout';
import { 
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useLanguage } from '@/contexts/LanguageContext';

export default function FAQ() {
  const { t } = useLanguage();

  const faqs = [
    {
      category: 'General',
      id: 'getting-started',
      questions: [
        {
          q: 'What is MyE-Doctor?',
          a: 'MyE-Doctor is a comprehensive telemedicine platform that connects patients with certified medical professionals for virtual consultations via video, audio, and chat.'
        },
        {
          q: 'How do I create an account?',
          a: 'Click on the "Get Started" button in the header, choose "Patient", and fill in your details. You will need to verify your email to complete the registration.'
        }
      ]
    },
    {
      category: 'Consultations',
      id: 'consultations',
      questions: [
        {
          q: 'How do I book an appointment?',
          a: 'Login to your patient portal, click on "Book Appointment", select a doctor or specialty, choose a convenient time slot, and confirm your booking.'
        },
        {
          q: 'What happens during a video consultation?',
          a: 'At the scheduled time, you join the consultation room from your dashboard. You and your doctor can see and hear each other, and the doctor can provide medical advice, diagnosis, and prescriptions.'
        }
      ]
    },
    {
      category: 'Payments',
      id: 'payments',
      questions: [
        {
          q: 'How much does a consultation cost?',
          a: 'Rates vary depending on the doctor and specialty. You can see the consultation rate on the doctor\'s profile before booking.'
        },
        {
          q: 'What payment methods do you accept?',
          a: 'We currently accept major credit/debit cards and bank transfers through our secure payment gateway (Paystack).'
        }
      ]
    },
    {
      category: 'Security',
      id: 'security',
      questions: [
        {
          q: 'Is my medical data secure?',
          a: 'Yes, we take security very seriously. All communications are end-to-end encrypted, and your health records are stored following international healthcare data protection standards.'
        }
      ]
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
            <h1 className="text-4xl md:text-5xl font-bold mb-6">Frequently Asked Questions</h1>
            <p className="text-lg text-muted-foreground">
              Find answers to common questions about using MyE-Doctor.
            </p>
          </motion.div>
        </div>
      </section>

      <section className="py-20">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="space-y-12">
            {faqs.map((group, idx) => (
              <div key={idx} id={group.id} className="scroll-mt-32">
                <h2 className="text-2xl font-bold mb-6 text-primary border-b pb-2">{group.category}</h2>
                <Accordion type="single" collapsible className="w-full">
                  {group.questions.map((faq, fIdx) => (
                    <AccordionItem key={fIdx} value={`item-${idx}-${fIdx}`}>
                      <AccordionTrigger className="text-left font-semibold">
                        {faq.q}
                      </AccordionTrigger>
                      <AccordionContent className="text-muted-foreground leading-relaxed">
                        {faq.a}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            ))}
          </div>
        </div>
      </section>
    </Layout>
  );
}
