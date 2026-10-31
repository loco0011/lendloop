import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  requireLender,
  requireLoanParticipant,
  requireUser,
} from "./lib/auth";
import { todayUtc } from "./lib/dates";
import { appError } from "./lib/errors";
import {
  findApprovedOverlap,
  loanView,
  toLoanView,
  transitionLoan,
  validateLoanDates,
} from "./lib/loans";
import { assertTransition } from "./lib/loanStateMachine";

const LOAN_LIST_LIMIT = 100;

export const request = mutation({
  args: {
    toolId: v.id("tools"),
    startDate: v.string(),
    endDate: v.string(),
  },
  returns: v.id("loans"),
  handler: async (ctx, { toolId, startDate, endDate }) => {
    const user = await requireUser(ctx);
    const tool = await ctx.db.get("tools", toolId);
    if (!tool || !tool.isActive) {
      throw appError("NOT_FOUND", "That tool no longer exists.");
    }
    if (tool.ownerId === user._id) {
      throw appError("FORBIDDEN", "You can't borrow your own tool.");
    }
    validateLoanDates(startDate, endDate);

    const conflict = await findApprovedOverlap(ctx, toolId, {
      startDate,
      endDate,
    });
    if (conflict) {
      throw appError(
        "CONFLICT",
        `This tool is already booked from ${conflict.startDate} to ${conflict.endDate}.`,
      );
    }

    const now = Date.now();
    return ctx.db.insert("loans", {
      toolId,
      lenderId: tool.ownerId,
      borrowerId: user._id,
      startDate,
      endDate,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const approve = mutation({
  args: { loanId: v.id("loans") },
  returns: v.null(),
  handler: async (ctx, { loanId }) => {
    const { loan } = await requireLender(ctx, loanId);

    // First, so an already-approved loan isn't reported as overlapping itself.
    assertTransition(loan.status, "approved");

    // Otherwise the loan would be overdue the moment it was approved.
    if (loan.endDate < todayUtc()) {
      throw appError(
        "CONFLICT",
        "The requested dates have passed. Decline this request instead.",
      );
    }

    // Checked again here, not just at request time: two pending requests can
    // overlap each other, and only one of them may win. Convex mutations are
    // serializable, so two concurrent approvals can't both pass this check.
    if (await findApprovedOverlap(ctx, loan.toolId, loan)) {
      throw appError(
        "CONFLICT",
        "These dates overlap a loan you have already approved.",
      );
    }
    await transitionLoan(ctx, loan, "approved");
    return null;
  },
});

export const decline = mutation({
  args: { loanId: v.id("loans") },
  returns: v.null(),
  handler: async (ctx, { loanId }) => {
    const { loan } = await requireLender(ctx, loanId);
    await transitionLoan(ctx, loan, "declined");
    return null;
  },
});

export const cancel = mutation({
  args: { loanId: v.id("loans") },
  returns: v.null(),
  handler: async (ctx, { loanId }) => {
    const { loan, isBorrower } = await requireLoanParticipant(ctx, loanId);
    if (!isBorrower) {
      throw appError("FORBIDDEN", "Only the borrower can cancel a request.");
    }
    await transitionLoan(ctx, loan, "cancelled");
    return null;
  },
});

export const markReturned = mutation({
  args: { loanId: v.id("loans") },
  returns: v.null(),
  handler: async (ctx, { loanId }) => {
    const { loan } = await requireLender(ctx, loanId);
    await transitionLoan(ctx, loan, "returned");
    return null;
  },
});

/** "My requests": loans where the signed-in user is the borrower. */
export const listMine = query({
  args: {},
  returns: v.array(loanView),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_borrower", (q) => q.eq("borrowerId", user._id))
      .order("desc")
      .take(LOAN_LIST_LIMIT);
    return Promise.all(loans.map((loan) => toLoanView(ctx, loan)));
  },
});

/** "Incoming requests": loans on tools the signed-in user owns. */
export const listIncoming = query({
  args: {},
  returns: v.array(loanView),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_lender", (q) => q.eq("lenderId", user._id))
      .order("desc")
      .take(LOAN_LIST_LIMIT);
    return Promise.all(loans.map((loan) => toLoanView(ctx, loan)));
  },
});
