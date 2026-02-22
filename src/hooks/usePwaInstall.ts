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

const detectInstalled = () => {
  if (typeof window === "undefined") return false;
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches;
  // @ts-expect-error iOS standalone mode.
  const iosStandalone = window.navigator.standalone === true;
  return isStandalone || iosStandalone || window.__pwaInstalled === true;
};

export function usePwaInstall() {
  const [isInstalled, setIsInstalled] = useState<boolean>(detectInstalled());
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(
    typeof window !== "undefined" ? window.__pwaDeferredPrompt ?? null : null
  );

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
