import type { Id } from "../_generated/dataModel";
import type { LoanStatus } from "./constants";

/**
 * Idempotency keys. The server builds them from trusted values, so a caller
 * can't choose a key. A loan reaches each status at most once, which makes
 * loan + status a stable identity for a notification across retries.
 */
export function notificationKey(loanId: Id<"loans"> | string, status: LoanStatus) {
  return `request_notification:${loanId}:${status}`;
}

export function reminderKey(loanId: Id<"loans"> | string, day: string) {
  return `overdue_reminder:${loanId}:${day}`;
}

/** A failure gets its own key, so it can't block a later successful retry. */
export function failedKey(key: string) {
  return `${key}:failed`;
}

export function workflowFailureKey(executionId: string) {
  return `automation_failure:${executionId}`;
}
