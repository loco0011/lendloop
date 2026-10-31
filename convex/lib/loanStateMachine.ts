import type { LoanStatus } from "./constants";
import { appError } from "./errors";

/**
 * The single source of truth for how a loan may move between statuses.
 *
 *   pending ──> approved ──> returned
 *      ├──────> declined
 *      └──────> cancelled
 *
 * Declined, cancelled and returned are terminal, so a loan's history can't be
 * rewritten. Who may trigger a transition is checked separately by the auth
 * helpers: this table only answers whether the move is valid.
 */
const ALLOWED_TRANSITIONS: Record<LoanStatus, readonly LoanStatus[]> = {
  pending: ["approved", "declined", "cancelled"],
  approved: ["returned"],
  declined: [],
  cancelled: [],
  returned: [],
};

export function canTransition(from: LoanStatus, to: LoanStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: LoanStatus, to: LoanStatus): void {
  if (!canTransition(from, to)) {
    throw appError(
      "CONFLICT",
      `This loan is already ${from}, so it can't be changed to ${to}.`,
    );
  }
}
