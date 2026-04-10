import { useEffect } from 'react';

export function useRequestNotificationPermission() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'default') return;

    const request = () => {
      Notification.requestPermission().catch(() => {});
    };

    window.addEventListener('pointerdown', request, { once: true, passive: true });
    return () => window.removeEventListener('pointerdown', request);
  }, []);
}
