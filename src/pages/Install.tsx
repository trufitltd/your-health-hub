import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Check, Download, Globe, Laptop, Share2, Smartphone, Tablet } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function InstallPage() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [installFeedback, setInstallFeedback] = useState("");

  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);
  const isMobile = isIOS || isAndroid;
  const isDesktop = !isMobile;
  const isChromeLike = /Chrome|CriOS|Edg|OPR/i.test(ua);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const onInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      setInstallFeedback("MyEdoctor is installed successfully.");
    };

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", onInstalled);

    if (
      window.matchMedia("(display-mode: standalone)").matches ||
      // @ts-expect-error iOS standalone mode.
      window.navigator.standalone === true
    ) {
      setIsInstalled(true);
      setInstallFeedback("MyEdoctor is already installed on this device.");
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) {
      setInstallFeedback(
        "Install prompt is not available yet. Use your browser menu and choose Install App / Add to Home Screen."
      );
      return;
    }

    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === "accepted") {
      setIsInstalled(true);
      setInstallFeedback("Install accepted. MyEdoctor will appear on your home screen.");
    } else {
      setInstallFeedback("Install was dismissed. You can install later from this page.");
    }

    setDeferredPrompt(null);
  };

  const installHelpTitle = useMemo(() => {
    if (isIOS) return "Install on iPhone or iPad";
    if (isAndroid) return "Install on Android";
    if (isDesktop) return "Install on Desktop";
    return "Install Instructions";
  }, [isAndroid, isDesktop, isIOS]);

  const installSteps = useMemo(() => {
    if (isIOS) {
      return [
        "Open this page in Safari.",
        "Tap the Share icon.",
        "Select Add to Home Screen, then tap Add.",
      ];
    }

    if (isAndroid) {
      if (deferredPrompt) {
        return [
          "Tap Install App Now below.",
          "Accept the browser prompt.",
          "Open MyEdoctor from your home screen.",
        ];
      }

      return [
        "Open browser menu (three dots).",
        "Tap Install app or Add to Home screen.",
        "Confirm install and open from your home screen.",
      ];
    }

    return [
      "Use Chrome or Edge for best PWA support.",
      "Click the install icon in the address bar or browser menu.",
      "Launch MyEdoctor as a desktop app from your apps list.",
    ];
  }, [deferredPrompt, isAndroid, isIOS]);

  const features = [
    "Instant access from your home screen",
    "Works offline with cached data",
    "Push notifications for appointments",
    "Faster loading times",
    "Native app-like experience",
    "No app store download required",
  ];

  return (
    <Layout>
      <section className="pt-32 pb-20">
        <div className="container mx-auto px-4 max-w-2xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-12"
          >
            <div className="w-20 h-20 rounded-3xl gradient-primary flex items-center justify-center mx-auto mb-6 shadow-glow">
              <Smartphone className="w-10 h-10 text-primary-foreground" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold mb-4">Install MyEdoctor</h1>
            <p className="text-muted-foreground">
              Download our mobile app experience by installing this PWA. No app store required.
            </p>
          </motion.div>

          {isInstalled ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-success-light rounded-2xl p-8 text-center mb-8"
            >
              <Check className="w-16 h-16 text-success mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-success mb-2">Already Installed!</h2>
              <p className="text-muted-foreground">
                MyEdoctor is installed on your device. You can access it from your home screen.
              </p>
            </motion.div>
          ) : (
            <>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center mb-8"
              >
                <Button
                  variant="gradient"
                  size="xl"
                  onClick={handleInstall}
                  className="w-full sm:w-auto"
                >
                  <Download className="w-5 h-5" />
                  Install App Now
                </Button>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-card rounded-2xl border border-border p-6 mb-8"
              >
                <h3 className="font-semibold mb-4">{installHelpTitle}</h3>
                <ol className="space-y-3 text-sm mb-4">
                  {installSteps.map((step, index) => (
                    <li key={step} className="flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0">
                        {index + 1}
                      </span>
                      <span>
                        {index === 1 && isIOS ? (
                          <>
                            Tap the <Share2 className="w-4 h-4 inline mx-1" /> Share icon.
                          </>
                        ) : (
                          step
                        )}
                      </span>
                    </li>
                  ))}
                </ol>

                {!deferredPrompt && isChromeLike && !isIOS && (
                  <p className="text-xs text-muted-foreground">
                    If install is not shown, refresh once and keep browsing this site for a few seconds.
                  </p>
                )}
              </motion.div>
            </>
          )}

          {installFeedback && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-primary/5 border border-primary/20 rounded-xl p-4 mb-8 text-sm text-primary"
            >
              {installFeedback}
            </motion.div>
          )}

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8"
          >
            <div className="border border-border rounded-xl p-4 bg-card flex items-center gap-3 text-sm">
              <Smartphone className="w-5 h-5 text-primary" />
              Mobile install ready
            </div>
            <div className="border border-border rounded-xl p-4 bg-card flex items-center gap-3 text-sm">
              <Tablet className="w-5 h-5 text-primary" />
              Tablet optimized
            </div>
            <div className="border border-border rounded-xl p-4 bg-card flex items-center gap-3 text-sm">
              <Laptop className="w-5 h-5 text-primary" />
              Desktop app mode
            </div>
          </motion.div>

          {/* Features */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-card rounded-2xl border border-border p-8"
          >
            <h3 className="font-semibold mb-6">Why Install the App?</h3>
            <ul className="grid sm:grid-cols-2 gap-4">
              {features.map((feature) => (
                <li key={feature} className="flex items-center gap-3 text-sm">
                  <Check className="w-5 h-5 text-success shrink-0" />
                  {feature}
                </li>
              ))}
            </ul>
            <div className="mt-6 text-xs text-muted-foreground flex items-center gap-2">
              <Globe className="w-4 h-4" />
              App URL: {window.location.origin}/install
            </div>
          </motion.div>
        </div>
      </section>
    </Layout>
  );
}
