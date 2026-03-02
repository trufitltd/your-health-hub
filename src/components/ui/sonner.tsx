import { useTheme } from "next-themes";
import { Toaster as Sonner, toast as sonnerToast } from "sonner";
import { playNotificationBeep } from "@/lib/notificationSound";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      closeButton
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          closeButton:
            "opacity-100 text-foreground/70 hover:text-foreground border-border/50 hover:border-border",
        },
      }}
      {...props}
    />
  );
};

const toast = Object.assign(
  (...args: Parameters<typeof sonnerToast>) => {
    playNotificationBeep();
    return sonnerToast(...args);
  },
  {
    success: (...args: Parameters<typeof sonnerToast.success>) => {
      playNotificationBeep();
      return sonnerToast.success(...args);
    },
    error: (...args: Parameters<typeof sonnerToast.error>) => {
      playNotificationBeep();
      return sonnerToast.error(...args);
    },
    warning: (...args: Parameters<typeof sonnerToast.warning>) => {
      playNotificationBeep();
      return sonnerToast.warning(...args);
    },
    info: (...args: Parameters<typeof sonnerToast.info>) => {
      playNotificationBeep();
      return sonnerToast.info(...args);
    },
    loading: (...args: Parameters<typeof sonnerToast.loading>) => {
      playNotificationBeep();
      return sonnerToast.loading(...args);
    },
    message: (...args: Parameters<typeof sonnerToast.message>) => {
      playNotificationBeep();
      return sonnerToast.message(...args);
    },
    dismiss: sonnerToast.dismiss,
    custom: sonnerToast.custom,
    promise: sonnerToast.promise,
  }
) as typeof sonnerToast;

export { Toaster, toast };
