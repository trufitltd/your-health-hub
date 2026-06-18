import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mail,
  Lock,
  User,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  CheckCircle2,
  Wallet,
  TrendingUp,
  Users,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/use-toast';
import logoImage from '@/assets/MyE-DoctorLogo.png';

type AuthMode = 'login' | 'register';

const perks = [
  {
    icon: Wallet,
    title: 'Earn Commissions',
    description: 'Get paid for every successful booking made through your unique referral link.',
  },
  {
    icon: TrendingUp,
    title: 'Unlimited Growth',
    description: 'No cap on earnings — refer more patients, earn more commissions.',
  },
  {
    icon: Users,
    title: 'Impact Lives',
    description: 'Help people in your community access quality healthcare with ease.',
  },
  {
    icon: ShieldCheck,
    title: 'Trusted Network',
    description: 'Join a verified platform with 120+ certified medical professionals.',
  },
];

export default function AgentAuth() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<AuthMode>('register');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      toast({ title: 'Email required', description: 'Please enter your email address.' });
      return;
    }
    if (!password) {
      toast({ title: 'Password required', description: 'Please enter your password.' });
      return;
    }

    setIsLoading(true);

    try {
      if (mode === 'register') {
        if (!name.trim()) {
          toast({ title: 'Name required', description: 'Please enter your full name.' });
          setIsLoading(false);
          return;
        }

        const { data, error } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/careers/agent?mode=login&verified=1`,
            data: {
              role: 'agent',
              full_name: name.trim(),
            },
          },
        });

        if (error) {
          const msg = error.message.toLowerCase();
          if (
            msg.includes('already registered') ||
            msg.includes('already exists') ||
            msg.includes('email already')
          ) {
            toast({
              title: 'Email already in use',
              description: 'This email already exists. Please sign in instead.',
            });
          } else {
            toast({ title: 'Registration failed', description: error.message });
          }
          setIsLoading(false);
          return;
        }

        // Obfuscated duplicate
        if (Array.isArray(data.user?.identities) && data.user.identities.length === 0) {
          toast({
            title: 'Email already in use',
            description: 'This email already exists. Please sign in instead.',
          });
          setIsLoading(false);
          return;
        }

        // Auto-confirmed (email verification disabled)
        if (data.user?.email_confirmed_at) {
          localStorage.setItem('userRole', 'agent');
          toast({ title: 'Account created!', description: 'Welcome to the MyE-Doctor Agent Program!' });
          setIsLoading(false);
          navigate('/patient-portal');
          return;
        }

        setIsLoading(false);
        toast({
          title: 'Check your email',
          description: 'A confirmation link has been sent. Open it, then sign in below.',
        });
        setMode('login');
      } else {
        // Login
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });

        if (error) {
          toast({
            title: 'Sign in failed',
            description: error.message,
            variant: 'destructive',
          });
          setIsLoading(false);
          return;
        }

        const rawRole = String(
          data.user?.user_metadata?.role || data.user?.app_metadata?.role || ''
        ).toLowerCase();

        if (rawRole !== 'agent') {
          await supabase.auth.signOut();
          toast({
            title: 'Wrong account type',
            description:
              rawRole === 'doctor'
                ? 'This is a Doctor account. Please use the Doctor sign-in page.'
                : 'This account is not registered as an Agent. Please sign up below.',
            variant: 'destructive',
          });
          setIsLoading(false);
          return;
        }

        localStorage.setItem('userRole', 'agent');
        toast({ title: 'Welcome back!', description: 'Signed in as Agent.' });
        setIsLoading(false);
        navigate('/patient-portal');
      }
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? (err as { message?: string }).message
          : String(err);
      toast({ title: 'Error', description: message });
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-background">
      {/* ─── Left — Form Panel ─── */}
      <div className="flex-1 flex flex-col justify-center items-center p-6 sm:p-10 lg:p-16 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 mb-10 group">
            <img
              src={logoImage}
              alt="MyE-Doctor Logo"
              className="h-10 w-auto object-contain"
            />
            <div className="flex flex-col leading-tight">
              <span className="text-xl font-bold">
                MyE-<span className="text-primary">Doctor</span>
              </span>
              <span className="text-[10px] text-muted-foreground">Powered by HealthLink</span>
            </div>
          </Link>

          {/* Badge */}
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold mb-5">
            <Sparkles className="w-3.5 h-3.5" />
            Agent Program
          </span>

          {/* Title */}
          <AnimatePresence mode="wait">
            <motion.div
              key={mode}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
            >
              <h1 className="text-3xl md:text-4xl font-bold mb-2">
                {mode === 'register' ? (
                  <>
                    Join as an <span className="text-primary">Agent</span>
                  </>
                ) : (
                  'Welcome back, Agent'
                )}
              </h1>
              <p className="text-muted-foreground mb-8">
                {mode === 'register'
                  ? 'Create your free agent account and start earning commissions today.'
                  : 'Sign in to access your agent dashboard and track your referrals.'}
              </p>
            </motion.div>
          </AnimatePresence>

          {/* Tab Switcher */}
          <div className="flex rounded-xl border border-border p-1 mb-8 bg-muted/30">
            {(['register', 'login'] as AuthMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all duration-200 ${
                  mode === m
                    ? 'bg-white shadow text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {m === 'register' ? 'Sign Up' : 'Sign In'}
              </button>
            ))}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <AnimatePresence>
              {mode === 'register' && (
                <motion.div
                  key="name-field"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <Label htmlFor="agent-name" className="text-sm font-medium mb-1.5 block">
                    Full Name
                  </Label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    <Input
                      id="agent-name"
                      type="text"
                      placeholder="John Doe"
                      className="pl-10 h-12"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      autoComplete="name"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div>
              <Label htmlFor="agent-email" className="text-sm font-medium mb-1.5 block">
                Email Address
              </Label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="agent-email"
                  type="email"
                  placeholder="you@example.com"
                  className="pl-10 h-12"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            <div>
              <Label htmlFor="agent-password" className="text-sm font-medium mb-1.5 block">
                Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="agent-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder={mode === 'register' ? 'Min. 8 characters' : '••••••••'}
                  className="pl-10 pr-12 h-12"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  minLength={mode === 'register' ? 8 : undefined}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {mode === 'login' && (
              <div className="text-right -mt-2">
                <Link
                  to="/forgot-password"
                  className="text-sm text-primary hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
            )}

            {mode === 'register' && (
              <p className="text-xs text-muted-foreground">
                By registering, you agree to our{' '}
                <Link to="/privacy" className="text-primary hover:underline">
                  Privacy Policy
                </Link>{' '}
                and agent terms of service.
              </p>
            )}

            <Button
              type="submit"
              variant="hero"
              size="lg"
              className="w-full h-12 font-bold text-base"
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  {mode === 'register' ? 'Creating account…' : 'Signing in…'}
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  {mode === 'register' ? 'Create Agent Account' : 'Sign In'}
                  <ArrowRight className="w-4 h-4" />
                </span>
              )}
            </Button>
          </form>

          {/* Back to Careers */}
          <div className="mt-8 flex items-center justify-between text-sm text-muted-foreground">
            <Link
              to="/careers"
              className="inline-flex items-center gap-1.5 hover:text-primary transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Careers
            </Link>
            <span>
              {mode === 'register' ? 'Already have an account?' : "Don't have an account?"}{' '}
              <button
                type="button"
                onClick={() => setMode(mode === 'register' ? 'login' : 'register')}
                className="text-primary font-semibold hover:underline"
              >
                {mode === 'register' ? 'Sign In' : 'Sign Up'}
              </button>
            </span>
          </div>
        </motion.div>
      </div>

      {/* ─── Right — Decorative Panel ─── */}
      <div className="hidden lg:flex lg:w-[52%] xl:w-[55%] flex-col justify-between p-14 relative overflow-hidden bg-gradient-to-br from-[#0d9d7e] via-[#0c8870] to-[#065f4a] text-white">
        {/* Abstract blobs */}
        <div className="absolute top-0 right-0 w-80 h-80 rounded-full bg-white/5 -mr-32 -mt-32 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-64 rounded-full bg-white/5 -ml-24 -mb-24 pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-white/[0.03] pointer-events-none" />

        {/* Top content */}
        <div className="relative z-10">
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 text-white/90 text-sm font-medium mb-8">
            <Sparkles className="w-4 h-4" />
            Agent Partner Program
          </span>
          <h2 className="text-4xl xl:text-5xl font-bold leading-tight mb-6">
            Grow Your Income.<br />
            Change <span className="text-emerald-200">Lives.</span>
          </h2>
          <p className="text-white/70 text-lg leading-relaxed max-w-md">
            Be the bridge between your community and quality healthcare. Earn commissions on every successful referral with zero startup costs.
          </p>
        </div>

        {/* Perks */}
        <div className="relative z-10 grid grid-cols-2 gap-4">
          {perks.map((perk, i) => (
            <motion.div
              key={perk.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.1 }}
              className="p-5 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/10 hover:bg-white/15 transition-colors"
            >
              <perk.icon className="w-6 h-6 mb-3 text-emerald-200" />
              <h3 className="font-semibold text-sm mb-1">{perk.title}</h3>
              <p className="text-xs text-white/60 leading-relaxed">{perk.description}</p>
            </motion.div>
          ))}
        </div>

        {/* Footer guarantee */}
        <div className="relative z-10 flex items-center gap-3 pt-4 border-t border-white/10 mt-6">
          <CheckCircle2 className="w-5 h-5 text-emerald-300 shrink-0" />
          <p className="text-sm text-white/70">
            Free to join · No hidden fees · Instant commission tracking
          </p>
        </div>
      </div>
    </div>
  );
}
