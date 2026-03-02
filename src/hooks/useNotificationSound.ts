import { useCallback, useEffect, useRef } from 'react';
import { playNotificationBeep, resumeNotificationAudio } from '@/lib/notificationSound';

export const useNotificationSound = () => {
  const lastPlayedAtRef = useRef(0);

  useEffect(() => {
    const unlock = async () => {
      await resumeNotificationAudio();
    };

    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  const playNotificationSound = useCallback(async () => {
    const now = Date.now();
    if (now - lastPlayedAtRef.current < 350) return;
    lastPlayedAtRef.current = now;
    await playNotificationBeep();
  }, []);

  return { playNotificationSound };
};
