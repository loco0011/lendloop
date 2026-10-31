import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import {
  failedKey,
  notificationKey,
  reminderKey,
} from "./lib/automationKeys";
import {
  automationEventStatus,
  automationEventType,
  loanStatus,
  type LoanStatus,
} from "./lib/constants";
import { todayUtc } from "./lib/dates";
import {
  EVENT_ID_HEADER,
  nowInSeconds,
  SIGNATURE_HEADER,
  sign,
  TIMESTAMP_HEADER,
} from "./lib/signing";

export const MAX_SEND_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 15_000;
const WEBHOOK_TIMEOUT_MS = 10_000;
const OVERDUE_LIST_LIMIT = 200;
const DETAIL_MAX_LENGTH = 500;

/** 15s after the first failure, then 30s. */
export function retryDelayMs(attempt: number): number {
  return RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
}

/** The person who needs to act on, or learn about, each status. */
function recipientRole(status: LoanStatus): "lender" | "borrower" {
  return status === "pending" || status === "cancelled" ? "lender" : "borrower";
}

const notificationPayload = v.object({
  eventId: v.string(),
  eventType: v.literal("request_notification"),
  loanId: v.string(),
  status: loanStatus,
  recipient: v.object({ email: v.string(), firstName: v.string() }),
  toolName: v.string(),
  startDate: v.string(),
  endDate: v.string(),
});

/**
 * Everything n8n receives about a loan. The `returns` validator keeps it to
 * these fields: only the recipient's own contact details, and no description.
 */
export const getNotificationPayload = internalQuery({
  args: { loanId: v.id("loans"), status: loanStatus },
  returns: v.union(notificationPayload, v.null()),
  handler: async (ctx, { loanId, status }) => {
    const loan = await ctx.db.get("loans", loanId);
    if (!loan) return null;
    const [tool, recipient] = await Promise.all([
      ctx.db.get("tools", loan.toolId),
      ctx.db.get(
        "users",
        recipientRole(status) === "lender" ? loan.lenderId : loan.borrowerId,
      ),
    ]);
    if (!tool || !recipient) return null;
    return {
      eventId: notificationKey(loanId, status),
      eventType: "request_notification" as const,
      loanId,
      status,
      recipient: { email: recipient.email, firstName: recipient.firstName },
      toolName: tool.name,
      startDate: loan.startDate,
      endDate: loan.endDate,
    };
  },
});

/** Posts to n8n. Returns why it failed, or null if n8n accepted the event. */
async function postToN8n(eventId: string, rawBody: string) {
  const url = process.env.N8N_WEBHOOK_URL;
  const secret = process.env.LENDLOOP_WEBHOOK_SECRET;
  if (!url || !secret) {
    return "N8N_WEBHOOK_URL or LENDLOOP_WEBHOOK_SECRET is not set";
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
  try {
    // Signed per attempt: a retry after the backoff needs a fresh timestamp.
    const timestamp = nowInSeconds();
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [TIMESTAMP_HEADER]: String(timestamp),
        [SIGNATURE_HEADER]: await sign(secret, timestamp, rawBody),
        [EVENT_ID_HEADER]: eventId,
      },
      body: rawBody,
      signal: controller.signal,
    });
    return response.ok ? null : `n8n responded with ${response.status}`;
  } catch (error) {
    return error instanceof Error ? error.message : "Network error";
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Runs outside the mutation because mutations can't use the network, and is
 * scheduled by it so the notification only happens if the status change commits.
 *
 * Delivery is at-least-once: if n8n handled a request but its response was
 * lost, the retry sends the event again. The stable eventId lets n8n and the
 * write-back recognize that.
 */
export const sendLoanNotification = internalAction({
  args: {
    loanId: v.id("loans"),
    status: loanStatus,
    attempt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, { loanId, status, attempt }): Promise<null> => {
    const payload = await ctx.runQuery(
      internal.automation.getNotificationPayload,
      { loanId, status },
    );
    if (!payload) return null;

    const failure = await postToN8n(payload.eventId, JSON.stringify(payload));
    if (failure === null) return null;

    console.warn(
      `Notification ${payload.eventId} failed on attempt ${attempt}: ${failure}`,
    );
    if (attempt < MAX_SEND_ATTEMPTS) {
      await ctx.scheduler.runAfter(
        retryDelayMs(attempt),
        internal.automation.sendLoanNotification,
        { loanId, status, attempt: attempt + 1 },
      );
      return null;
    }
    await ctx.runMutation(internal.automation.recordEvent, {
      loanId,
      type: "request_notification",
      status: "failed",
      idempotencyKey: failedKey(payload.eventId),
      detail: `Gave up after ${MAX_SEND_ATTEMPTS} attempts: ${failure}`,
    });
    return null;
  },
});

/**
 * The single place automation events are written. A repeated key changes
 * nothing and still counts as success, so callers can retry safely. Serializable
 * mutations mean two concurrent calls can't both pass the existence check.
 */
export const recordEvent = internalMutation({
  args: {
    // A plain string because it can come from an HTTP body; checked below.
    loanId: v.optional(v.string()),
    type: automationEventType,
    status: automationEventStatus,
    idempotencyKey: v.string(),
    detail: v.optional(v.string()),
  },
  returns: v.union(
    v.literal("recorded"),
    v.literal("duplicate"),
    v.literal("unknown_loan"),
  ),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("automationEvents")
      .withIndex("by_idempotencyKey", (q) =>
        q.eq("idempotencyKey", args.idempotencyKey),
      )
      .first();
    if (existing) return "duplicate";

    let loanId = undefined;
    if (args.loanId !== undefined) {
      const normalized = ctx.db.normalizeId("loans", args.loanId);
      const loan = normalized && (await ctx.db.get("loans", normalized));
      if (!loan) return "unknown_loan";
      loanId = loan._id;
    }

    await ctx.db.insert("automationEvents", {
      loanId,
      type: args.type,
      status: args.status,
      idempotencyKey: args.idempotencyKey,
      detail: args.detail?.slice(0, DETAIL_MAX_LENGTH),
      createdAt: Date.now(),
    });
    return "recorded";
  },
});

/**
 * Approved, not returned, and due before today. Loans already reminded today
 * are left out, so re-running the workflow doesn't email the same person twice.
 */
export const listOverdueLoans = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      loanId: v.id("loans"),
      borrowerFirstName: v.string(),
      borrowerEmail: v.string(),
      toolName: v.string(),
      dueDate: v.string(),
    }),
  ),
  handler: async (ctx) => {
    const today = todayUtc();
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_status_endDate", (q) =>
        q.eq("status", "approved").lt("endDate", today),
      )
      .take(OVERDUE_LIST_LIMIT);

    const overdue = [];
    for (const loan of loans) {
      const alreadyReminded = await ctx.db
        .query("automationEvents")
        .withIndex("by_idempotencyKey", (q) =>
          q.eq("idempotencyKey", reminderKey(loan._id, today)),
        )
        .first();
      if (alreadyReminded) continue;

      const [tool, borrower] = await Promise.all([
        ctx.db.get("tools", loan.toolId),
        ctx.db.get("users", loan.borrowerId),
      ]);
      if (!tool || !borrower) continue;
      overdue.push({
        loanId: loan._id,
        borrowerFirstName: borrower.firstName,
        borrowerEmail: borrower.email,
        toolName: tool.name,
        dueDate: loan.endDate,
      });
    }
    return overdue;
  },
});
