import { playNotificationBeep, playNotificationRing, resumeNotificationAudio } from '@/lib/notificationSound';

export type NotificationAlertIntensity = 'low' | 'medium' | 'high';

type NotificationAlertInput = {
  title: string;
  body?: string;
  tag?: string;
  urgent?: boolean;
  intensity?: NotificationAlertIntensity;
};

const lastAlertAtByTag = new Map<string, number>();
let alertRuntimeInitialized = false;
const NOTIFICATION_ALERT_INTENSITY_KEY = 'myedoctor.notification.alertIntensity';

const normalizeNotificationAlertIntensity = (value: string | null | undefined): NotificationAlertIntensity => {
  if (value === 'low' || value === 'medium' || value === 'high') return value;
  return 'high';
};

export const getNotificationAlertIntensity = (): NotificationAlertIntensity => {
  if (typeof window === 'undefined') return 'high';
  return normalizeNotificationAlertIntensity(window.localStorage.getItem(NOTIFICATION_ALERT_INTENSITY_KEY));
};

export const setNotificationAlertIntensity = (value: NotificationAlertIntensity) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(NOTIFICATION_ALERT_INTENSITY_KEY, value);
};

const initializeAlertRuntime = () => {
  if (alertRuntimeInitialized || typeof window === 'undefined') return;
  alertRuntimeInitialized = true;

  const unlockAudio = () => {
    void resumeNotificationAudio();
  };

  // Ensure audio can play in all portals, not only places using useNotificationSound hook.
  window.addEventListener('pointerdown', unlockAudio, { passive: true });
  window.addEventListener('touchstart', unlockAudio, { passive: true });
  window.addEventListener('keydown', unlockAudio, { passive: true });
};

const getVibrationPattern = (urgent: boolean, intensity: NotificationAlertIntensity) => {
  if (!urgent) return [220, 100, 260];

  if (intensity === 'low') return [220, 120, 280];
  if (intensity === 'medium') return [300, 120, 420, 120, 520];
  return [400, 120, 500, 120, 700, 180, 700];
};

const getUrgentRingRepeat = (intensity: NotificationAlertIntensity) => {
  if (intensity === 'low') return 4;
  if (intensity === 'medium') return 6;
  return 8;
};

const triggerVibration = (urgent: boolean, intensity: NotificationAlertIntensity) => {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;

  const pattern = getVibrationPattern(urgent, intensity);

  const didVibrate = navigator.vibrate(pattern);
  if (didVibrate) return;

  // Some mobile browsers ignore the first call when app just became active.
  const retries = urgent ? 3 : 1;
  for (let i = 1; i <= retries; i += 1) {
    window.setTimeout(() => {
      navigator.vibrate(pattern);
    }, 250 * i);
  }
};

export const triggerNotificationAlert = async ({
  title,
  body,
  tag,
  urgent = true,
  intensity,
}: NotificationAlertInput) => {
  initializeAlertRuntime();
  await resumeNotificationAudio();
  const effectiveIntensity = intensity || getNotificationAlertIntensity();

  const now = Date.now();
  const dedupeTag = tag || `${title}:${body || ''}`;
  const lastAt = lastAlertAtByTag.get(dedupeTag) || 0;
  if (now - lastAt < 4000) return;
  lastAlertAtByTag.set(dedupeTag, now);

  if (urgent) {
    await playNotificationRing(getUrgentRingRepeat(effectiveIntensity));
  } else {
    await playNotificationBeep();
  }

  triggerVibration(urgent, effectiveIntensity);

  if (typeof window !== 'undefined' && 'Notification' in window) {
    try {
      if (Notification.permission === 'granted') {
        new Notification(title, {
          body,
          tag: dedupeTag,
          renotify: true,
          vibrate: getVibrationPattern(urgent, effectiveIntensity),
        });
      }
    } catch {
      // Ignore browser notification failures.
    }
  }
};
