export const APP_TIMEZONE = "Africa/Lagos";

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAY_INDEX = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function coerceDate(value = new Date()) {
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    if (DATE_ONLY_PATTERN.test(value)) return new Date(`${value}T12:00:00`);
    return new Date(value);
  }
  return new Date(value);
}

function fallbackDate(value = new Date()) {
  const date = coerceDate(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function formatter(locale, options) {
  try {
    return new Intl.DateTimeFormat(locale, {
      timeZone: APP_TIMEZONE,
      ...options,
    });
  } catch {
    return new Intl.DateTimeFormat(locale, options);
  }
}

function partsToObject(parts) {
  return parts.reduce((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
}

export function getLagosDateParts(value = new Date()) {
  const date = fallbackDate(value);
  try {
    const parts = formatter("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const obj = partsToObject(parts);
    return {
      year: Number(obj.year),
      month: Number(obj.month),
      day: Number(obj.day),
    };
  } catch {
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
    };
  }
}

export function getLagosDateString(value = new Date()) {
  const { year, month, day } = getLagosDateParts(value);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function getLagosDate(value = new Date()) {
  return new Date(`${getLagosDateString(value)}T12:00:00`);
}

export function getLagosYear(value = new Date()) {
  return getLagosDateParts(value).year;
}

export function getLagosMonthIndex(value = new Date()) {
  return getLagosDateParts(value).month - 1;
}

export function getLagosWeekdayIndex(value = new Date()) {
  const date = fallbackDate(value);
  try {
    const short = formatter("en-US", { weekday: "short" }).format(date);
    return WEEKDAY_INDEX[short] ?? date.getDay();
  } catch {
    return date.getDay();
  }
}

export function formatDateInLagos(value = new Date(), options = {}, locale = "en-NG") {
  const date = fallbackDate(value);
  try {
    return formatter(locale, options).format(date);
  } catch {
    return date.toLocaleDateString(locale, options);
  }
}

export function formatTimeInLagos(value = new Date(), options = {}, locale = "en-NG") {
  const date = fallbackDate(value);
  try {
    return formatter(locale, options).format(date);
  } catch {
    return date.toLocaleTimeString(locale, options);
  }
}

export function formatDateTimeInLagos(value = new Date(), options = {}, locale = "en-NG") {
  const date = fallbackDate(value);
  try {
    return formatter(locale, options).format(date);
  } catch {
    return date.toLocaleString(locale, options);
  }
}
