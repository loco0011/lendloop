import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import type { LoanStatus } from "./constants";

const ACTIVITY_PER_LOAN = 5;

/** The person who needs to act on, or learn about, each status. */
export function recipientRole(status: LoanStatus): "Lender" | "Borrower" {
  return status === "pending" || status === "cancelled" ? "Lender" : "Borrower";
}

/** Notification keys end with the loan status, so the role can be worked out. */
function notifiedRole(idempotencyKey: string): "Lender" | "Borrower" {
  const status = idempotencyKey.split(":")[2] as LoanStatus;
  return recipientRole(status);
}

function describeEvent(event: Doc<"automationEvents">): string {
  const failed = event.status === "failed";
  if (event.type === "overdue_reminder") {
    return failed ? "Reminder failed" : "Reminder sent";
  }
  const role = notifiedRole(event.idempotencyKey);
  return failed ? `${role} notification failed` : `${role} notified`;
}

/**
 * What participants see of a loan's automation. Failure details are left out
 * because they can contain internal URLs. Admins read those separately.
 */
export const activityItem = v.object({
  _id: v.id("automationEvents"),
  label: v.string(),
  isFailure: v.boolean(),
  createdAt: v.number(),
});

export async function getLoanActivity(ctx: QueryCtx, loanId: Id<"loans">) {
  const events = await ctx.db
    .query("automationEvents")
    .withIndex("by_loan", (q) => q.eq("loanId", loanId))
    .order("desc")
    .take(ACTIVITY_PER_LOAN);
  return events.map((event) => ({
    _id: event._id,
    label: describeEvent(event),
    isFailure: event.status === "failed",
    createdAt: event.createdAt,
  }));
}
