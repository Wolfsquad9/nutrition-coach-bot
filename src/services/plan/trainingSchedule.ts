/**
 * Pure date/scheduling helpers for training plans (Option B calendar gating).
 *
 * No Supabase, no React, no side effects — deterministic given the same inputs.
 * The plan's coach-owned `startDate` (ISO YYYY-MM-DD) anchors Week 1 / Day 1;
 * each subsequent prescribed session offsets by one day.
 */

export const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

/** Add `days` to an ISO (YYYY-MM-DD) date, returning a UTC Date. */
export function addDays(isoDate: string, days: number): Date {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

/** Format a Date as an ISO YYYY-MM-DD string. */
export function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Human weekday name for a Date (e.g. 'Tuesday'). */
export function getWeekdayName(date: Date): string {
  return DAY_NAMES[date.getUTCDay()];
}

/** Human weekday name for an ISO date string (e.g. 'Tuesday'). */
export function weekdayNameOfIso(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return DAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}
