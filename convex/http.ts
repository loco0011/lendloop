import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import { httpAction } from "./_generated/server";
import {
  failedKey,
  notificationKey,
  reminderKey,
  workflowFailureKey,
} from "./lib/automationKeys";
import type {
  AutomationEventStatus,
  AutomationEventType,
  LoanStatus,
} from "./lib/constants";
import { todayUtc } from "./lib/dates";
import {
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  verifySignature,
} from "./lib/signing";

const MAX_BODY_LENGTH = 16 * 1024;

const LOAN_STATUSES: readonly LoanStatus[] = [
  "pending",
  "approved",
  "declined",
  "cancelled",
  "returned",
];
const EVENT_TYPES: readonly AutomationEventType[] = [
  "request_notification",
  "overdue_reminder",
];
const EVENT_STATUSES: readonly AutomationEventStatus[] = ["sent", "failed"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function badRequest(message: string) {
  return json({ error: message }, 400);
}

function isOneOf<T extends string>(
  options: readonly T[],
  value: unknown,
): value is T {
  return options.includes(value as T);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function parseObject(rawBody: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(rawBody);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Wraps every n8n endpoint, so no handler can run on an unverified request.
 * Callers get the same 401 whatever went wrong, and the reason only goes to the
 * server log, so a failed attempt teaches an attacker nothing.
 */
function signedEndpoint(
  handler: (ctx: ActionCtx, rawBody: string) => Promise<Response>,
) {
  return httpAction(async (ctx, request) => {
    const secret = process.env.LENDLOOP_WEBHOOK_SECRET;
    if (!secret) {
      // Fail closed: never accept requests because the secret is unset.
      console.error("LENDLOOP_WEBHOOK_SECRET is not set");
      return json({ error: "Not configured" }, 500);
    }

    const rawBody = await request.text();
    if (rawBody.length > MAX_BODY_LENGTH) {
      return json({ error: "Body too large" }, 413);
    }

    const result = await verifySignature({
      secret,
      timestamp: request.headers.get(TIMESTAMP_HEADER),
      signature: request.headers.get(SIGNATURE_HEADER),
      rawBody,
    });
    if (!result.ok) {
      console.warn(`Rejected n8n request: ${result.reason}`);
      return json({ error: "Invalid signature" }, 401);
    }
    return handler(ctx, rawBody);
  });
}

function outcomeResponse(outcome: string) {
  return outcome === "unknown_loan"
    ? json({ error: "Unknown loan" }, 404)
    : json({ outcome });
}

const http = httpRouter();

http.route({
  path: "/n8n/overdue-loans",
  method: "GET",
  handler: signedEndpoint(async (ctx) => {
    const loans = await ctx.runQuery(internal.automation.listOverdueLoans, {});
    return json({ loans });
  }),
});

http.route({
  path: "/n8n/reminder-status",
  method: "POST",
  handler: signedEndpoint(async (ctx, rawBody) => {
    const body = parseObject(rawBody);
    if (!body) return badRequest("Body must be a JSON object");
    const { loanId, status, detail } = body;
    if (!isNonEmptyString(loanId) || !isOneOf(EVENT_STATUSES, status)) {
      return badRequest("loanId and a valid status are required");
    }

    const key = reminderKey(loanId, todayUtc());
    const outcome = await ctx.runMutation(internal.automation.recordEvent, {
      loanId,
      type: "overdue_reminder",
      status,
      idempotencyKey: status === "sent" ? key : failedKey(key),
      detail: typeof detail === "string" ? detail : undefined,
    });
    return outcomeResponse(outcome);
  }),
});

/** Workflow 1's write-back: tells the app the recipient was notified. */
http.route({
  path: "/n8n/notification-status",
  method: "POST",
  handler: signedEndpoint(async (ctx, rawBody) => {
    const body = parseObject(rawBody);
    if (!body) return badRequest("Body must be a JSON object");
    const { loanId, loanStatus, status, detail } = body;
    if (
      !isNonEmptyString(loanId) ||
      !isOneOf(LOAN_STATUSES, loanStatus) ||
      !isOneOf(EVENT_STATUSES, status)
    ) {
      return badRequest("loanId, loanStatus and a valid status are required");
    }

    const key = notificationKey(loanId, loanStatus);
    const outcome = await ctx.runMutation(internal.automation.recordEvent, {
      loanId,
      type: "request_notification",
      status,
      idempotencyKey: status === "sent" ? key : failedKey(key),
      detail: typeof detail === "string" ? detail : undefined,
    });
    return outcomeResponse(outcome);
  }),
});

/** Called by n8n's Error Workflow, so a failed run is never silent. */
http.route({
  path: "/n8n/automation-failure",
  method: "POST",
  handler: signedEndpoint(async (ctx, rawBody) => {
    const body = parseObject(rawBody);
    if (!body) return badRequest("Body must be a JSON object");
    const { executionId, eventType, workflowName, failedNode, message } = body;
    if (
      !isNonEmptyString(executionId) ||
      !isOneOf(EVENT_TYPES, eventType) ||
      !isNonEmptyString(workflowName)
    ) {
      return badRequest(
        "executionId, a valid eventType and workflowName are required",
      );
    }

    const location = isNonEmptyString(failedNode) ? ` at ${failedNode}` : "";
    const reason = isNonEmptyString(message) ? message : "Unknown error";
    const outcome = await ctx.runMutation(internal.automation.recordEvent, {
      type: eventType,
      status: "failed",
      idempotencyKey: workflowFailureKey(executionId),
      detail: `${workflowName} failed${location}: ${reason}`,
    });
    return outcomeResponse(outcome);
  }),
});

export default http;
