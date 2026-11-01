import { describe, expect, it } from "vitest";
import { formatTimeAgo } from "./format";

const NOW = Date.UTC(2030, 0, 10);
const MINUTE = 60_000;

describe("formatTimeAgo", () => {
  it.each([
    [0, "just now"],
    [-5 * MINUTE, "just now"], // the browser clock is behind the server
    [59_000, "just now"],
    [MINUTE, "1 minute ago"],
    [59 * MINUTE, "59 minutes ago"],
    [60 * MINUTE, "1 hour ago"],
    [24 * 60 * MINUTE, "1 day ago"],
    [48 * 60 * MINUTE, "2 days ago"],
  ])("formats %i ms as %s", (elapsed, expected) => {
    expect(formatTimeAgo(NOW - elapsed, NOW)).toBe(expected);
  });
});
