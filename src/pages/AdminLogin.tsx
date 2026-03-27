import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Shield, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/use-toast';
import logoImage from '@/assets/MyE-DoctorLogo.png';

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      // Verify admin access
      const adminEmails = (import.meta.env.VITE_ADMIN_EMAILS as string || '')
        .split(',')
        .map(e => e.trim().toLowerCase());
      
      const userEmail = (data.user?.email || '').toLowerCase();
      
      if (!adminEmails.includes(userEmail)) {
        await supabase.auth.signOut();
        toast({ 
          title: 'Access Denied', 
          description: 'You do not have admin privileges.',
          variant: 'destructive'
        });
        setIsLoading(false);
        return;
      }

      toast({ title: 'Success', description: 'Welcome, Admin!' });
      navigate('/admin');
    } catch (err: any) {
      toast({ 
        title: 'Login Failed', 
        description: err.message || 'Invalid credentials',
        variant: 'destructive'
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
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <img src={logoImage} alt="MyE-Doctor Logo" className="h-16 w-auto mb-4" />
            <div className="flex flex-col items-center gap-1 mb-2">
              <div className="flex items-center gap-2">
                <Shield className="w-6 h-6 text-primary" />
                <h1 className="text-2xl font-bold">Admin Portal</h1>
              </div>
              <p className="text-[10px] text-muted-foreground">Powered by HealthLink</p>
            </div>
            <p className="text-sm text-muted-foreground text-center">
              Central Administration Access
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email">Admin Email</Label>
              <div className="relative mt-1.5">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@myedoctor.com"
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
                  Signing in...
                </span>
              ) : (
                <>
                  <Shield className="w-4 h-4 mr-2" />
                  Sign In as Admin
                </>
              )}
            </Button>
          </form>

          {/* Footer */}
          <div className="mt-6 pt-6 border-t border-border text-center">
            <p className="text-xs text-muted-foreground">
              Restricted access for authorized administrators only
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
