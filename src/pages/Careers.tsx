import { motion } from 'framer-motion';
import { Layout } from '@/components/layout';
import { Briefcase, MapPin, Clock, Search, ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLanguage } from '@/contexts/LanguageContext';

export default function Careers() {
  const { t } = useLanguage();

  const jobs = [
    {
      title: 'Senior Frontend Engineer',
      department: 'Engineering',
      location: 'Remote / Lagos',
      type: 'Full-time'
    },
    {
      title: 'Medical Operations Manager',
      department: 'Operations',
      location: 'Lagos, Nigeria',
      type: 'Full-time'
    },
    {
      title: 'Customer Support Specialist',
      department: 'Support',
      location: 'Remote',
      type: 'Full-time'
    },
    {
      title: 'Product Designer (UX/UI)',
      department: 'Product',
      location: 'Remote',
      type: 'Full-time'
    }
  ];

  return (
    <Layout>
      {/* Hero Section */}
      <section className="pt-32 pb-20 gradient-hero text-primary-foreground overflow-hidden">
        <div className="container mx-auto px-4 relative text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-3xl mx-auto"
          >
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm text-sm font-medium mb-6">
              <Sparkles className="w-4 h-4 text-yellow-400" />
              We are hiring!
            </span>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6">
              Build the Future of Healthcare
            </h1>
            <p className="text-lg text-primary-foreground/80 mb-8">
              Join a mission-driven team dedicated to making quality medical care accessible to everyone across Africa.
            </p>
            <div className="relative max-w-xl mx-auto">
              <Input 
                placeholder="Search jobs by title or department..." 
                className="h-14 pl-12 bg-white text-foreground border-none shadow-xl rounded-2xl"
              />
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            </div>
          </motion.div>
        </div>
      </section>

      {/* Open Positions */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between mb-12 gap-6">
            <div>
              <h2 className="text-3xl font-bold mb-2">Open Positions</h2>
              <p className="text-muted-foreground">Find your next challenge in our growing team.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline">All Departments</Button>
              <Button variant="outline">Remote Only</Button>
            </div>
          </div>

          <div className="grid gap-4">
            {jobs.map((job, index) => (
              <motion.div
                key={job.title}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="group p-6 md:p-8 rounded-3xl bg-card border border-border hover:border-primary/30 hover:shadow-card transition-all flex flex-col md:flex-row md:items-center justify-between gap-6 cursor-pointer"
              >
                <div>
                  <span className="text-xs font-bold text-primary uppercase tracking-wider mb-2 block">{job.department}</span>
                  <h3 className="text-xl font-bold mb-3 group-hover:text-primary transition-colors">{job.title}</h3>
                  <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-4 h-4" />
                      {job.location}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      {job.type}
                    </span>
                  </div>
                </div>
                <Button variant="ghost" className="group-hover:bg-primary group-hover:text-primary-foreground transition-all gap-2">
                  Apply Now
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Culture Section */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <h2 className="text-3xl font-bold mb-6">Why Join MyE-Doctor?</h2>
              <div className="space-y-6">
                <div className="flex gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center shrink-0">
                    <Sparkles className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-bold mb-1">Impact at Scale</h4>
                    <p className="text-sm text-muted-foreground">Every line of code and every operational decision helps someone receive better medical care.</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center shrink-0">
                    <Users className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-bold mb-1">Collaborative Culture</h4>
                    <p className="text-sm text-muted-foreground">Work with a diverse group of passionate individuals who support each other's growth.</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center shrink-0">
                    <Clock className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-bold mb-1">Flexibility First</h4>
                    <p className="text-sm text-muted-foreground">We value output over hours. Enjoy remote-friendly policies and a focus on well-being.</p>
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
              <h3 className="text-2xl font-bold mb-4">Can't find the right role?</h3>
              <p className="text-primary-foreground/70 mb-8">
                We are always looking for talented individuals to join our mission. Send us your CV and we'll keep you in mind for future openings.
              </p>
              <Button variant="secondary" className="w-full">
                Submit General Application
              </Button>
            </motion.div>
          </div>
        </div>
      </section>
    </Layout>
  );
}
