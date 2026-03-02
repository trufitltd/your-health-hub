import { useToast } from "@/hooks/use-toast";
import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from "@/components/ui/toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { translateToastText } from "@/lib/toastI18n";
import type { ReactNode } from "react";
import type { AppLanguage } from "@/contexts/LanguageContext";

export function Toaster() {
  const { toasts } = useToast();
  let language: AppLanguage = "en";
  try {
    language = useLanguage().language;
  } catch {
    // Toaster may render outside LanguageProvider in some app trees/hot-reload paths.
    // Fall back to English instead of crashing the whole app.
    language = "en";
  }

  const localizeToastNode = (node: ReactNode) => {
    if (typeof node !== "string") return node;
    return translateToastText(node, language);
  };

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{localizeToastNode(title)}</ToastTitle>}
              {description && <ToastDescription>{localizeToastNode(description)}</ToastDescription>}
            </div>
            {action}
            <ToastClose />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
