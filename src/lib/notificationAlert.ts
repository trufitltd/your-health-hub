import { playNotificationBeep, playNotificationRing } from '@/lib/notificationSound';

type NotificationAlertInput = {
  title: string;
  body?: string;
  tag?: string;
  urgent?: boolean;
};

const lastAlertAtByTag = new Map<string, number>();

export const triggerNotificationAlert = async ({
  title,
  body,
  tag,
  urgent = true,
}: NotificationAlertInput) => {
  const now = Date.now();
  const dedupeTag = tag || `${title}:${body || ''}`;
  const lastAt = lastAlertAtByTag.get(dedupeTag) || 0;
  if (now - lastAt < 4000) return;
  lastAlertAtByTag.set(dedupeTag, now);

  if (urgent) {
    await playNotificationRing(3);
  } else {
    await playNotificationBeep();
  }

  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(urgent ? [240, 140, 260, 140, 320] : [180, 90, 180]);
  }

  if (typeof window !== 'undefined' && 'Notification' in window) {
    try {
      if (Notification.permission === 'granted') {
        new Notification(title, {
          body,
          tag: dedupeTag,
          renotify: true,
        });
      }
    } catch {
      // Ignore browser notification failures.
    }
  }
};

