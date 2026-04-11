import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { registerSW } from "virtual:pwa-register";
import { triggerVibration, getNotificationAlertIntensity } from "./lib/notificationAlert";

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    (window as Window & { __pwaDeferredPrompt?: Event | null }).__pwaDeferredPrompt = event;
  });
}

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    // Apply updated service worker immediately so users don't stay on stale auth logic.
    updateSW(true);
  },
});

// Listen for messages from service worker to trigger vibration
if (typeof navigator !== "undefined" && 'serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'notification-vibration') {
      // Trigger vibration for push notification clicks
      // Assume urgent since it's a push notification
      const intensity = getNotificationAlertIntensity();
      triggerVibration(true, intensity);
    }
  });
}

createRoot(document.getElementById("root")!).render(<App />);
