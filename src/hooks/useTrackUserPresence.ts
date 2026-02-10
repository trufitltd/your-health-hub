import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';

type PresenceStatus = 'online' | 'away' | 'offline';

export const useTrackUserPresence = (
  userId: string | undefined,
  userRole: 'doctor' | 'patient' | undefined
) => {
  useEffect(() => {
    if (!userId || !userRole) return;

    const channelName = userRole === 'doctor' ? 'doctors-presence' : 'patients-presence';
    let channel: RealtimeChannel | null = null;
    let awayTimeout: NodeJS.Timeout;
    let status: PresenceStatus = 'online';

    const updatePresence = async (newStatus: PresenceStatus) => {
      status = newStatus;
      if (channel) {
        await channel.track({ 
          user_id: userId, 
          status, 
          online_at: new Date().toISOString() 
        });
      }
    };

    const handleActivity = () => {
      clearTimeout(awayTimeout);
      if (status !== 'online') updatePresence('online');
      awayTimeout = setTimeout(() => updatePresence('away'), 5 * 60 * 1000); // 5 min
    };

    const initPresence = async () => {
      channel = supabase.channel(channelName);
      
      await channel.subscribe(async (subscribeStatus) => {
        if (subscribeStatus === 'SUBSCRIBED') {
          console.log(`[Presence] ${userRole} tracking started for user:`, userId);
          await channel!.track({ 
            user_id: userId, 
            status: 'online', 
            online_at: new Date().toISOString() 
          });
        }
      });
      
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
