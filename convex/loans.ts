import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireToolOwner } from "./lib/auth";
import { appError } from "./lib/errors";
import { hasApprovedOverlap, transitionLoan } from "./lib/loans";
import { assertTransition } from "./lib/loanStateMachine";

export const approve = mutation({
  args: { loanId: v.id("loans") },
  returns: v.null(),
  handler: async (ctx, { loanId }) => {
    const loan = await ctx.db.get("loans", loanId);
    if (!loan) {
      throw appError("NOT_FOUND", "That request no longer exists.");
    }
    await requireToolOwner(ctx, loan.toolId);

    // First, so an already-approved loan isn't reported as overlapping itself.
    assertTransition(loan.status, "approved");

    // Checked again here, not just at request time: two pending requests can
    // overlap each other, and only one of them may win. Convex mutations are
    // serializable, so two concurrent approvals can't both pass this check.
    if (await hasApprovedOverlap(ctx, loan.toolId, loan)) {
      throw appError(
        "CONFLICT",
        "These dates overlap a loan you have already approved.",
      );
    }
    await transitionLoan(ctx, loan, "approved");
    return null;
  },
});
