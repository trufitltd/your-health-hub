import { ReactNode } from 'react';
import { Header } from './Header';
import { Footer } from './Footer';
import { useAuth } from '@/hooks/useAuth';
import { useTrackUserPresence } from '@/hooks/useTrackUserPresence';

interface LayoutProps {
  children: ReactNode;
  hideFooter?: boolean;
}

export function Layout({ children, hideFooter = false }: LayoutProps) {
  const { user, role } = useAuth();
  
  // Track presence for all authenticated users
  useTrackUserPresence(user?.id, role as 'doctor' | 'patient');
  
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        {children}
      </main>
      {!hideFooter && <Footer />}
    </div>
  );
}
