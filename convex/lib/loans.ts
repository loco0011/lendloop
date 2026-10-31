import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { rangesOverlap } from "./dates";
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

export async function hasApprovedOverlap(
  ctx: QueryCtx,
  toolId: Id<"tools">,
  range: { startDate: string; endDate: string },
): Promise<boolean> {
  const approved = await getApprovedLoans(ctx, toolId);
  return approved.some((loan) => rangesOverlap(loan, range));
}

/**
 * A tool is on loan from the day an approved loan starts until the lender marks
 * it returned. An overdue tool therefore still shows as on loan, while one
 * approved only for a future date shows as available today.
 */
export function isOnLoan(approvedLoans: Doc<"loans">[], today: string): boolean {
  return approvedLoans.some((loan) => loan.startDate <= today);
}

/** Every status change goes through here, so none can skip the state machine. */
export async function transitionLoan(
  ctx: MutationCtx,
  loan: Doc<"loans">,
  to: Doc<"loans">["status"],
): Promise<void> {
  assertTransition(loan.status, to);
  const now = Date.now();
  await ctx.db.patch("loans", loan._id, {
    status: to,
    updatedAt: now,
    ...(to === "returned" ? { returnedAt: now } : {}),
  });
}
