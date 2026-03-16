import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, ArrowLeft, Check, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/use-toast';
import logoImage from '@/assets/MyE-DoctorLogo.png';
import { useLanguage } from '@/contexts/LanguageContext';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const { t } = useLanguage();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email) {
      toast({
        title: t('auth.resetPassword.errorTitle', 'Error sending reset link'),
        description: 'Please enter your email address.',
      });
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth?mode=reset`,
      });

      if (error) {
        console.error('Reset password error:', error);
        toast({
          title: t('auth.resetPassword.errorTitle', 'Error sending reset link'),
          description: error.message,
        });
      } else {
        setIsSuccess(true);
        toast({
          title: t('auth.resetPassword.successTitle', 'Check your email'),
          description: t('auth.resetPassword.successDescription', 'We\'ve sent a password reset link to your email address'),
        });
      }
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'message' in err ? (err as { message?: string }).message : String(err);
      toast({
        title: t('auth.resetPassword.errorTitle', 'Error sending reset link'),
        description: message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Form */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-8 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md max-h-screen overflow-y-auto py-4"
        >
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 mb-8">
            <img src={logoImage} alt="MyE-Doctor Logo" className="h-10 w-auto" />
            <div className="flex flex-col">
              <span className="text-xl font-bold leading-tight">
                MyE-<span className="text-primary">Doctor</span>
              </span>
            </div>
          </Link>

          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-foreground mb-2">
              {t('auth.resetPassword.title', 'Reset your password')}
            </h1>
            <p className="text-muted-foreground">
              {t('auth.resetPassword.subtitle', 'Enter your email address and we\'ll send you a link to reset your password')}
            </p>
          </div>

          {isSuccess ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center"
            >
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-xl font-semibold text-foreground mb-2">
                {t('auth.resetPassword.successTitle', 'Check your email')}
              </h2>
              <p className="text-muted-foreground mb-6">
                {t('auth.resetPassword.successDescription', 'We\'ve sent a password reset link to your email address')}
              </p>
              <Link to="/auth">
                <Button variant="outline" className="w-full">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  {t('auth.resetPassword.backToLogin', 'Back to login')}
                </Button>
              </Link>
            </motion.div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="email">
                  {t('auth.fields.emailAddress', 'Email Address')}
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder={t('auth.resetPassword.emailPlaceholder', 'Enter your email address')}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <Button
                type="submit"
                variant="gradient"
                size="lg"
                className="w-full"
                disabled={isLoading}
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                    {t('auth.verifying', 'Verifying...')}
                  </span>
                ) : (
                  t('auth.resetPassword.sendResetLink', 'Send reset link')
                )}
              </Button>

              <div className="text-center">
                <Link
                  to="/auth"
                  className="text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  <ArrowLeft className="w-4 h-4 inline mr-1" />
                  {t('auth.resetPassword.backToLogin', 'Back to login')}
                </Link>
              </div>
            </form>
          )}
        </motion.div>
      </div>

      {/* Right Panel - Illustration */}
      <div className="hidden lg:flex flex-1 bg-gradient-to-br from-primary/5 to-primary/10 items-center justify-center p-8">
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="max-w-md text-center"
        >
          <div className="w-32 h-32 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <Mail className="w-16 h-16 text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-4">
            {t('auth.rightPanel.tagline', 'Your Doctor, Anytime, Anywhere')}
          </h2>
          <p className="text-muted-foreground">
            {t('auth.rightPanel.generalDescription', 'Join MyEdoctor and experience healthcare reimagined. Connect with top specialists, manage appointments, and access your health records - all in one place.')}
          </p>
        </motion.div>
      </div>
    </div>
  );
};

export default ForgotPassword;