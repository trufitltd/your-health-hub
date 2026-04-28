const DEFAULT_APPOINTMENT_TIME_ZONE = "Africa/Lagos";

const parseDateParts = (dateValue: string) => {
  const match = String(dateValue || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
};

const parseTimeParts = (timeValue: string) => {
  const trimmed = String(timeValue || "").trim();
  const hhmm = trimmed.match(/^(\d{2}):(\d{2})$/);
  if (hhmm) {
    return { hours: Number(hhmm[1]), minutes: Number(hhmm[2]), seconds: 0 };
  }
  const hhmmss = trimmed.match(/^(\d{2}):(\d{2}):(\d{2})$/);
  if (hhmmss) {
    return { hours: Number(hhmmss[1]), minutes: Number(hhmmss[2]), seconds: Number(hhmmss[3]) };
  }
  return null;
};

const getPartsForTimeZone = (value: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(value);

  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value || "0");

  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hours: read("hour"),
    minutes: read("minute"),
    seconds: read("second"),
  };
};

export const appointmentLocalToDate = (
  dateValue: string,
  timeValue: string,
  sourceTimeZone = DEFAULT_APPOINTMENT_TIME_ZONE
): Date | null => {
  const dateParts = parseDateParts(dateValue);
  const timeParts = parseTimeParts(timeValue);
  if (!dateParts || !timeParts) return null;

  const targetUtcMs = Date.UTC(
    dateParts.year,
    dateParts.month - 1,
    dateParts.day,
    timeParts.hours,
    timeParts.minutes,
    timeParts.seconds
  );

  // Iterate to find UTC instant that maps to desired wall-clock in source timezone.
  let guessMs = targetUtcMs;
  for (let i = 0; i < 3; i += 1) {
    const actual = getPartsForTimeZone(new Date(guessMs), sourceTimeZone);
    const actualUtcMs = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hours,
      actual.minutes,
      actual.seconds
    );
    const diffMs = targetUtcMs - actualUtcMs;
    if (Math.abs(diffMs) < 1000) break;
    guessMs += diffMs;
  }

  const resolved = new Date(guessMs);
  return Number.isNaN(resolved.getTime()) ? null : resolved;
};

export const APPOINTMENT_BASE_TIME_ZONE = DEFAULT_APPOINTMENT_TIME_ZONE;
