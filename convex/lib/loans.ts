import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { loanStatus, type LoanStatus } from "./constants";
import { isIsoDate, rangesOverlap, todayUtc } from "./dates";
import { appError } from "./errors";
import { assertTransition } from "./loanStateMachine";

export async function getApprovedLoans(
  ctx: QueryCtx,
  toolId: Id<"tools">,
): Promise<Doc<"loans">[]> {
  return ctx.db
    .query("loans")
    .withIndex("by_tool", (q) =>
      q.eq("toolId", toolId).eq("status", "approved"),
    )
    .collect();
}

export async function findApprovedOverlap(
  ctx: QueryCtx,
  toolId: Id<"tools">,
  range: { startDate: string; endDate: string },
): Promise<Doc<"loans"> | undefined> {
  const approved = await getApprovedLoans(ctx, toolId);
  return approved.find((loan) => rangesOverlap(loan, range));
}

/**
 * A tool is on loan from the day an approved loan starts until the lender marks
 * it returned. An overdue tool therefore still shows as on loan, while one
 * approved only for a future date shows as available today.
 */
export function isOnLoan(approvedLoans: Doc<"loans">[], today: string): boolean {
  return approvedLoans.some((loan) => loan.startDate <= today);
}

export function validateLoanDates(startDate: string, endDate: string): void {
  if (!isIsoDate(startDate) || !isIsoDate(endDate)) {
    throw appError("INVALID_INPUT", "Please choose valid dates.");
  }
  if (startDate > endDate) {
    throw appError(
      "INVALID_INPUT",
      "The start date must be on or before the end date.",
    );
  }
  if (startDate < todayUtc()) {
    throw appError(
      "INVALID_INPUT",
      "The start date can't be in the past (dates use UTC).",
    );
  }
}

/**
 * Scheduled from the mutation, so it commits atomically with the status change:
 * a rolled-back change sends nothing, and a committed one can't lose its send.
 */
export async function scheduleLoanNotification(
  ctx: MutationCtx,
  loanId: Id<"loans">,
  status: LoanStatus,
): Promise<void> {
  await ctx.scheduler.runAfter(0, internal.automation.sendLoanNotification, {
    loanId,
    status,
    attempt: 1,
  });
}

/**
 * Every status change goes through here, so none can skip the state machine or
 * its notification.
 */
export async function transitionLoan(
  ctx: MutationCtx,
  loan: Doc<"loans">,
  to: LoanStatus,
): Promise<void> {
  assertTransition(loan.status, to);
  const now = Date.now();
  await ctx.db.patch("loans", loan._id, {
    status: to,
    updatedAt: now,
    ...(to === "returned" ? { returnedAt: now } : {}),
  });
  await scheduleLoanNotification(ctx, loan._id, to);
}

/**
 * What loan lists send to the browser. Participants see each other's first name
 * only: email addresses stay on the server and are used just for notifications.
 */
export const loanView = v.object({
  _id: v.id("loans"),
  toolName: v.string(),
  lenderFirstName: v.string(),
  borrowerFirstName: v.string(),
  startDate: v.string(),
  endDate: v.string(),
  status: loanStatus,
  isOverdue: v.boolean(),
  returnedAt: v.optional(v.number()),
  createdAt: v.number(),
});

export async function toLoanView(ctx: QueryCtx, loan: Doc<"loans">) {
  const [tool, lender, borrower] = await Promise.all([
    ctx.db.get("tools", loan.toolId),
    ctx.db.get("users", loan.lenderId),
    ctx.db.get("users", loan.borrowerId),
  ]);
  return {
    _id: loan._id,
    toolName: tool?.name ?? "Removed tool",
    lenderFirstName: lender?.firstName ?? "Unknown",
    borrowerFirstName: borrower?.firstName ?? "Unknown",
    startDate: loan.startDate,
    endDate: loan.endDate,
    status: loan.status,
    isOverdue: loan.status === "approved" && loan.endDate < todayUtc(),
    returnedAt: loan.returnedAt,
    createdAt: loan.createdAt,
  };
}
