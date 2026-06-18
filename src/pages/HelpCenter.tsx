import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Layout } from '@/components/layout';
import { 
  Search, 
  Book, 
  MessageCircle, 
  HelpCircle, 
  Video, 
  CreditCard, 
  ShieldCheck, 
  ArrowRight,
  User,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Link, useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';

export default function HelpCenter() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');

  const categories = useMemo(() => [
    {
      icon: User,
      title: 'Getting Started',
      description: 'Learn how to create an account, complete your profile, and start using MyE-Doctor.',
      link: '/faq#getting-started'
    },
    {
      icon: Video,
      title: 'Consultations',
      description: 'Everything you need to know about booking and attending your virtual medical appointments.',
      link: '/faq#consultations'
    },
    {
      icon: CreditCard,
      title: 'Payments & Billing',
      description: 'Information about consultation rates, payment methods, and how our wallet system works.',
      link: '/faq#payments'
    },
    {
      icon: ShieldCheck,
      title: 'Privacy & Security',
      description: 'How we protect your medical data and ensure your consultations remain private.',
      link: '/faq#security'
    }
  ], []);

  const popularArticles = [
    { title: 'How to book an appointment with a specialist?', link: '/faq#consultations' },
    { title: 'What should I do if my video call is lagging?', link: '/faq#consultations' },
    { title: 'How do I receive my digital prescription?', link: '/faq#consultations' },
    { title: 'Are consultations covered by insurance?', link: '/faq#payments' },
    { title: 'How do I reschedule my appointment?', link: '/faq#consultations' }
  ];

  const filteredCategories = useMemo(() => {
    if (!searchQuery) return categories;
    return categories.filter(cat => 
      cat.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cat.description.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery, categories]);

  const handleTopicClick = (topic: string) => {
    const topicMap: Record<string, string> = {
      'Booking': '/faq#consultations',
      'Prescriptions': '/faq#consultations',
      'Payment': '/faq#payments'
    };
    navigate(topicMap[topic] || '/faq');
  };

  return (
    <Layout>
      {/* Hero Section */}
      <section className="pt-32 pb-20 gradient-subtle overflow-hidden">
        <div className="container mx-auto px-4 relative">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center max-w-3xl mx-auto"
          >
            <h1 className="text-4xl md:text-5xl font-bold mb-6">
              How can we help you today?
            </h1>
            <div className="relative max-w-xl mx-auto">
              <Input 
                placeholder="Search for articles, guides, and more..." 
                className="h-14 pl-12 pr-12 bg-white text-foreground placeholder:text-muted-foreground border-none shadow-xl rounded-2xl"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded-full transition-colors"
                >
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              )}
            </div>
            <p className="mt-6 text-muted-foreground">
              Popular topics: {' '}
              {['Booking', 'Prescriptions', 'Payment'].map((topic, i, arr) => (
                <span key={topic}>
                  <button 
                    onClick={() => handleTopicClick(topic)}
                    className="underline hover:text-primary transition-colors font-medium"
                  >
                    {topic}
                  </button>
                  {i < arr.length - 1 ? ', ' : ''}
                </span>
              ))}
            </p>
          </motion.div>
        </div>
      </section>

      {/* Categories Grid */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="mb-12 flex items-center justify-between">
            <h2 className="text-2xl font-bold">
              {searchQuery ? `Search Results (${filteredCategories.length})` : 'Browse Categories'}
            </h2>
            {searchQuery && (
              <Button variant="ghost" onClick={() => setSearchQuery('')} className="text-primary">
                Clear Search
              </Button>
            )}
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            <AnimatePresence mode="popLayout">
              {filteredCategories.map((category, index) => (
                <motion.div
                  key={category.title}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.2 }}
                  className="group p-8 rounded-3xl bg-card border border-border hover:shadow-card hover:border-primary/20 transition-all cursor-pointer"
                  onClick={() => navigate(category.link)}
                >
                  <div className="w-14 h-14 rounded-2xl bg-primary-light flex items-center justify-center mb-6 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    <category.icon className="w-7 h-7" />
                  </div>
                  <h3 className="text-xl font-bold mb-3">{category.title}</h3>
                  <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
                    {category.description}
                  </p>
                  <div className="inline-flex items-center gap-2 text-primary font-semibold text-sm">
                    Learn More
                    <ArrowRight className="w-4 h-4" />
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          
          {searchQuery && filteredCategories.length === 0 && (
            <div className="text-center py-12">
              <HelpCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-20" />
              <p className="text-muted-foreground">No categories found matching "{searchQuery}"</p>
            </div>
          )}
        </div>
      </section>

      {/* Popular Articles & Sidebar */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="flex flex-col lg:flex-row gap-12">
            <div className="lg:w-2/3">
              <h2 className="text-2xl font-bold mb-8 flex items-center gap-2">
                <Book className="w-6 h-6 text-primary" />
                Popular Articles
              </h2>
              <div className="space-y-4">
                {popularArticles.map((article, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.05 }}
                    className="p-6 rounded-2xl bg-card border border-border hover:border-primary/30 hover:shadow-sm transition-all flex items-center justify-between group cursor-pointer"
                    onClick={() => navigate(article.link)}
                  >
                    <span className="font-medium group-hover:text-primary transition-colors">{article.title}</span>
                    <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-all group-hover:translate-x-1" />
                  </motion.div>
                ))}
              </div>
            </div>

            <div className="lg:w-1/3 space-y-8">
              <div className="p-8 rounded-3xl bg-primary text-primary-foreground">
                <HelpCircle className="w-10 h-10 mb-6 opacity-80" />
                <h3 className="text-2xl font-bold mb-4">Still need help?</h3>
                <p className="text-primary-foreground/80 mb-8">
                  Our support team is available 24/7 to assist you with any questions or issues.
                </p>
                <Link to="/contact">
                  <Button variant="secondary" className="w-full h-12 rounded-xl font-bold">
                    Contact Support
                  </Button>
                </Link>
              </div>

              <div className="p-8 rounded-3xl bg-card border border-border">
                <MessageCircle className="w-10 h-10 mb-6 text-primary" />
                <h3 className="text-xl font-bold mb-4">Chat with Us</h3>
                <p className="text-muted-foreground text-sm mb-6">
                  Get instant answers from our virtual assistant. Available directly in the app.
                </p>
                <Button variant="outline" className="w-full h-12 rounded-xl">
                  Start Live Chat
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom Section */}
      <section className="py-20 border-t border-border">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-8">Can't find what you're looking for?</h2>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/faq">
              <Button variant="outline" size="lg" className="px-8">
                Browse all FAQs
              </Button>
            </Link>
            <Link to="/contact">
              <Button variant="gradient" size="lg" className="px-8">
                Email Support
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </Layout>
  );
}
