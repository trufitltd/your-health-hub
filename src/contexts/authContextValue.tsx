import { createContext } from 'react';
import type { User } from '@supabase/supabase-js';

export type AppRole = 'patient' | 'doctor' | 'admin' | 'coo' | 'healthlink';

export interface AuthContextType {
  user: User | null;
  role: AppRole | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
