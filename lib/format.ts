/** Formats a stored YYYY-MM-DD day without shifting it into the local timezone. */
export function formatDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString(undefined, {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
