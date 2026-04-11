import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function usePushSubscription(userId?: string) {
  useEffect(() => {
    if (!VAPID_PUBLIC_KEY) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (Notification.permission !== 'granted') return;

    const subscribe = async () => {
      try {
        const registration = await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();

        // Already subscribed — just make sure it's saved
        const sub = existing ?? await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });

        const json = sub.toJSON();
        const endpoint = json.endpoint!;
        const p256dh = json.keys?.p256dh ?? '';
        const auth_key = json.keys?.auth ?? '';
        if (!endpoint || !p256dh || !auth_key) return;

        await supabase.from('push_subscriptions').upsert(
          {
            user_id: userId ?? null,
            endpoint,
            p256dh,
            auth_key,
            user_agent: navigator.userAgent.slice(0, 200),
          },
          { onConflict: 'endpoint' }
        );
      } catch (err) {
        console.warn('[usePushSubscription] Failed to subscribe:', err);
      }
    };

    subscribe();
  }, [userId]);
}
