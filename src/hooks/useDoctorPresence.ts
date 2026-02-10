import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';

type PresenceStatus = 'online' | 'away' | 'offline';

export const useDoctorPresence = () => {
  const [presenceMap, setPresenceMap] = useState<Record<string, PresenceStatus>>({});
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);

  useEffect(() => {
    const presenceChannel = supabase.channel('doctors-presence');

    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState();
        const newMap: Record<string, PresenceStatus> = {};
        
        Object.values(state).forEach((presences: any[]) => {
          presences.forEach((presence) => {
            if (presence.user_id) {
              newMap[presence.user_id] = presence.status || 'online';
            }
          });
        });
        
        console.log('[Doctor Presence] Updated presence map:', newMap);
        setPresenceMap(newMap);
      })
      .subscribe();

    setChannel(presenceChannel);

    return () => {
      presenceChannel.unsubscribe();
    };
  }, []);

  return { presenceMap, channel };
};

export const trackDoctorPresence = async (userId: string, status: PresenceStatus = 'online') => {
  const channel = supabase.channel('doctors-presence');
  
  await channel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await channel.track({ user_id: userId, status, online_at: new Date().toISOString() });
    }
  });

  return channel;
};
