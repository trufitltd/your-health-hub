import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Check, Download, Globe, Laptop, Smartphone, Tablet } from "lucide-react";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import { useLanguage } from "@/contexts/LanguageContext";

export default function InstallPage() {
  const { isInstalled, canInstall, promptInstall } = usePwaInstall();
  const { t } = useLanguage();
  const [installFeedback, setInstallFeedback] = useState("");

  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);
  const isMobile = isIOS || isAndroid;
  const isDesktop = !isMobile;
  const isChromeLike = /Chrome|CriOS|Edg|OPR/i.test(ua);
  const isInAppBrowser = /(FBAN|FBAV|Instagram|Line|Twitter|wv)/i.test(ua);

  useEffect(() => {
    if (isInstalled) {
      setInstallFeedback(t("install.feedback.alreadyInstalled", "MyEdoctor is already installed on this device."));
    }
  }, [isInstalled, t]);

  const handleInstall = async () => {
    if (isIOS && !canInstall) {
      setInstallFeedback(
        t(
          "install.feedback.iosNoPrompt",
          "On iPhone/iPad, direct install popups are not supported by Apple. Use Safari Share -> Add to Home Screen."
        )
      );
      return;
    }

    if (isInAppBrowser) {
      setInstallFeedback(
        t(
          "install.feedback.inAppBrowser",
          "This in-app browser blocks app installation. Open this page in Safari or Chrome, then install."
        )
      );
      return;
    }

    const result = await promptInstall();
    if (result === "unavailable") {
      if (isAndroid) {
        setInstallFeedback(
          t(
            "install.feedback.androidUnavailable",
            "Direct install is not available in this browser session. Open browser menu -> Install app / Add to Home screen."
          )
        );
        return;
      }
      setInstallFeedback(
        t(
          "install.feedback.unavailable",
          "Install prompt is not available yet. Use your browser menu and choose Install App / Add to Home Screen."
        )
      );
      return;
    }
    if (result === "accepted") {
      setInstallFeedback(t("install.feedback.accepted", "Install accepted. MyEdoctor will appear on your home screen."));
      return;
    }
    if (result === "dismissed") {
      setInstallFeedback(t("install.feedback.dismissed", "Install was dismissed. You can install later from this page."));
      return;
    }
    setInstallFeedback(t("install.feedback.alreadyInstalled", "MyEdoctor is already installed on this device."));
  };

  const installHelpTitle = useMemo(() => {
    if (isIOS) return t("install.help.title.ios", "Install on iPhone or iPad");
    if (isAndroid) return t("install.help.title.android", "Install on Android");
    if (isDesktop) return t("install.help.title.desktop", "Install on Desktop");
    return t("install.help.title.generic", "Install Instructions");
  }, [isAndroid, isDesktop, isIOS, t]);

  const installSteps = useMemo(() => {
    if (isIOS) {
      return [
        t("install.help.ios.step1", "Open this page in Safari."),
        t("install.help.ios.step2", "Tap the Share icon."),
        t("install.help.ios.step3", "Select Add to Home Screen, then tap Add."),
      ];
    }

    if (isAndroid) {
      if (canInstall) {
        return [
          t("install.help.androidPrompt.step1", "Tap Install App Now below."),
          t("install.help.androidPrompt.step2", "Accept the browser prompt."),
          t("install.help.androidPrompt.step3", "Open MyEdoctor from your home screen."),
        ];
      }

      return [
        t("install.help.androidManual.step1", "Open browser menu (three dots)."),
        t("install.help.androidManual.step2", "Tap Install app or Add to Home screen."),
        t("install.help.androidManual.step3", "Confirm install and open from your home screen."),
      ];
    }

    return [
      t("install.help.desktop.step1", "Use Chrome or Edge for best PWA support."),
      t("install.help.desktop.step2", "Click the install icon in the address bar or browser menu."),
      t("install.help.desktop.step3", "Launch MyEdoctor as a desktop app from your apps list."),
    ];
  }, [canInstall, isAndroid, isIOS, t]);

  const features = [
    t("install.features.items.1", "Instant access from your home screen"),
    t("install.features.items.2", "Works offline with cached data"),
    t("install.features.items.3", "Push notifications for appointments"),
    t("install.features.items.4", "Faster loading times"),
    t("install.features.items.5", "Native app-like experience"),
    t("install.features.items.6", "No app store download required"),
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
            <h1 className="text-3xl md:text-4xl font-bold mb-4">{t("install.title", "Install MyEdoctor")}</h1>
            <p className="text-muted-foreground">
              {t("install.subtitle", "Download our mobile app experience by installing this PWA. No app store required.")}
            </p>
          </motion.div>

          {isInstalled ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
            className="bg-success-light rounded-2xl p-8 text-center mb-8"
          >
            <Check className="w-16 h-16 text-success mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-success mb-2">{t("install.status.installedTitle", "Already Installed!")}</h2>
            <p className="text-muted-foreground">
              {t("install.status.installedBody", "MyEdoctor is installed on your device. You can access it from your home screen.")}
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
                  {isIOS && !canInstall
                    ? t("install.cta.showIosSteps", "Show iPhone Install Steps")
                    : t("install.cta.installNow", "Install App Now")}
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
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>

                {!canInstall && isChromeLike && !isIOS && (
                  <p className="text-xs text-muted-foreground">
                    {t(
                      "install.help.chromeHint",
                      "If install is not shown, refresh once and keep browsing this site for a few seconds."
                    )}
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
              {t("install.platform.mobile", "Mobile install ready")}
            </div>
            <div className="border border-border rounded-xl p-4 bg-card flex items-center gap-3 text-sm">
              <Tablet className="w-5 h-5 text-primary" />
              {t("install.platform.tablet", "Tablet optimized")}
            </div>
            <div className="border border-border rounded-xl p-4 bg-card flex items-center gap-3 text-sm">
              <Laptop className="w-5 h-5 text-primary" />
              {t("install.platform.desktop", "Desktop app mode")}
            </div>
          </motion.div>

          {/* Features */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-card rounded-2xl border border-border p-8"
          >
            <h3 className="font-semibold mb-6">{t("install.features.title", "Why Install the App?")}</h3>
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
              {t("install.appUrlLabel", "App URL:")} {window.location.origin}/install
            </div>
          </motion.div>
        </div>
      </section>
    </Layout>
  );
}
