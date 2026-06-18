import { motion } from 'framer-motion';
import { Layout } from '@/components/layout';
import { 
  Calendar, 
  User, 
  ArrowRight, 
  Search,
  Tag,
  Clock,
  Heart,
  Shield,
  Stethoscope
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Link } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';

const blogPosts = [
  {
    id: 1,
    title: 'The Future of Telemedicine in Nigeria',
    excerpt: 'How digital health platforms are transforming healthcare delivery across Africa, making it more accessible and affordable.',
    author: 'Dr. Sarah Johnson',
    date: 'June 15, 2026',
    readTime: '5 min read',
    category: 'Health Tech',
    image: 'https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&q=80&w=800',
    icon: Stethoscope
  },
  {
    id: 2,
    title: 'Mental Health in the Digital Age',
    excerpt: 'Understanding the importance of mental well-being and how virtual consultations are breaking the stigma in local communities.',
    author: 'Dr. Michael Chen',
    date: 'June 10, 2026',
    readTime: '8 min read',
    category: 'Wellness',
    image: 'https://images.unsplash.com/photo-1527137342181-19aab11a8ee1?auto=format&fit=crop&q=80&w=800',
    icon: Heart
  },
  {
    id: 3,
    title: 'Protecting Your Health Data Online',
    excerpt: 'Key measures we take to ensure your medical records and personal information remain secure and private on our platform.',
    author: 'Tech Security Team',
    date: 'June 5, 2026',
    readTime: '6 min read',
    category: 'Security',
    image: 'https://images.unsplash.com/photo-1563986768609-322da13575f3?auto=format&fit=crop&q=80&w=800',
    icon: Shield
  }
];

const categories = [
  'All',
  'Health Tech',
  'Wellness',
  'Security',
  'Medical Advice',
  'Platform Updates'
];

export default function BlogPage() {
  const { t } = useLanguage();

  return (
    <Layout>
      {/* Hero Section */}
      <section className="pt-32 pb-20 gradient-subtle overflow-hidden">
        <div className="container mx-auto px-4 relative">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -z-10" />
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center max-w-3xl mx-auto"
          >
            <span className="text-primary font-medium text-sm uppercase tracking-wider">
              {t('blog.hero.badge', 'Health Insights')}
            </span>
            <h1 className="text-4xl md:text-5xl font-bold mt-3 mb-6">
              {t('blog.hero.title', 'MyE-Doctor Blog')}
            </h1>
            <p className="text-lg text-muted-foreground">
              {t(
                'blog.hero.description',
                'Your source for the latest health tips, medical innovations, and platform updates from the MyE-Doctor team.',
              )}
            </p>
          </motion.div>
        </div>
      </section>

      {/* Main Content */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="flex flex-col lg:flex-row gap-12">
            {/* Blog Posts Grid */}
            <div className="lg:w-2/3">
              <div className="grid gap-8">
                {blogPosts.map((post, index) => (
                  <motion.article
                    key={post.id}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: index * 0.1 }}
                    className="group bg-card border border-border rounded-2xl overflow-hidden hover:shadow-card transition-all duration-300"
                  >
                    <div className="flex flex-col md:flex-row">
                      <div className="md:w-1/3 relative overflow-hidden">
                        <img 
                          src={post.image} 
                          alt={post.title}
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                        />
                        <div className="absolute top-4 left-4">
                          <span className="px-3 py-1 rounded-full bg-white/90 text-primary text-xs font-semibold shadow-sm backdrop-blur-sm">
                            {post.category}
                          </span>
                        </div>
                      </div>
                      <div className="md:w-2/3 p-6 md:p-8">
                        <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5" />
                            {post.date}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            {post.readTime}
                          </span>
                        </div>
                        <h2 className="text-2xl font-bold mb-3 group-hover:text-primary transition-colors">
                          <Link to={`/blog/${post.id}`}>{post.title}</Link>
                        </h2>
                        <p className="text-muted-foreground mb-6 line-clamp-2">
                          {post.excerpt}
                        </p>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-primary-light flex items-center justify-center">
                              <User className="w-4 h-4 text-primary" />
                            </div>
                            <span className="text-sm font-medium">{post.author}</span>
                          </div>
                          <Link to={`/blog/${post.id}`}>
                            <Button variant="ghost" size="sm" className="gap-2 group/btn">
                              Read More
                              <ArrowRight className="w-4 h-4 transition-transform group-hover/btn:translate-x-1" />
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </div>
                  </motion.article>
                ))}
              </div>

              {/* Newsletter Placeholder */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                className="mt-16 p-8 md:p-12 rounded-3xl gradient-primary text-primary-foreground text-center"
              >
                <h3 className="text-2xl md:text-3xl font-bold mb-4">Subscribe to Our Newsletter</h3>
                <p className="text-primary-foreground/80 mb-8 max-w-lg mx-auto">
                  Get the latest health tips and updates delivered straight to your inbox every week.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
                  <Input 
                    placeholder="Enter your email" 
                    className="bg-white/10 border-white/20 text-white placeholder:text-white/50 h-12"
                  />
                  <Button variant="secondary" size="lg" className="h-12 px-8">
                    Subscribe
                  </Button>
                </div>
              </motion.div>
            </div>

            {/* Sidebar */}
            <aside className="lg:w-1/3 space-y-8">
              {/* Search */}
              <div className="p-6 rounded-2xl bg-card border border-border">
                <h4 className="font-semibold mb-4 flex items-center gap-2">
                  <Search className="w-4 h-4" />
                  Search Articles
                </h4>
                <div className="relative">
                  <Input placeholder="Keywords..." className="pr-10" />
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                </div>
              </div>

              {/* Categories */}
              <div className="p-6 rounded-2xl bg-card border border-border">
                <h4 className="font-semibold mb-4 flex items-center gap-2">
                  <Tag className="w-4 h-4" />
                  Categories
                </h4>
                <div className="flex flex-wrap gap-2">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      className="px-3 py-1.5 rounded-lg border border-border text-sm hover:border-primary hover:text-primary transition-all"
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Featured Topic */}
              <div className="p-6 rounded-2xl bg-muted/50 border border-border relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-24 h-24 bg-primary/10 rounded-full -mr-12 -mt-12 transition-transform group-hover:scale-150 duration-500" />
                <h4 className="font-bold text-lg mb-2 relative z-10">Telemedicine FAQ</h4>
                <p className="text-sm text-muted-foreground mb-4 relative z-10">
                  New to online consultations? Check our comprehensive guide to getting the most out of your visit.
                </p>
                <Link to="/faq" className="text-primary text-sm font-semibold flex items-center gap-1 group-hover:gap-2 transition-all">
                  Visit Help Center
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </aside>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="py-20 border-t border-border">
        <div className="container mx-auto px-4 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl font-bold mb-4">Want to talk to a doctor instead?</h2>
            <p className="text-muted-foreground mb-8">Connect with a certified medical professional in minutes.</p>
            <Link to="/booking">
              <Button variant="gradient" size="xl">
                Book a Consultation Now
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
          </motion.div>
        </div>
      </section>
    </Layout>
  );
}
