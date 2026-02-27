import { useLanguage, type AppLanguage } from "@/contexts/LanguageContext";

export const LANGUAGE_TO_LOCALE: Record<AppLanguage, string> = {
  en: "en-US",
  ha: "ha-NG",
  ig: "ig-NG",
  yo: "yo-NG",
  sw: "sw-KE",
  ar: "ar",
  fr: "fr-FR",
  es: "es-ES",
  pt: "pt-PT",
  nl: "nl-NL",
  zh: "zh-CN",
  de: "de-DE",
};

const LANGUAGE_NUMBERING_SYSTEM: Partial<Record<AppLanguage, string>> = {
  ar: "arab",
};

const isValidDate = (value: Date) => Number.isFinite(value.getTime());
const toValidDate = (value: Date | string | number | null | undefined): Date | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return isValidDate(parsed) ? parsed : null;
};

export const localeForLanguage = (language: AppLanguage) => LANGUAGE_TO_LOCALE[language] || "en-US";
const numberingSystemForLanguage = (language: AppLanguage) => LANGUAGE_NUMBERING_SYSTEM[language];

const withDateTimeNumbering = (
  language: AppLanguage,
  options?: Intl.DateTimeFormatOptions
): Intl.DateTimeFormatOptions => {
  const numberingSystem = numberingSystemForLanguage(language);
  if (!numberingSystem) return { ...(options || {}) };
  return {
    numberingSystem,
    ...(options || {}),
  };
};

const withNumberNumbering = (
  language: AppLanguage,
  options?: Intl.NumberFormatOptions
): Intl.NumberFormatOptions => {
  const numberingSystem = numberingSystemForLanguage(language);
  if (!numberingSystem) return { ...(options || {}) };
  return {
    numberingSystem,
    ...(options || {}),
  };
};

export const formatDateForLanguage = (
  language: AppLanguage,
  value: Date | string | number | null | undefined,
  options?: Intl.DateTimeFormatOptions,
  fallback = ""
) => {
  const parsed = toValidDate(value);
  if (!parsed) return fallback;
  return new Intl.DateTimeFormat(
    localeForLanguage(language),
    withDateTimeNumbering(language, options)
  ).format(parsed);
};

export const formatTimeForLanguage = (
  language: AppLanguage,
  value: Date | string | number | null | undefined,
  options?: Intl.DateTimeFormatOptions,
  fallback = ""
) => {
  const parsed = toValidDate(value);
  if (!parsed) return fallback;
  return new Intl.DateTimeFormat(
    localeForLanguage(language),
    withDateTimeNumbering(language, {
      hour: "2-digit",
      minute: "2-digit",
      ...options,
    })
  ).format(parsed);
};

export const formatClockTimeForLanguage = (
  language: AppLanguage,
  value: string | null | undefined,
  options?: Intl.DateTimeFormatOptions,
  fallback = ""
) => {
  if (!value) return fallback;
  const raw = value.trim();
  if (!raw) return fallback;
  const normalized = /^\d{2}:\d{2}$/.test(raw) ? `${raw}:00` : raw;
  const parsed = toValidDate(`1970-01-01T${normalized}`);
  if (!parsed) return fallback;
  return new Intl.DateTimeFormat(
    localeForLanguage(language),
    withDateTimeNumbering(language, {
      hour: "2-digit",
      minute: "2-digit",
      ...options,
    })
  ).format(parsed);
};

export const formatDateTimeForLanguage = (
  language: AppLanguage,
  value: Date | string | number | null | undefined,
  options?: Intl.DateTimeFormatOptions,
  fallback = ""
) => {
  const parsed = toValidDate(value);
  if (!parsed) return fallback;
  return new Intl.DateTimeFormat(
    localeForLanguage(language),
    withDateTimeNumbering(language, options)
  ).format(parsed);
};

export const formatNumberForLanguage = (
  language: AppLanguage,
  value: number,
  options?: Intl.NumberFormatOptions,
  fallback = ""
) => {
  if (!Number.isFinite(value)) return fallback;
  return new Intl.NumberFormat(
    localeForLanguage(language),
    withNumberNumbering(language, options)
  ).format(value);
};

export const formatCurrencyForLanguage = (
  language: AppLanguage,
  value: number,
  currency = "NGN",
  options?: Intl.NumberFormatOptions,
  fallback = ""
) => {
  if (!Number.isFinite(value)) return fallback;
  return new Intl.NumberFormat(
    localeForLanguage(language),
    withNumberNumbering(language, {
      style: "currency",
      currency,
      ...options,
    })
  ).format(value);
};

export const useLocaleFormatter = () => {
  const { language } = useLanguage();
  const locale = localeForLanguage(language);

  return {
    language,
    locale,
    formatDate: (value: Date | string | number | null | undefined, options?: Intl.DateTimeFormatOptions, fallback?: string) =>
      formatDateForLanguage(language, value, options, fallback),
    formatTime: (value: Date | string | number | null | undefined, options?: Intl.DateTimeFormatOptions, fallback?: string) =>
      formatTimeForLanguage(language, value, options, fallback),
    formatClockTime: (value: string | null | undefined, options?: Intl.DateTimeFormatOptions, fallback?: string) =>
      formatClockTimeForLanguage(language, value, options, fallback),
    formatDateTime: (value: Date | string | number | null | undefined, options?: Intl.DateTimeFormatOptions, fallback?: string) =>
      formatDateTimeForLanguage(language, value, options, fallback),
    formatNumber: (value: number, options?: Intl.NumberFormatOptions, fallback?: string) =>
      formatNumberForLanguage(language, value, options, fallback),
    formatCurrency: (value: number, currency = "NGN", options?: Intl.NumberFormatOptions, fallback?: string) =>
      formatCurrencyForLanguage(language, value, currency, options, fallback),
  };
};
