import { createContext } from 'react';
import type { User } from '@supabase/supabase-js';

export type AppRole = 'patient' | 'doctor' | 'admin' | 'coo' | 'healthlink' | 'platform_superadmin' | 'organisation_admin';

export interface AuthContextType {
  user: User | null;
  role: AppRole | null;
  effectivePermissions: Set<AppRole>;
  isLoading: boolean;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
