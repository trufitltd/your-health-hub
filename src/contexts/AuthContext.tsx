import React, { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { AuthContext } from './authContextValue';
import type { AuthContextType } from './authContextValue';
import type { AppRole } from './authContextValue';

const parseAppRole = (rawRole: unknown): AppRole => {
  const normalized = String(rawRole || '').trim().toLowerCase();
  if (normalized === 'doctor' || normalized === 'patient' || normalized === 'admin' || normalized === 'coo' || normalized === 'healthlink' || normalized === 'platform_superadmin' || normalized === 'organisation_admin') {
    return normalized;
  }
  return 'patient';
};

const getSuperAdminEmails = (): Set<string> => {
  const raw = import.meta.env.VITE_SUPER_ADMIN_EMAILS || '';
  return new Set(
    raw.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
  );
};

const resolveRole = (user: User): AppRole => {
  const emailRole = parseAppRole(user.user_metadata?.role);
  const superAdminEmails = getSuperAdminEmails();
  if (superAdminEmails.has((user.email || '').toLowerCase())) {
    return 'platform_superadmin';
  }
  return emailRole;
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check for active session on mount
    const getSession = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const currentUser = data?.session?.user;

        if (currentUser) {
          setUser(currentUser);
          const userRole = resolveRole(currentUser);
          setRole(userRole);
          localStorage.setItem('userRole', userRole);
        }
      } catch (error) {
        console.error('Error fetching session:', error);
      } finally {
        setIsLoading(false);
      }
    };

    getSession();

    // Subscribe to auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        const currentUser = session?.user;

        if (currentUser) {
          setUser(currentUser);
          const userRole = resolveRole(currentUser);
          setRole(userRole);
          localStorage.setItem('userRole', userRole);
        } else {
          setUser(null);
          setRole(null);
          localStorage.removeItem('userRole');
        }
      }
    );

    return () => subscription?.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setRole(null);
    localStorage.removeItem('userRole');
  };

  return (
    <AuthContext.Provider value={{ user, role, isLoading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
 
