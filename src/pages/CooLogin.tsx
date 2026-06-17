import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BriefcaseBusiness, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/use-toast';
import logoImage from '@/assets/MyE-DoctorLogo.png';

export default function CooLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const allowedEmails = useMemo(() => {
    const cooRaw = (import.meta.env.VITE_COO_EMAILS as string | undefined) || '';
    const adminRaw = (import.meta.env.VITE_ADMIN_EMAILS as string | undefined) || '';
    const source = cooRaw.trim().length > 0 ? cooRaw : adminRaw;
    return source
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      const userEmail = (data.user?.email || '').toLowerCase();
      if (!allowedEmails.includes(userEmail)) {
        await supabase.auth.signOut();
        toast({
          title: 'Access denied',
          description: 'You do not have COO portal privileges.',
          variant: 'destructive',
        });
        setIsLoading(false);
        return;
      }

      toast({ title: 'Success', description: 'Welcome to COO Portal.' });
      navigate('/coo');
    } catch (err: any) {
      toast({
        title: 'Login failed',
        description: err?.message || 'Invalid credentials',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="bg-card rounded-2xl shadow-lg p-8 border border-border">
          <div className="flex flex-col items-center mb-8">
            <img src={logoImage} alt="MyE-Doctor Logo" className="h-16 w-auto mb-4 shrink-0 object-contain" />
            <div className="flex flex-col items-center gap-1 mb-2">
              <div className="flex items-center gap-2">
                <BriefcaseBusiness className="w-6 h-6 text-primary" />
                <h1 className="text-2xl font-bold">COO Portal</h1>
              </div>
              <p className="text-[10px] text-muted-foreground">Powered by HealthLink</p>
            </div>
            <p className="text-sm text-muted-foreground text-center">
              Executive Monitoring Access
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email">COO Email</Label>
              <div className="relative mt-1.5">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="coo@myedoctor.com"
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
                  placeholder="Enter your password"
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

            <Button type="submit" variant="gradient" size="lg" className="w-full mt-6" disabled={isLoading}>
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  Signing in...
                </span>
              ) : (
                <>
                  <BriefcaseBusiness className="w-4 h-4 mr-2" />
                  Sign In as COO
                </>
              )}
            </Button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
