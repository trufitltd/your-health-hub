import React, { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { AuthContext } from './authContextValue';
import type { AuthContextType } from './authContextValue';
import type { AppRole } from './authContextValue';

const parseAppRole = (rawRole: unknown): AppRole => {
  const normalized = String(rawRole || '').trim().toLowerCase();
  if (normalized === 'doctor' || normalized === 'patient' || normalized === 'admin' || normalized === 'coo') {
    return normalized;
  }
  return 'patient';
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
          const userRole = parseAppRole(currentUser.user_metadata?.role);
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
          const userRole = parseAppRole(currentUser.user_metadata?.role);
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
 
