import { Link } from 'react-router-dom';
import { Mail, Phone, Facebook, Twitter, Instagram, Linkedin } from 'lucide-react';
import logoImage from '@/assets/MyE-DoctorLogo.png';
import { useLanguage } from '@/contexts/LanguageContext';

const socialLinks = [
  { icon: Facebook, href: '#', label: 'Facebook' },
  { icon: Twitter, href: '#', label: 'Twitter' },
  { icon: Instagram, href: '#', label: 'Instagram' },
  { icon: Linkedin, href: '#', label: 'LinkedIn' },
];

export function Footer() {
  const { t } = useLanguage();

  const footerLinks = {
    services: [
      { label: t('footer.links.services.generalConsultation', 'General Consultation'), href: '/services#general' },
      { label: t('footer.links.services.specialistClinics', 'Specialist Clinics'), href: '/specialists' },
      { label: t('footer.links.services.videoConsultation', 'Video Consultation'), href: '/services#video' },
      { label: t('footer.links.services.eBooking', 'E-Booking'), href: '/booking' },
    ],
    support: [
      { label: t('footer.links.support.helpCenter', 'Help Center'), href: '/help' },
      { label: t('footer.links.support.contactUs', 'Contact Us'), href: '/contact' },
      { label: t('footer.links.support.faqs', 'FAQs'), href: '/faq' },
      { label: t('footer.links.support.privacyPolicy', 'Privacy Policy'), href: '/privacy' },
    ],
    company: [
      { label: t('footer.links.company.aboutUs', 'About Us'), href: '/about' },
      { label: t('footer.links.company.careers', 'Careers'), href: '/careers' },
      { label: t('footer.links.company.forDoctors', 'For Doctors'), href: '/for-doctors' },
      { label: t('footer.links.company.blog', 'Blog'), href: '/blog' },
    ],
  };

  return (
    <footer className="bg-foreground text-primary-foreground">
      <div className="container mx-auto px-4 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-12">
          {/* Brand */}
          <div className="lg:col-span-2">
            <Link to="/" className="flex items-center gap-2 mb-4">
              <img src={logoImage} alt={t('footer.logoAlt', 'MyE-Doctor Logo')} className="h-10 w-auto" />
              <span className="text-xl font-bold">
                MyE-<span className="text-primary">Doctor</span>
              </span>
            </Link>
            <p className="text-primary-foreground/70 text-sm mb-6 max-w-xs">
              {t(
                'footer.description',
                'Your trusted telemedicine platform connecting you with certified doctors and specialists from the comfort of your home.',
              )}
            </p>
            <div className="space-y-3">
              <a href="mailto:info@myedoctorhealth.com" className="flex items-center gap-2 text-sm text-primary-foreground/70 hover:text-primary transition-colors">
                <Mail className="w-4 h-4" />
                info@myedoctorhealth.com
              </a>
              <a href="tel:+2348068006867" className="flex items-center gap-2 text-sm text-primary-foreground/70 hover:text-primary transition-colors">
                <Phone className="w-4 h-4" />
                +2348068006867
              </a>
              <a href="tel:+2347033734785" className="flex items-center gap-2 text-sm text-primary-foreground/70 hover:text-primary transition-colors">
                <Phone className="w-4 h-4" />
                +2347033734785
              </a>
            </div>
          </div>

          {/* Links */}
          <div>
            <h4 className="font-semibold mb-4">{t('footer.sections.services', 'Services')}</h4>
            <ul className="space-y-2">
              {footerLinks.services.map((link) => (
                <li key={link.href}>
                  <Link to={link.href} className="text-sm text-primary-foreground/70 hover:text-primary transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4">{t('footer.sections.support', 'Support')}</h4>
            <ul className="space-y-2">
              {footerLinks.support.map((link) => (
                <li key={link.href}>
                  <Link to={link.href} className="text-sm text-primary-foreground/70 hover:text-primary transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4">{t('footer.sections.company', 'Company')}</h4>
            <ul className="space-y-2">
              {footerLinks.company.map((link) => (
                <li key={link.href}>
                  <Link to={link.href} className="text-sm text-primary-foreground/70 hover:text-primary transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="border-t border-primary-foreground/10 mt-12 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex flex-col items-center md:items-start gap-2">
            <p className="text-sm text-primary-foreground/50">
              {t('footer.copyrightPrefix', '©')} {new Date().getFullYear()} MyEdoctor.{' '}
              {t('footer.allRightsReserved', 'All rights reserved.')}
            </p>
            <p className="text-xs text-primary-foreground/40">
              {t('footer.poweredBy', 'Powered by')} <span className="text-primary font-semibold">HealthLink</span>
            </p>
          </div>
          <div className="flex items-center gap-4">
            {socialLinks.map((social) => (
              <a
                key={social.label}
                href={social.href}
                className="w-10 h-10 rounded-full bg-primary-foreground/10 flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition-all"
                aria-label={social.label}
              >
                <social.icon className="w-5 h-5" />
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
