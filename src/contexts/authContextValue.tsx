import { createContext } from 'react';
import type { User } from '@supabase/supabase-js';

export interface AuthContextType {
  user: User | null;
  role: 'patient' | 'doctor' | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
