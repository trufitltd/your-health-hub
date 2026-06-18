import { motion } from 'framer-motion';
import { Layout } from '@/components/layout';
import { 
  Users, 
  Wallet, 
  TrendingUp, 
  ShieldCheck, 
  ArrowRight, 
  Sparkles,
  CheckCircle2,
  Gift
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';

export default function Careers() {
  const { t } = useLanguage();

  const benefits = [
    {
      icon: Wallet,
      title: 'Earn Commissions',
      description: 'Get paid for every successful booking made through your unique agent referral link.'
    },
    {
      icon: TrendingUp,
      title: 'Unlimited Growth',
      description: 'The more patients you refer, the more you earn. There is no cap on your potential commissions.'
    },
    {
      icon: Users,
      title: 'Impact Lives',
      description: 'Help people in your community access quality healthcare easily and affordably.'
    },
    {
      icon: ShieldCheck,
      title: 'Trusted Platform',
      description: 'Join a verified healthcare network with over 120+ certified medical professionals.'
    }
  ];

  return (
    <Layout>
      {/* Hero Section */}
      <section className="pt-32 pb-20 gradient-subtle overflow-hidden">
        <div className="container mx-auto px-4 relative text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-3xl mx-auto"
          >
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary-light text-primary text-sm font-medium mb-6">
              <Sparkles className="w-4 h-4 text-primary" />
              Join our Agent Program
            </span>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6">
              Empower Your Community & <span className="text-gradient">Earn Commissions</span>
            </h1>
            <p className="text-lg text-muted-foreground mb-8">
              Become a MyE-Doctor Agent today. Refer patients to our platform and get rewarded for every successful medical consultation.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/careers/agent">
                <Button variant="hero" size="xl" className="w-full sm:w-auto font-bold">
                  Sign Up as an Agent
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
              <Link to="/contact">
                <Button variant="outline" size="xl" className="w-full sm:w-auto">
                  Inquire about T&C
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* How it Works / Benefits */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold mb-4">Why Become a MyE-Doctor Agent?</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Our agent program is designed to reward those who help us expand our reach and make healthcare accessible to all.
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
                className="p-8 rounded-3xl bg-card border border-border hover:border-primary/30 hover:shadow-card transition-all"
              >
                <div className="w-14 h-14 rounded-2xl bg-primary-light flex items-center justify-center mb-6 text-primary">
                  <benefit.icon className="w-7 h-7" />
                </div>
                <h3 className="text-xl font-bold mb-3">{benefit.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {benefit.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Commission Structure */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <h2 className="text-3xl md:text-4xl font-bold mb-6">Simple & Transparent Commissions</h2>
              <div className="space-y-6">
                <div className="flex gap-4 p-6 rounded-2xl bg-white shadow-sm border border-border">
                  <div className="w-12 h-12 rounded-xl bg-success/10 flex items-center justify-center shrink-0">
                    <Gift className="w-6 h-6 text-success" />
                  </div>
                  <div>
                    <h4 className="font-bold mb-1">Standard Commission</h4>
                    <p className="text-sm text-muted-foreground">Earn a fixed percentage of the consultation fee for every patient you refer who completes a booking.</p>
                  </div>
                </div>
                <div className="flex gap-4 p-6 rounded-2xl bg-white shadow-sm border border-border">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <TrendingUp className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-bold mb-1">Performance Bonuses</h4>
                    <p className="text-sm text-muted-foreground">Reach monthly referral targets and unlock higher commission tiers and special bonuses.</p>
                  </div>
                </div>
                <div className="flex gap-4 p-6 rounded-2xl bg-white shadow-sm border border-border">
                  <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-6 h-6 text-accent" />
                  </div>
                  <div>
                    <h4 className="font-bold mb-1">Instant Payouts</h4>
                    <p className="text-sm text-muted-foreground">Commission is credited to your agent wallet immediately after a successful consultation is completed.</p>
                  </div>
                </div>
              </div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="bg-foreground p-12 rounded-3xl text-primary-foreground relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/20 rounded-full -mr-16 -mt-16" />
              <h3 className="text-3xl font-bold mb-4">Start Earning Today</h3>
              <p className="text-primary-foreground/70 mb-8 leading-relaxed">
                Joining the MyE-Doctor Agent Program is free. Once registered, you will get access to your personal agent dashboard where you can track your referrals and earnings in real-time.
              </p>
              <ul className="space-y-3 mb-10">
                <li className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-success" />
                  No registration fees
                </li>
                <li className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-success" />
                  Free training and marketing materials
                </li>
                <li className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-success" />
                  Dedicated agent support team
                </li>
              </ul>
              <Link to="/careers/agent">
                <Button variant="secondary" className="w-full h-14 font-bold text-lg">
                  Register as an Agent
                </Button>
              </Link>
            </motion.div>
          </div>
        </div>
      </section>

      {/* FAQ Link */}
      <section className="py-20">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-2xl font-bold mb-4">Have more questions?</h2>
          <p className="text-muted-foreground mb-8">Check our Help Center or contact our dedicated agent support team.</p>
          <div className="flex justify-center gap-4">
            <Link to="/help">
              <Button variant="outline">Visit Help Center</Button>
            </Link>
            <Link to="/contact">
              <Button variant="ghost">Contact Us</Button>
            </Link>
          </div>
        </div>
      </section>
    </Layout>
  );
}
