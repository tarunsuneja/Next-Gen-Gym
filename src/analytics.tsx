import { indiaDay, indiaHourFormatter } from "./shared/formatters";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { shiftDay, type Payment } from "./domain";

export type RangeKey = "today" | "7" | "30" | "month";
export const RANGES: {
  key: RangeKey;
  label: string;
  badge: string;
  note: string;
}[] = [
  {
    key: "today",
    label: "Today",
    badge: "Today by hour",
    note: "vs yesterday",
  },
  {
    key: "7",
    label: "7 days",
    badge: "Last 7 days",
    note: "vs previous 7 days",
  },
  {
    key: "30",
    label: "30 days",
    badge: "Last 30 days",
    note: "vs previous 30 days",
  },
  {
    key: "month",
    label: "This month",
    badge: "Month to date",
    note: "vs previous month-to-date",
  },
];
export const kolkataDay = indiaDay;
export function kolkataHour(iso: string) {
  return Number(indiaHourFormatter.format(new Date(iso)));
}
export function monthFirstDay(t: string) {
  return t.slice(0, 8) + "01";
}
export function daySpan(from: string, to: string) {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
}
export function dashWindow(key: RangeKey, t: string) {
  if (key === "today")
    return {
      from: t,
      to: t,
      prevFrom: shiftDay(t, -1),
      prevTo: shiftDay(t, -1),
      note: RANGES[0].note,
    };
  if (key === "7")
    return {
      from: shiftDay(t, -6),
      to: t,
      prevFrom: shiftDay(t, -13),
      prevTo: shiftDay(t, -7),
      note: RANGES[1].note,
    };
  if (key === "30")
    return {
      from: shiftDay(t, -29),
      to: t,
      prevFrom: shiftDay(t, -59),
      prevTo: shiftDay(t, -30),
      note: RANGES[2].note,
    };
  const first = monthFirstDay(t);
  const prevTo = shiftDay(first, -1);
  return {
    from: first,
    to: t,
    prevFrom: monthFirstDay(prevTo),
    prevTo: shiftDay(
      monthFirstDay(prevTo),
      Math.min(Number(t.slice(8)), Number(prevTo.slice(8))) - 1,
    ),
    note: RANGES[3].note,
  };
}
export function deltaOf(now: number, prev: number) {
  if (prev === 0)
    return { dir: now > 0 ? ("up" as const) : ("flat" as const), pct: null };
  const pct = Math.round(((now - prev) / prev) * 100);
  return {
    dir:
      pct > 0
        ? ("up" as const)
        : pct < 0
          ? ("down" as const)
          : ("flat" as const),
    pct,
  };
}
export function Trend({
  now,
  prev,
  label,
}: {
  now: number;
  prev: number;
  label: string;
}) {
  const { dir, pct } = deltaOf(now, prev);
  const Icon =
    dir === "up" ? TrendingUp : dir === "down" ? TrendingDown : Minus;
  const text =
    pct === null ? (dir === "up" ? "New" : "No change") : `${Math.abs(pct)}%`;
  return (
    <span className={"stat-trend " + dir}>
      <Icon size={13} />
      <b>{text}</b>
      <em>{label}</em>
    </span>
  );
}
export function chartBuckets(
  key: RangeKey,
  t: string,
  payments: Payment[],
  dayOf: (iso: string) => string,
) {
  // Convert each timestamp once, rather than once for every chart bucket.
  const firstDay =
    key === "30"
      ? shiftDay(t, -29)
      : key === "7"
        ? shiftDay(t, -6)
        : monthFirstDay(t);
  const totals = new Map<string, number>();
  for (const payment of payments) {
    const day = dayOf(payment.at);
    if (key === "today" ? day !== t : day < firstDay || day > t) continue;
    const bucket = key === "today" ? "h" + kolkataHour(payment.at) : day;
    totals.set(bucket, (totals.get(bucket) ?? 0) + payment.amount);
  }
  if (key === "today") {
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const nowHour = kolkataHour(new Date().toISOString());
    return {
      dense: true,
      activeKey: "h" + nowHour,
      buckets: hours.map((h) => ({
        key: "h" + h,
        label:
          h % 3 === 0 || h === 23
            ? `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "a" : "p"}`
            : "",
        total: totals.get("h" + h) ?? 0,
      })),
    };
  }
  const start =
    key === "30"
      ? shiftDay(t, -29)
      : key === "7"
        ? shiftDay(t, -6)
        : monthFirstDay(t);
  const days = daySpan(start, t);
  const dense = days > 10;
  const buckets = Array.from({ length: days }, (_, i) => {
    const day = shiftDay(start, i);
    let label = "";
    if (key === "7") {
      label =
        day === t
          ? "Today"
          : new Date(day + "T12:00:00").toLocaleDateString("en-IN", {
              weekday: "short",
            });
    } else if (i === 0 || i === days - 1 || (dense && i % 5 === 0)) {
      label = day === t ? "Today" : String(Number(day.slice(8)));
    }
    return { key: day, label, total: totals.get(day) ?? 0 };
  });
  return { dense, activeKey: t, buckets };
}
