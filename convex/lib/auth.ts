import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { appError } from "./errors";

/**
 * Authorization lives here, on the server. Identity only ever comes from the
 * verified Clerk JWT (ctx.auth), never from function arguments, and the role
 * only ever comes from our own users table, never from token claims.
 */

const FIRST_NAME_MAX_LENGTH = 50;

/** The signed-in user's record, or null if signed out or not yet created. */
export async function getCurrentUser(
  ctx: QueryCtx,
): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return ctx.db
    .query("users")
    .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", identity.subject))
    .unique();
}

export async function requireUser(ctx: QueryCtx): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw appError("UNAUTHENTICATED", "Please sign in to continue.");
  }
  const user = await getCurrentUser(ctx);
  if (!user) {
    // Queries can't write, so the record is created by users.ensureCurrent,
    // which the client calls as soon as it has a session.
    throw appError(
      "UNAUTHENTICATED",
      "Your account is still being set up. Please try again in a moment.",
    );
  }
  return user;
}

export async function requireAdmin(ctx: QueryCtx): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (user.role !== "admin") {
    throw appError("FORBIDDEN", "Only admins can do that.");
  }
  return user;
}

export async function requireToolOwner(ctx: QueryCtx, toolId: Id<"tools">) {
  const user = await requireUser(ctx);
  const tool = await ctx.db.get("tools", toolId);
  if (!tool || !tool.isActive) {
    throw appError("NOT_FOUND", "That tool no longer exists.");
  }
  if (tool.ownerId !== user._id) {
    throw appError("FORBIDDEN", "You can only manage your own tools.");
  }
  return { user, tool };
}

export async function requireLoanParticipant(
  ctx: QueryCtx,
  loanId: Id<"loans">,
) {
  const user = await requireUser(ctx);
  const loan = await ctx.db.get("loans", loanId);
  if (!loan) {
    throw appError("NOT_FOUND", "That loan no longer exists.");
  }
  const isLender = loan.lenderId === user._id;
  const isBorrower = loan.borrowerId === user._id;
  if (!isLender && !isBorrower) {
    throw appError("FORBIDDEN", "You are not part of this loan.");
  }
  return { user, loan, isLender, isBorrower };
}

/**
 * Creates the caller's user record on first sign-in and refreshes their
 * profile afterwards. An existing role is never changed here, so removing an
 * address from ADMIN_EMAILS can't silently demote or re-promote anyone.
 */
export async function upsertCurrentUser(
  ctx: MutationCtx,
): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw appError("UNAUTHENTICATED", "Please sign in to continue.");
  }
  const email = identity.email?.trim().toLowerCase();
  if (!email) {
    throw appError(
      "INVALID_INPUT",
      "Your session has no email address, so we can't send you notifications.",
    );
  }
  const firstName =
    identity.givenName?.trim().slice(0, FIRST_NAME_MAX_LENGTH) || "Neighbour";

  const existing = await getCurrentUser(ctx);
  if (existing) {
    if (existing.email !== email || existing.firstName !== firstName) {
      await ctx.db.patch("users", existing._id, { email, firstName });
      return { ...existing, email, firstName };
    }
    return existing;
  }

  const userId = await ctx.db.insert("users", {
    clerkUserId: identity.subject,
    email,
    firstName,
    // An unverified address must never grant admin: anyone could sign up with
    // an admin's email if the Clerk instance allowed unverified addresses.
    role:
      identity.emailVerified === true && isBootstrapAdmin(email)
        ? "admin"
        : "user",
    isTrustedLender: false,
    createdAt: Date.now(),
  });
  const created = await ctx.db.get("users", userId);
  if (!created) {
    throw appError("NOT_FOUND", "Your account could not be created.");
  }
  return created;
}

function isBootstrapAdmin(email: string): boolean {
  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return adminEmails.includes(email);
}
