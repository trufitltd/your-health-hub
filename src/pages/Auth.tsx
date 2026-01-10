import { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Stethoscope, Mail, Lock, User, Eye, EyeOff, ArrowRight, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/use-toast';

type AuthMode = 'login' | 'register';
type UserRole = 'patient' | 'doctor';

const benefits = [
  'Access to 50+ certified specialists',
  'Secure video & audio consultations',
  'Easy appointment booking',
  'Digital prescriptions & records',
];

export default function AuthPage() {
  const [searchParams] = useSearchParams();
  const initialMode = searchParams.get('mode') === 'register' ? 'register' : 'login';

  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [role, setRole] = useState<UserRole>('patient');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (mode === 'register') {
        // Sign up with Supabase
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: name,
              role,
            },
          },
        });

        if (error) {
          toast({ title: 'Registration failed', description: error.message });
          setIsLoading(false);
          return;
        }

        toast({
          title: 'Account created',
          description: 'Please check your email to confirm your account.',
        });

        setIsLoading(false);
        setMode('login');
      } else {
        // Sign in with Supabase
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          toast({ title: 'Sign in failed', description: error.message });
          setIsLoading(false);
          return;
        }

        // Get user role from metadata
        const userRole = data?.user?.user_metadata?.role || 'patient';
        localStorage.setItem('userRole', userRole);

        toast({ title: 'Signed in', description: 'Welcome back!' });
        setIsLoading(false);

        // Redirect based on role
        navigate(userRole === 'doctor' ? '/doctor-portal' : '/patient-portal');
      }
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'message' in err ? (err as { message?: string }).message : String(err);
      toast({ title: 'Error', description: message });
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 mb-8">
            <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center">
              <Stethoscope className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold">
              MyE<span className="text-primary">Doctor</span>
            </span>
          </Link>

          {/* Title */}
          <h1 className="text-2xl md:text-3xl font-bold mb-2">
            {mode === 'login' ? 'Welcome back' : 'Create your account'}
          </h1>
          <p className="text-muted-foreground mb-8">
            {mode === 'login'
              ? 'Sign in to access your health dashboard'
              : 'Join thousands of patients getting quality healthcare'}
          </p>

          {/* Role Selection (Register only) */}
          {mode === 'register' && (
            <div className="mb-6">
              <Label className="text-sm font-medium mb-3 block">I am a:</Label>
              <div className="flex gap-3">
                {(['patient', 'doctor'] as UserRole[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    className={cn(
                      'flex-1 p-4 rounded-xl border-2 transition-all duration-200',
                      role === r
                        ? 'border-primary bg-primary-light'
                        : 'border-border hover:border-primary/50'
                    )}
                  >
                    <p className="font-semibold capitalize">{r}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {r === 'patient' ? 'Book consultations' : 'Provide consultations'}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <Label htmlFor="name">Full Name</Label>
                <div className="relative mt-1.5">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    id="name"
                    type="text"
                    placeholder="Enter your full name"
                    className="pl-10 h-12"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div>
              <Label htmlFor="email">Email Address</Label>
              <div className="relative mt-1.5">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter your email"
                  className="pl-10 h-12"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="password">Password</Label>
              <div className="relative mt-1.5">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder={mode === 'register' ? 'Create a password' : 'Enter your password'}
                  className="pl-10 pr-10 h-12"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {mode === 'login' && (
              <div className="flex items-center justify-between text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="rounded border-border" />
                  <span className="text-muted-foreground">Remember me</span>
                </label>
                <Link to="/forgot-password" className="text-primary hover:underline">
                  Forgot password?
                </Link>
              </div>
            )}

            <Button
              type="submit"
              variant="gradient"
              size="lg"
              className="w-full mt-6"
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  {mode === 'login' ? 'Signing in...' : 'Creating account...'}
                </span>
              ) : (
                <>
                  {mode === 'login' ? 'Sign In' : 'Create Account'}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </form>

          {/* Toggle Mode */}
          <p className="text-center text-sm text-muted-foreground mt-6">
            {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <button
              type="button"
              onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
              className="text-primary font-medium hover:underline"
            >
              {mode === 'login' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </motion.div>
      </div>

      {/* Right Panel - Benefits */}
      <div className="hidden lg:flex flex-1 gradient-hero items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 right-20 w-64 h-64 bg-primary-foreground rounded-full blur-3xl" />
          <div className="absolute bottom-20 left-20 w-96 h-96 bg-primary-foreground rounded-full blur-3xl" />
        </div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="relative z-10 max-w-md"
        >
          <h2 className="text-3xl font-bold text-primary-foreground mb-6">
            Your Health, Our Priority
          </h2>
          <p className="text-primary-foreground/80 mb-8">
            Join MyEdoctor and experience healthcare reimagined. Connect with top specialists, manage appointments, and access your health records — all in one place.
          </p>

          <ul className="space-y-4">
            {benefits.map((benefit, index) => (
              <motion.li
                key={benefit}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: 0.4 + index * 0.1 }}
                className="flex items-center gap-3"
              >
                <div className="w-6 h-6 rounded-full bg-primary-foreground/20 flex items-center justify-center">
                  <Check className="w-4 h-4 text-primary-foreground" />
                </div>
                <span className="text-primary-foreground">{benefit}</span>
              </motion.li>
            ))}
          </ul>
        </motion.div>
      </div>
    </div>
  );
}
