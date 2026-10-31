/**
 * Loan dates are calendar days stored as "YYYY-MM-DD" strings, not timestamps.
 * A loan runs for whole days, so a timestamp would invent a time of day and
 * timezone that nobody chose. These strings also sort chronologically, which
 * makes plain string comparison and range indexes work.
 *
 * "Today" is always the UTC day, so the server has a single definition of it.
 */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function toIsoDate(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

export function todayUtc(now: number = Date.now()): string {
  return toIsoDate(now);
}

/** True only for real calendar days: "2026-02-30" fails the round trip. */
export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(timestamp) && toIsoDate(timestamp) === value;
}

/** Inclusive on both ends: a loan ending on the 5th blocks a start on the 5th. */
export function rangesOverlap(
  a: { startDate: string; endDate: string },
  b: { startDate: string; endDate: string },
): boolean {
  return a.startDate <= b.endDate && b.startDate <= a.endDate;
}
