import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { registerSW } from "virtual:pwa-register";

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

createRoot(document.getElementById("root")!).render(<App />);
