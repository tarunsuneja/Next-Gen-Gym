const tz = "Asia/Kolkata";

export const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export const DATE_IN = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: tz,
});

export const DATE_SHORT = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  timeZone: tz,
});

export const TIME_IN = new Intl.DateTimeFormat("en-IN", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
  timeZone: tz,
});

export const DAY_IN = new Intl.DateTimeFormat("en-CA", {
  timeZone: tz,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function money(paise: number): string {
  return INR.format(paise / 100);
}

export function date(s: string): string {
  if (!s) return "-";
  if (s.length === 10) return DATE_IN.format(new Date(s + "T12:00:00Z"));
  return DATE_IN.format(new Date(s));
}

export function dateShort(s: string): string {
  if (!s) return "-";
  if (s.length === 10) return DATE_SHORT.format(new Date(s + "T12:00:00Z"));
  return DATE_SHORT.format(new Date(s));
}

export function time(s: string): string {
  if (!s) return "-";
  return TIME_IN.format(new Date(s));
}

export function kolkataDayISO(iso: string): string {
  return DAY_IN.format(new Date(iso));
}
