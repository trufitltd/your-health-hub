import { type AppLanguage, useLanguage } from "@/contexts/LanguageContext";

interface LanguageSelectorProps {
  className?: string;
}

const LANGUAGE_OPTIONS: Array<{ value: AppLanguage; flag: string; labelKey: string; fallback: string }> = [
  { value: "en", flag: "🇬🇧", labelKey: "lang.english", fallback: "English" },
  { value: "ha", flag: "🇳🇬", labelKey: "lang.hausa", fallback: "Hausa" },
  { value: "ig", flag: "🇳🇬", labelKey: "lang.igbo", fallback: "Igbo" },
  { value: "yo", flag: "🇳🇬", labelKey: "lang.yoruba", fallback: "Yoruba" },
  { value: "sw", flag: "🇹🇿", labelKey: "lang.swahili", fallback: "Swahili" },
  { value: "ar", flag: "🇸🇦", labelKey: "lang.arabic", fallback: "Arabic" },
  { value: "fr", flag: "🇫🇷", labelKey: "lang.french", fallback: "French" },
  { value: "es", flag: "🇪🇸", labelKey: "lang.spanish", fallback: "Spanish" },
  { value: "pt", flag: "🇵🇹", labelKey: "lang.portuguese", fallback: "Portuguese" },
  { value: "nl", flag: "🇳🇱", labelKey: "lang.dutch", fallback: "Dutch" },
  { value: "zh", flag: "🇨🇳", labelKey: "lang.mandarin", fallback: "Chinese (Mandarin)" },
  { value: "de", flag: "🇩🇪", labelKey: "lang.german", fallback: "German" },
];

export function LanguageSelector({ className = "" }: LanguageSelectorProps) {
  const { language, setLanguage, t } = useLanguage();

  return (
    <div className={className}>
      <label className="sr-only" htmlFor="app-language-select">
        {t("common.language", "Language")}
      </label>
      <select
        id="app-language-select"
        value={language}
        onChange={(event) => setLanguage(event.target.value as AppLanguage)}
        className="h-9 rounded-md border border-border bg-background px-2 text-xs sm:text-sm text-foreground"
      >
        {LANGUAGE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {`${option.flag} ${t(option.labelKey, option.fallback)}`}
          </option>
        ))}
      </select>
    </div>
  );
}

export function FloatingLanguageSelector() {
  return (
    <div
      className="fixed z-[120] rounded-lg border border-border bg-background/95 p-2 shadow-lg backdrop-blur-sm bottom-4 left-4"
    >
      <LanguageSelector />
    </div>
  );
}
