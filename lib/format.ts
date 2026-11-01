/** Formats a stored YYYY-MM-DD day without shifting it into the local timezone. */
export function formatDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString(undefined, {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const relativeTime = new Intl.RelativeTimeFormat("en", { numeric: "always" });

/** Such as "2 days ago". A clock slightly behind the server reads "just now". */
export function formatTimeAgo(timestamp: number, now: number): string {
  const elapsed = now - timestamp;
  if (elapsed < MINUTE_MS) return "just now";
  if (elapsed < HOUR_MS) {
    return relativeTime.format(-Math.floor(elapsed / MINUTE_MS), "minute");
  }
  if (elapsed < DAY_MS) {
    return relativeTime.format(-Math.floor(elapsed / HOUR_MS), "hour");
  }
  return relativeTime.format(-Math.floor(elapsed / DAY_MS), "day");
}
