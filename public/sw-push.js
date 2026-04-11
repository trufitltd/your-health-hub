// MyEdoctor custom service worker
// Handles: push notifications, notificationclick (open PWA + dismiss)

self.addEventListener('push', (event) => {
  let data = { title: 'MyEdoctor', body: 'You have a new notification.', url: '/' };

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch {
      data.body = event.data.text() || data.body;
    }
  }

  // Vibration pattern: [vibrate, pause, vibrate, pause, vibrate]
  // Times are in milliseconds: 200ms vibrate, 100ms pause, 200ms vibrate, 100ms pause, 200ms vibrate
  const vibrationPattern = [200, 100, 200, 100, 200];

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag || 'myedoctor-push',
      renotify: true,
      // Vibration is included in notification options for devices that support it
      vibrate: vibrationPattern,
      data: { url: data.url || '/', vibration: vibrationPattern },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = (event.notification.data && event.notification.data.url)
    ? event.notification.data.url
    : '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Focus an existing window/tab if one is already open
        for (const client of clientList) {
          const clientUrl = new URL(client.url);
          const target = new URL(targetUrl, self.location.origin);
          if (clientUrl.pathname.startsWith(target.pathname) && 'focus' in client) {
            return client.focus();
          }
        }
        // Otherwise open a new window (opens the PWA if installed)
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});
