import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireToolOwner, requireUser } from "./lib/auth";
import {
  TOOL_DESCRIPTION_MAX_LENGTH,
  TOOL_NAME_MAX_LENGTH,
  toolCategory,
  toolCondition,
} from "./lib/constants";
import { todayUtc } from "./lib/dates";
import { appError } from "./lib/errors";
import { getApprovedLoans, isOnLoan, transitionLoan } from "./lib/loans";
import { cleanText } from "./lib/text";

const PUBLIC_LIST_LIMIT = 100;

const toolInput = {
  name: v.string(),
  category: toolCategory,
  condition: toolCondition,
  description: v.string(),
};

function cleanToolName(name: string) {
  return cleanText(name, "Tool name", { max: TOOL_NAME_MAX_LENGTH });
}

function cleanToolDescription(description: string) {
  return cleanText(description, "Description", {
    max: TOOL_DESCRIPTION_MAX_LENGTH,
  });
}

/**
 * The only function callable while signed out. The `returns` validator is the
 * privacy boundary: Convex rejects the response if any field beyond name and
 * category is ever added, so owner data can't leak through a later edit.
 */
export const listPublic = query({
  args: {},
  returns: v.array(v.object({ name: v.string(), category: toolCategory })),
  handler: async (ctx) => {
    const today = todayUtc();
    const tools = await ctx.db
      .query("tools")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .order("desc")
      .take(PUBLIC_LIST_LIMIT);

    const available: { name: string; category: Doc<"tools">["category"] }[] =
      [];
    for (const tool of tools) {
      const approvedLoans = await getApprovedLoans(ctx, tool._id);
      if (!isOnLoan(approvedLoans, today)) {
        available.push({ name: tool.name, category: tool.category });
      }
    }
    return available;
  },
});

export const create = mutation({
  args: toolInput,
  returns: v.id("tools"),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return ctx.db.insert("tools", {
      ownerId: user._id,
      name: cleanToolName(args.name),
      category: args.category,
      condition: args.condition,
      description: cleanToolDescription(args.description),
      isActive: true,
      createdAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: { toolId: v.id("tools"), ...toolInput },
  returns: v.null(),
  handler: async (ctx, { toolId, ...args }) => {
    await requireToolOwner(ctx, toolId);
    await ctx.db.patch("tools", toolId, {
      name: cleanToolName(args.name),
      category: args.category,
      condition: args.condition,
      description: cleanToolDescription(args.description),
    });
    return null;
  },
});

export const remove = mutation({
  args: { toolId: v.id("tools") },
  returns: v.null(),
  handler: async (ctx, { toolId }) => {
    const { tool } = await requireToolOwner(ctx, toolId);
    const approvedLoans = await getApprovedLoans(ctx, toolId);
    if (approvedLoans.length > 0) {
      throw appError(
        "CONFLICT",
        "This tool has an approved loan. Mark it returned before deleting.",
      );
    }
    await deactivateTool(ctx, tool);
    return null;
  },
});

/**
 * Soft-deletes a listing and declines its pending requests, so no borrower is
 * left waiting on a tool that has gone. Approved loans are left alone: an admin
 * can remove a listing mid-loan, and the lender must still be able to mark it
 * returned.
 */
export async function deactivateTool(ctx: MutationCtx, tool: Doc<"tools">) {
  const pendingLoans = await ctx.db
    .query("loans")
    .withIndex("by_tool", (q) =>
      q.eq("toolId", tool._id).eq("status", "pending"),
    )
    .collect();
  for (const loan of pendingLoans) {
    await transitionLoan(ctx, loan, "declined");
  }
  await ctx.db.patch("tools", tool._id, { isActive: false });
}
