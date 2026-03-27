import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, User, LogOut, LayoutDashboard, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { toast } from '@/components/ui/use-toast';
import logoImage from '@/assets/MyE-DoctorLogo.png';
import { LanguageSelector } from '@/components/LanguageSelector';
import { useLanguage } from '@/contexts/LanguageContext';

export function Header() {
  const complianceNotice =
    'MyE-Doctor is fully In Compliant with Medical and Dental Council of Nigeria (MDCN) professional standards and Nigeria Data Protection Commission (NDPC) data protection regulations';
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const { user, role, signOut, isLoading } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const navLinks = [
    { href: '/', label: t('common.home', 'Home') },
    { href: '/services', label: t('common.services', 'Services') },
    { href: '/specialists', label: t('common.specialists', 'Specialists') },
    { href: '/booking', label: t('common.bookNow', 'Book Now') },
    { href: '/contact', label: t('common.contact', 'Contact') },
  ];

  const handleSignOut = async () => {
    try {
      await signOut();
      toast({
        title: t('header.toast.signedOut.title', 'Signed out'),
        description: t('header.toast.signedOut.description', 'You have been signed out.'),
      });
      navigate('/');
    } catch (error: unknown) {
      const message =
        error && typeof error === 'object' && 'message' in error
          ? (error as { message?: string }).message
          : t('header.toast.signOutError.description', 'Failed to sign out');
      toast({ title: t('header.toast.signOutError.title', 'Error'), description: message });
    }
  };

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const dashboardLink =
    role === 'doctor'
      ? '/doctor-portal'
      : role === 'admin'
        ? '/admin'
        : role === 'coo'
          ? '/coo'
          : '/patient-portal';

  return (
    <header
      className={cn(
        'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
        isScrolled ? 'glass shadow-md py-2' : 'bg-transparent py-4'
      )}
    >
      <div className="container mx-auto px-4">
        <nav className="flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 group">
            <img src={logoImage} alt={t('header.logoAlt', 'MyE-Doctor Logo')} className="h-10 w-auto" />
            <div className="flex flex-col">
              <span className="text-xl font-bold text-foreground leading-tight">
                MyE-<span className="text-primary">Doctor</span>
              </span>
              <span className="text-[10px] text-muted-foreground leading-tight">
                {t('header.poweredBy', 'Powered by HealthLink')}
              </span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                className={cn(
                  'px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200',
                  location.pathname === link.href
                    ? 'text-primary bg-primary-light'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                )}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Desktop CTA */}
          <div className="hidden md:flex items-center gap-3">
            {!isLoading && user ? (
              <div className="flex items-center gap-2">
                <LanguageSelector />
                <Link to={dashboardLink}>
                  <Button variant="default" size="sm" className="gap-2">
                    <LayoutDashboard className="w-4 h-4" />
                    {t('common.dashboard', 'Dashboard')}
                  </Button>
                </Link>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSignOut}
                  className="flex items-center gap-1"
                >
                  <LogOut className="w-4 h-4" />
                  {t('common.signOut', 'Sign Out')}
                </Button>
              </div>
            ) : (
              <>
                <LanguageSelector />
                <Link to="/auth">
                  <Button variant="ghost" size="sm">
                    <User className="w-4 h-4 mr-1" />
                    {t('common.login', 'Login')}
                  </Button>
                </Link>
                <Link to="/auth?mode=register">
                  <Button variant="gradient" size="sm">
                    {t('common.getStarted', 'Get Started')}
                  </Button>
                </Link>
              </>
            )}
          </div>

          {/* Mobile Menu Toggle */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-lg hover:bg-muted transition-colors"
            aria-label={t('header.toggleMenuAria', 'Toggle menu')}
          >
            {mobileMenuOpen ? (
              <X className="w-6 h-6" />
            ) : (
              <Menu className="w-6 h-6" />
            )}
          </button>
        </nav>
        <div className="mt-2 rounded-md border border-emerald-200/80 bg-emerald-50/95 px-3 py-2">
          <p className="flex items-start justify-center gap-2 text-center text-[11px] leading-relaxed text-emerald-900 md:text-xs">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{complianceNotice}</span>
          </p>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden glass border-t border-border"
          >
            <div className="container mx-auto px-4 py-4 flex flex-col gap-2">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  to={link.href}
                  className={cn(
                    'px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200',
                    location.pathname === link.href
                      ? 'text-primary bg-primary-light'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  )}
                >
                  {link.label}
                </Link>
              ))}
              <div className="flex flex-col gap-2 mt-4 pt-4 border-t border-border">
                <LanguageSelector />
                {!isLoading && user ? (
                  <>
                    <div className="px-4 py-2 rounded-lg bg-muted">
                      <p className="text-sm font-medium text-foreground">
                        {user.email}
                      </p>
                    </div>
                    <Link to={dashboardLink}>
                      <Button variant="default" className="w-full justify-start gap-2">
                        <LayoutDashboard className="w-4 h-4" />
                        {t('common.dashboard', 'Dashboard')}
                      </Button>
                    </Link>
                    <Button
                      variant="outline"
                      className="w-full justify-start"
                      onClick={handleSignOut}
                    >
                      <LogOut className="w-4 h-4 mr-2" />
                      {t('common.signOut', 'Sign Out')}
                    </Button>
                  </>
                ) : (
                  <>
                    <Link to="/auth">
                      <Button variant="outline" className="w-full">
                        {t('common.login', 'Login')}
                      </Button>
                    </Link>
                    <Link to="/auth?mode=register">
                      <Button variant="gradient" className="w-full">
                        {t('common.getStarted', 'Get Started')}
                      </Button>
                    </Link>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
