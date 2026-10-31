import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireAdmin } from "./lib/auth";
import { appError } from "./lib/errors";
import { deactivateTool } from "./tools";

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
