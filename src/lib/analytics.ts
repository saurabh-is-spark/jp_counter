import { dateKey, fromDateKey, shiftDays } from "./date.ts";
import type { Entry } from "./entries.ts";

export type Period = "week" | "month" | "year";
export type Targets = { weekly: number; monthly: number; goal: number };
export const emptyTargets: Targets = { weekly: 0, monthly: 0, goal: 0 };

export function parseTargets(value: unknown): Targets {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const valid = (key: string) => typeof record[key] === "number" && Number.isSafeInteger(record[key]) && (record[key] as number) >= 0 && (record[key] as number) <= 1e12 ? record[key] as number : 0;
  return { weekly: valid("weekly"), monthly: valid("monthly"), goal: valid("goal") };
}

export function periodBounds(anchor: string, period: Period) {
  const start = fromDateKey(anchor);
  if (period === "week") start.setDate(start.getDate() - (start.getDay() + 6) % 7);
  else { start.setDate(1); if (period === "year") start.setMonth(0); }
  const end = new Date(start);
  if (period === "week") end.setDate(end.getDate() + 6);
  else if (period === "month") { end.setMonth(end.getMonth() + 1); end.setDate(0); }
  else { end.setFullYear(end.getFullYear() + 1); end.setDate(0); }
  return { start: dateKey(start), end: dateKey(end) };
}

// Compare calendar dates rather than elapsed milliseconds: DST days vary in length.
export function daysBetween(start: string, end: string) {
  const utc = (key: string) => { const d = fromDateKey(key); const u = new Date(0); u.setUTCFullYear(d.getFullYear(), d.getMonth(), d.getDate()); u.setUTCHours(0, 0, 0, 0); return u.getTime(); };
  return Math.round((utc(end) - utc(start)) / 86400000);
}

export function totalBetween(entries: Entry[], start: string, end: string) {
  return entries.reduce((sum, entry) => sum + (entry.date >= start && entry.date <= end ? entry.count : 0), 0);
}

export function summarize(entries: Entry[], today: string, anchor: string, period: Period) {
  const bounds = periodBounds(anchor, period);
  const end = bounds.end < today ? bounds.end : today;
  const days = Math.max(0, daysBetween(bounds.start, end) + 1);
  const relevant = entries.filter(e => e.date >= bounds.start && e.date <= end);
  const total = totalBetween(relevant, bounds.start, end);
  const active = relevant.filter(e => e.count > 0).length;
  const prior = periodBounds(dateKey(shiftDays(fromDateKey(bounds.start), -1)), period);
  const priorEnd = dateKey(shiftDays(fromDateKey(prior.start), Math.min(days - 1, daysBetween(prior.start, prior.end))));
  const previous = totalBetween(entries, prior.start, priorEnd);
  const counts = new Map(entries.map(e => [e.date, e.count]));
  const points = period === "year" ? Array.from({ length: 12 }, (_, i) => {
    const day = fromDateKey(bounds.start); day.setMonth(i);
    const month = periodBounds(dateKey(day), "month");
    return { date: month.start, label: day.toLocaleDateString(undefined, { month: "short" }), value: totalBetween(entries, month.start, month.end < today ? month.end : today), future: month.start > today };
  }) : Array.from({ length: daysBetween(bounds.start, bounds.end) + 1 }, (_, i) => {
    const date = dateKey(shiftDays(fromDateKey(bounds.start), i));
    return { date, label: period === "week" ? fromDateKey(date).toLocaleDateString(undefined, { weekday: "short" }) : String(fromDateKey(date).getDate()), value: date <= today ? counts.get(date) ?? 0 : 0, future: date > today };
  });
  return { ...bounds, days, total, active, average: days ? total / days : 0, consistency: days ? active / days * 100 : 0, previous, change: previous ? (total - previous) / previous * 100 : null, points };
}

export function streaks(entries: Entry[], today: string) {
  const active = new Set(entries.filter(e => e.count > 0 && e.date <= today).map(e => e.date));
  let cursor = fromDateKey(today);
  if (!active.has(today)) cursor = shiftDays(cursor, -1);
  let current = 0;
  while (active.has(dateKey(cursor))) { current++; cursor = shiftDays(cursor, -1); }
  let longest = 0, run = 0, previous = "";
  for (const key of [...active].sort()) {
    run = previous && daysBetween(previous, key) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run); previous = key;
  }
  return { current, longest };
}

export function targetProgress(entries: Entry[], today: string, period: "week" | "month", target: number) {
  const bounds = periodBounds(today, period);
  const total = totalBetween(entries, bounds.start, today);
  const remaining = Math.max(0, target - total);
  const daysLeft = daysBetween(today, bounds.end) + 1;
  return { total, remaining, daysLeft, required: Math.ceil(remaining / daysLeft), percent: target ? Math.min(100, total / target * 100) : 0, ...bounds };
}

export function forecast(entries: Entry[], today: string, goal: number, plannedPace?: number) {
  const allTime = totalBetween(entries, "0001-01-01", today);
  const yesterday = dateKey(shiftDays(fromDateKey(today), -1));
  const first = entries.filter(e => e.date <= yesterday).map(e => e.date).sort()[0];
  const days = first ? Math.min(28, daysBetween(first, yesterday) + 1) : 0;
  const start = dateKey(shiftDays(fromDateKey(today), -days));
  const pace = plannedPace ?? (days ? totalBetween(entries, start, yesterday) / days : 0);
  const remaining = Math.max(0, goal - allTime);
  const daysToGo = goal && pace > 0 ? Math.ceil(remaining / pace) : null;
  // Extremely distant estimates cannot be represented as useful calendar dates.
  const estimatedDate = daysToGo !== null && daysToGo <= 365250 ? dateKey(shiftDays(fromDateKey(today), daysToGo)) : null;
  return { allTime, remaining, pace, sampleDays: days, daysToGo, estimatedDate, reached: goal > 0 && remaining === 0 };
}
