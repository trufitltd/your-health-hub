import { useCallback, useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface Window {
    __pwaDeferredPrompt?: BeforeInstallPromptEvent | null;
    __pwaInstalled?: boolean;
  }
}

const PWA_INSTALLED_STORAGE_KEY = "pwa-installed";

const getStoredInstalledFlag = () => {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(PWA_INSTALLED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
};

const setStoredInstalledFlag = (value: boolean) => {
  if (typeof window === "undefined") return;
  try {
    if (value) {
      window.localStorage.setItem(PWA_INSTALLED_STORAGE_KEY, "true");
    } else {
      window.localStorage.removeItem(PWA_INSTALLED_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
};

const detectInstalled = () => {
  if (typeof window === "undefined") return false;
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches;
  // @ts-expect-error iOS standalone mode.
  const iosStandalone = window.navigator.standalone === true;
  return isStandalone || iosStandalone || window.__pwaInstalled === true || getStoredInstalledFlag();
};

export function usePwaInstall() {
  const [isInstalled, setIsInstalled] = useState<boolean>(detectInstalled());
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(
    typeof window !== "undefined" ? window.__pwaDeferredPrompt ?? null : null
  );

  // Dynamic manifest swapping logic
  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateManifest = () => {
      const path = window.location.pathname;
      const manifestLink = document.querySelector('link[rel="manifest"]');
      if (manifestLink) {
        let newHref = '/manifest.webmanifest';
        if (path.startsWith('/admin')) {
          newHref = '/admin-manifest.json';
        } else if (path.startsWith('/coo')) {
          newHref = '/coo-manifest.json';
        }

        if (manifestLink.getAttribute('href') !== newHref) {
          manifestLink.setAttribute('href', newHref);
          // Force browser to re-read manifest if possible
          console.log(`[PWA] Manifest swapped to: ${newHref}`);
        }
      }
    };

    updateManifest();
    
    // We also listen for popstate (back/forward) as it might change the path
    window.addEventListener('popstate', updateManifest);
    return () => window.removeEventListener('popstate', updateManifest);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      const promptEvent = event as BeforeInstallPromptEvent;
      window.__pwaDeferredPrompt = promptEvent;
      setDeferredPrompt(promptEvent);
    };

    const onInstalled = () => {
      window.__pwaInstalled = true;
      setStoredInstalledFlag(true);
      window.__pwaDeferredPrompt = null;
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);

    setIsInstalled(detectInstalled());
    setDeferredPrompt(window.__pwaDeferredPrompt ?? null);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (detectInstalled()) return "already_installed" as const;

    let promptEvent = window.__pwaDeferredPrompt ?? deferredPrompt;
    // In some desktop dev sessions, the event arrives slightly later.
    // Wait briefly before concluding install prompt is unavailable.
    if (!promptEvent) {
      for (let attempt = 0; attempt < 6; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        promptEvent = window.__pwaDeferredPrompt ?? null;
        if (promptEvent) break;
      }
    }

    if (!promptEvent) return "unavailable" as const;

    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;

    window.__pwaDeferredPrompt = null;
    setDeferredPrompt(null);

    if (outcome === "accepted") {
      window.__pwaInstalled = true;
      setStoredInstalledFlag(true);
      setIsInstalled(true);
      return "accepted" as const;
    }

    return "dismissed" as const;
  }, [deferredPrompt]);

  return {
    isInstalled,
    canInstall: !isInstalled && !!deferredPrompt,
    promptInstall,
  };
}
