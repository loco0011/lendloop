import { describe, expect, it } from "vitest";
import type { LoanStatus } from "./lib/constants";
import { assertTransition, canTransition } from "./lib/loanStateMachine";

const ALL_STATUSES: LoanStatus[] = [
  "pending",
  "approved",
  "declined",
  "cancelled",
  "returned",
];

const VALID_TRANSITIONS = new Set([
  "pending->approved",
  "pending->declined",
  "pending->cancelled",
  "approved->returned",
]);

describe("loan state machine", () => {
  // Checks all 25 pairs, so a new transition can't be added by accident.
  for (const from of ALL_STATUSES) {
    for (const to of ALL_STATUSES) {
      const isValid = VALID_TRANSITIONS.has(`${from}->${to}`);
      it(`${isValid ? "allows" : "rejects"} ${from} -> ${to}`, () => {
        expect(canTransition(from, to)).toBe(isValid);
      });
    }
  }

  it("throws on an invalid transition", () => {
    expect(() => assertTransition("returned", "approved")).toThrow();
  });
});
