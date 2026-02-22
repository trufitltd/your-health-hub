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

registerSW({ immediate: true });

createRoot(document.getElementById("root")!).render(<App />);
