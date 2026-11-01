import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAdmin } from "./lib/auth";
import { automationEventType, userRole } from "./lib/constants";
import { appError } from "./lib/errors";
import { loanView, toLoanView } from "./lib/loans";
import { deactivateTool } from "./tools";

const ADMIN_LIST_LIMIT = 200;
const FAILURE_LIST_LIMIT = 50;

export const listLoans = query({
  args: {},
  returns: v.array(loanView),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const loans = await ctx.db
      .query("loans")
      .order("desc")
      .take(ADMIN_LIST_LIMIT);
    return Promise.all(loans.map((loan) => toLoanView(ctx, loan)));
  },
});

/** Includes email because admins may need to tell two "Sam"s apart. */
export const listUsers = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("users"),
      firstName: v.string(),
      email: v.string(),
      role: userRole,
      isTrustedLender: v.boolean(),
    }),
  ),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db.query("users").take(ADMIN_LIST_LIMIT);
    return users.map((user) => ({
      _id: user._id,
      firstName: user.firstName,
      email: user.email,
      role: user.role,
      isTrustedLender: user.isTrustedLender,
    }));
  },
});

/**
 * Includes failures with no loan, such as a whole workflow failing. Nobody else
 * can see those, so this is what stops them being silent.
 */
export const listAutomationFailures = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("automationEvents"),
      type: automationEventType,
      detail: v.optional(v.string()),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const failures = await ctx.db
      .query("automationEvents")
      .withIndex("by_status", (q) => q.eq("status", "failed"))
      .order("desc")
      .take(FAILURE_LIST_LIMIT);
    return failures.map((failure) => ({
      _id: failure._id,
      type: failure.type,
      detail: failure.detail,
      createdAt: failure.createdAt,
    }));
  },
});

export const removeListing = mutation({
  args: { toolId: v.id("tools") },
  returns: v.null(),
  handler: async (ctx, { toolId }) => {
    await requireAdmin(ctx);
    const tool = await ctx.db.get("tools", toolId);
    if (!tool || !tool.isActive) {
      throw appError("NOT_FOUND", "That tool no longer exists.");
    }
    await deactivateTool(ctx, tool);
    return null;
  },
});

export const setTrustedLender = mutation({
  args: { userId: v.id("users"), isTrusted: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { userId, isTrusted }) => {
    await requireAdmin(ctx);
    const user = await ctx.db.get("users", userId);
    if (!user) {
      throw appError("NOT_FOUND", "That user no longer exists.");
    }
    await ctx.db.patch("users", userId, { isTrustedLender: isTrusted });
    return null;
  },
});
