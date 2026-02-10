import { useEffect } from 'react';
import { trackDoctorPresence } from './useDoctorPresence';
import { RealtimeChannel } from '@supabase/supabase-js';

type PresenceStatus = 'online' | 'away' | 'offline';

export const useTrackPresence = (userId: string | undefined, userRole: string | undefined) => {
  useEffect(() => {
    if (!userId || userRole !== 'doctor') return;

    let channel: RealtimeChannel | null = null;
    let awayTimeout: NodeJS.Timeout;
    let status: PresenceStatus = 'online';

    const updatePresence = async (newStatus: PresenceStatus) => {
      status = newStatus;
      if (channel) {
        await channel.track({ user_id: userId, status, online_at: new Date().toISOString() });
      }
    };

    const handleActivity = () => {
      clearTimeout(awayTimeout);
      if (status !== 'online') updatePresence('online');
      awayTimeout = setTimeout(() => updatePresence('away'), 5 * 60 * 1000); // 5 min
    };

    const initPresence = async () => {
      channel = await trackDoctorPresence(userId, 'online');
      
      window.addEventListener('mousemove', handleActivity);
      window.addEventListener('keydown', handleActivity);
      window.addEventListener('click', handleActivity);
      
      handleActivity();
    };

    initPresence();

    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('click', handleActivity);
      clearTimeout(awayTimeout);
      if (channel) channel.unsubscribe();
    };
  }, [userId, userRole]);
};
