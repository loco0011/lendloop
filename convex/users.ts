import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { getCurrentUser, upsertCurrentUser } from "./lib/auth";
import { userRole } from "./lib/constants";
import { appError } from "./lib/errors";

const currentUserFields = v.object({
  _id: v.id("users"),
  email: v.string(),
  firstName: v.string(),
  role: userRole,
  isTrustedLender: v.boolean(),
});

/** Called by the client as soon as a session exists. Takes no user input. */
export const ensureCurrent = mutation({
  args: {},
  returns: v.id("users"),
  handler: async (ctx) => {
    const user = await upsertCurrentUser(ctx);
    return user._id;
  },
});

/** Null, rather than an error, so the UI can render while setup completes. */
export const me = query({
  args: {},
  returns: v.union(currentUserFields, v.null()),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    return {
      _id: user._id,
      email: user.email,
      firstName: user.firstName,
      role: user.role,
      isTrustedLender: user.isTrustedLender,
    };
  },
});

/**
 * Promotes an existing user. Internal, so it can only be run from the Convex
 * dashboard or CLI: `npx convex run users:promoteToAdmin '{"email":"a@b.c"}'`.
 */
export const promoteToAdmin = internalMutation({
  args: { email: v.string() },
  returns: v.null(),
  handler: async (ctx, { email }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email.trim().toLowerCase()))
      .first();
    if (!user) {
      throw appError(
        "NOT_FOUND",
        "No user with that email. They need to sign in once first.",
      );
    }
    await ctx.db.patch("users", user._id, { role: "admin" });
    return null;
  },
});
