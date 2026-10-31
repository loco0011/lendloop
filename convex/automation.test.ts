import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { retryDelayMs } from "./automation";
import { todayUtc } from "./lib/dates";
import {
  EVENT_ID_HEADER,
  nowInSeconds,
  SIGNATURE_HEADER,
  sign,
  TIMESTAMP_HEADER,
  verifySignature,
} from "./lib/signing";
import {
  insertLoan,
  setup,
  signIn,
  validTool,
  type TestConvex,
} from "./test.setup";

const SECRET = "test-secret";
const WEBHOOK_URL = "https://n8n.test/webhook/lendloop";
const OVERDUE = { startDate: "2020-01-01", endDate: "2020-01-05" };

function events(t: TestConvex) {
  return t.run((ctx) => ctx.db.query("automationEvents").collect());
}

async function parties(t: TestConvex) {
  const lender = await signIn(t, "alice");
  const borrower = await signIn(t, "bob");
  const toolId = await lender.asUser.mutation(api.tools.create, validTool);
  return { lender, borrower, toolId };
}

function runScheduled(t: TestConvex) {
  return t.finishAllScheduledFunctions(vi.runAllTimers);
}

/** Calls a signed endpoint the way n8n does. */
async function signedFetch(
  t: TestConvex,
  path: string,
  { method = "POST", body = "" }: { method?: string; body?: string } = {},
) {
  const timestamp = nowInSeconds();
  return t.fetch(path, {
    method,
    headers: {
      [TIMESTAMP_HEADER]: String(timestamp),
      [SIGNATURE_HEADER]: await sign(SECRET, timestamp, body),
    },
    ...(method === "GET" ? {} : { body }),
  });
}

beforeEach(() => {
  vi.stubEnv("LENDLOOP_WEBHOOK_SECRET", SECRET);
  vi.stubEnv("N8N_WEBHOOK_URL", WEBHOOK_URL);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("outbound notifications", () => {
  function mockFetch(...statuses: number[]) {
    const fetchMock = vi.fn(async () => {
      return new Response(null, { status: statuses.shift() ?? 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock as unknown as {
      mock: { calls: [string, RequestInit][] };
    };
  }

  async function requestLoan(t: TestConvex) {
    const { lender, borrower, toolId } = await parties(t);
    const loanId = await borrower.asUser.mutation(api.loans.request, {
      toolId,
      startDate: "2030-01-01",
      endDate: "2030-01-05",
    });
    return { lender, borrower, toolId, loanId };
  }

  it("sends only the agreed fields, to the lender, for a new request", async () => {
    const fetchMock = mockFetch(200);
    const t = setup();
    const { loanId } = await requestLoan(t);

    await runScheduled(t);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(WEBHOOK_URL);
    const eventId = `request_notification:${loanId}:pending`;
    expect(JSON.parse(init.body as string)).toEqual({
      eventId,
      eventType: "request_notification",
      loanId,
      status: "pending",
      recipient: { email: "alice@example.com", firstName: "alice" },
      toolName: validTool.name,
      startDate: "2030-01-01",
      endDate: "2030-01-05",
    });
    expect((init.headers as Record<string, string>)[EVENT_ID_HEADER]).toBe(
      eventId,
    );
    // Neither the other party's email nor the tool description.
    expect(init.body).not.toContain("bob@example.com");
    expect(init.body).not.toContain(validTool.description);
  });

  it("signs the exact body it sends", async () => {
    const fetchMock = mockFetch(200);
    const t = setup();
    await requestLoan(t);

    await runScheduled(t);

    const [, init] = fetchMock.mock.calls[0];
    const headers = init.headers as Record<string, string>;
    expect(
      await verifySignature({
        secret: SECRET,
        timestamp: headers[TIMESTAMP_HEADER],
        signature: headers[SIGNATURE_HEADER],
        rawBody: init.body as string,
      }),
    ).toEqual({ ok: true });
  });

  it("notifies the borrower when the lender approves", async () => {
    const fetchMock = mockFetch(200, 200);
    const t = setup();
    const { lender, loanId } = await requestLoan(t);
    await runScheduled(t);

    await lender.asUser.mutation(api.loans.approve, { loanId });
    await runScheduled(t);

    const body = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(body.status).toBe("approved");
    expect(body.recipient.email).toBe("bob@example.com");
  });

  it("schedules nothing when the mutation fails", async () => {
    const fetchMock = mockFetch();
    const t = setup();
    const { borrower, toolId } = await parties(t);

    await expect(
      borrower.asUser.mutation(api.loans.request, {
        toolId,
        startDate: "2030-01-05",
        endDate: "2030-01-01",
      }),
    ).rejects.toThrow();
    await runScheduled(t);

    expect(fetchMock.mock.calls).toHaveLength(0);
  });

  it("retries and records nothing when a later attempt succeeds", async () => {
    const fetchMock = mockFetch(500, 200);
    const t = setup();
    await requestLoan(t);

    await runScheduled(t);

    expect(fetchMock.mock.calls).toHaveLength(2);
    expect(await events(t)).toEqual([]);
  });

  it("records one failed event after three failed attempts", async () => {
    const fetchMock = mockFetch(500, 500, 500);
    const t = setup();
    const { loanId } = await requestLoan(t);

    await runScheduled(t);

    expect(fetchMock.mock.calls).toHaveLength(3);
    const recorded = await events(t);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      loanId,
      type: "request_notification",
      status: "failed",
      idempotencyKey: `request_notification:${loanId}:pending:failed`,
      detail: "Gave up after 3 attempts: n8n responded with 500",
    });
  });

  it("treats a network error like any other failed attempt", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("connection refused");
    });
    vi.stubGlobal("fetch", fetchMock);
    const t = setup();
    await requestLoan(t);

    await runScheduled(t);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect((await events(t))[0].detail).toContain("connection refused");
  });

  it("records a failure instead of throwing when unconfigured", async () => {
    vi.stubEnv("N8N_WEBHOOK_URL", "");
    const fetchMock = mockFetch();
    const t = setup();
    await requestLoan(t);

    await runScheduled(t);

    expect(fetchMock.mock.calls).toHaveLength(0);
    expect((await events(t))[0].detail).toContain("N8N_WEBHOOK_URL");
  });

  it("backs off exponentially", () => {
    expect(retryDelayMs(1)).toBe(15_000);
    expect(retryDelayMs(2)).toBe(30_000);
  });
});

describe("inbound signature checks", () => {
  const ENDPOINTS = [
    ["GET", "/n8n/overdue-loans"],
    ["POST", "/n8n/reminder-status"],
    ["POST", "/n8n/notification-status"],
    ["POST", "/n8n/automation-failure"],
  ] as const;

  describe.each(ENDPOINTS)("%s %s", (method, path) => {
    it("rejects a request with no signature", async () => {
      const t = setup();
      const response = await t.fetch(path, { method });
      expect(response.status).toBe(401);
    });

    it("rejects a wrong signature", async () => {
      const t = setup();
      const response = await t.fetch(path, {
        method,
        headers: {
          [TIMESTAMP_HEADER]: String(nowInSeconds()),
          [SIGNATURE_HEADER]: "0".repeat(64),
        },
      });
      expect(response.status).toBe(401);
    });

    it("rejects a replay from outside the window", async () => {
      const t = setup();
      const timestamp = nowInSeconds() - 301;
      const response = await t.fetch(path, {
        method,
        headers: {
          [TIMESTAMP_HEADER]: String(timestamp),
          [SIGNATURE_HEADER]: await sign(SECRET, timestamp, ""),
        },
      });
      expect(response.status).toBe(401);
    });

    it("fails closed when the secret is not configured", async () => {
      vi.stubEnv("LENDLOOP_WEBHOOK_SECRET", "");
      const t = setup();
      const response = await signedFetch(t, path, { method });
      expect(response.status).toBe(500);
    });
  });

  it("writes nothing for a rejected request", async () => {
    const t = setup();
    const { lender, borrower, toolId } = await parties(t);
    const loanId = await insertLoan(t, toolId, lender.userId, borrower.userId);

    await t.fetch("/n8n/reminder-status", {
      method: "POST",
      headers: {
        [TIMESTAMP_HEADER]: String(nowInSeconds()),
        [SIGNATURE_HEADER]: "0".repeat(64),
      },
      body: JSON.stringify({ loanId, status: "sent" }),
    });

    expect(await events(t)).toEqual([]);
  });
});

describe("GET /n8n/overdue-loans", () => {
  async function fetchOverdue(t: TestConvex) {
    const response = await signedFetch(t, "/n8n/overdue-loans", {
      method: "GET",
    });
    expect(response.status).toBe(200);
    return (await response.json()) as { loans: { loanId: string }[] };
  }

  it("returns only the agreed fields for an overdue loan", async () => {
    const t = setup();
    const { lender, borrower, toolId } = await parties(t);
    const loanId = await insertLoan(t, toolId, lender.userId, borrower.userId, {
      ...OVERDUE,
      status: "approved",
    });

    expect((await fetchOverdue(t)).loans).toEqual([
      {
        loanId,
        borrowerFirstName: "bob",
        borrowerEmail: "bob@example.com",
        toolName: validTool.name,
        dueDate: OVERDUE.endDate,
      },
    ]);
  });

  it("excludes loans that are not overdue", async () => {
    const t = setup();
    const { lender, borrower, toolId } = await parties(t);
    const today = todayUtc();
    for (const fields of [
      { status: "approved", startDate: today, endDate: today }, // due today
      { status: "approved", startDate: "2030-01-01", endDate: "2030-01-05" },
      { status: "pending", ...OVERDUE },
      { status: "returned", ...OVERDUE },
      { status: "declined", ...OVERDUE },
    ] as const) {
      await insertLoan(t, toolId, lender.userId, borrower.userId, fields);
    }

    expect((await fetchOverdue(t)).loans).toEqual([]);
  });

  it("leaves out a loan already reminded today, so re-runs don't re-send", async () => {
    const t = setup();
    const { lender, borrower, toolId } = await parties(t);
    const loanId = await insertLoan(t, toolId, lender.userId, borrower.userId, {
      ...OVERDUE,
      status: "approved",
    });
    await signedFetch(t, "/n8n/reminder-status", {
      body: JSON.stringify({ loanId, status: "sent" }),
    });

    expect((await fetchOverdue(t)).loans).toEqual([]);
  });
});

describe("POST /n8n/reminder-status", () => {
  async function overdueLoan(t: TestConvex): Promise<Id<"loans">> {
    const { lender, borrower, toolId } = await parties(t);
    return insertLoan(t, toolId, lender.userId, borrower.userId, {
      ...OVERDUE,
      status: "approved",
    });
  }

  function postStatus(t: TestConvex, body: unknown) {
    return signedFetch(t, "/n8n/reminder-status", {
      body: JSON.stringify(body),
    });
  }

  it("records one event with the day-scoped idempotency key", async () => {
    const t = setup();
    const loanId = await overdueLoan(t);

    const response = await postStatus(t, { loanId, status: "sent" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ outcome: "recorded" });
    const recorded = await events(t);
    expect(recorded).toHaveLength(1);
    expect(recorded[0].idempotencyKey).toBe(
      `overdue_reminder:${loanId}:${todayUtc()}`,
    );
  });

  it("returns 200 and writes nothing on a repeat delivery", async () => {
    const t = setup();
    const loanId = await overdueLoan(t);
    await postStatus(t, { loanId, status: "sent" });

    const retry = await postStatus(t, { loanId, status: "sent" });

    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual({ outcome: "duplicate" });
    expect(await events(t)).toHaveLength(1);
  });

  it("creates a new record on a later day", async () => {
    const t = setup();
    const loanId = await overdueLoan(t);
    await postStatus(t, { loanId, status: "sent" });

    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    await postStatus(t, { loanId, status: "sent" });

    expect(await events(t)).toHaveLength(2);
  });

  it("lets a success follow a recorded failure on the same day", async () => {
    const t = setup();
    const loanId = await overdueLoan(t);
    await postStatus(t, { loanId, status: "failed", detail: "SMTP down" });

    await postStatus(t, { loanId, status: "sent" });

    const statuses = (await events(t)).map((event) => event.status);
    expect(statuses).toEqual(["failed", "sent"]);
  });

  it.each([
    ["invalid JSON", "{nope"],
    ["a JSON array", "[]"],
    ["a missing loanId", JSON.stringify({ status: "sent" })],
    ["an invalid status", JSON.stringify({ loanId: "x", status: "done" })],
  ])("returns 400 for %s", async (_label, body) => {
    const t = setup();
    const response = await signedFetch(t, "/n8n/reminder-status", { body });
    expect(response.status).toBe(400);
  });

  it("returns 404 for an id that is not a loan", async () => {
    const t = setup();
    const response = await postStatus(t, {
      loanId: "not-a-real-id",
      status: "sent",
    });
    expect(response.status).toBe(404);
  });

  it("rejects an oversized body", async () => {
    const t = setup();
    const response = await signedFetch(t, "/n8n/reminder-status", {
      body: "x".repeat(16 * 1024 + 1),
    });
    expect(response.status).toBe(413);
  });
});

describe("POST /n8n/notification-status", () => {
  it("records the write-back once, however many times it is delivered", async () => {
    const t = setup();
    const { lender, borrower, toolId } = await parties(t);
    const loanId = await insertLoan(t, toolId, lender.userId, borrower.userId);
    const body = JSON.stringify({
      loanId,
      loanStatus: "pending",
      status: "sent",
    });

    await signedFetch(t, "/n8n/notification-status", { body });
    const retry = await signedFetch(t, "/n8n/notification-status", { body });

    expect(retry.status).toBe(200);
    const recorded = await events(t);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      loanId,
      type: "request_notification",
      status: "sent",
      idempotencyKey: `request_notification:${loanId}:pending`,
    });
  });

  it("returns 400 for an unknown loan status", async () => {
    const t = setup();
    const response = await signedFetch(t, "/n8n/notification-status", {
      body: JSON.stringify({ loanId: "x", loanStatus: "lost", status: "sent" }),
    });
    expect(response.status).toBe(400);
  });
});

describe("POST /n8n/automation-failure", () => {
  const failure = {
    executionId: "1234",
    eventType: "overdue_reminder",
    workflowName: "LendLoop overdue reminders",
    failedNode: "Fetch overdue loans",
    message: "connect ECONNREFUSED",
  };

  it("records a failure that has no loan, once per execution", async () => {
    const t = setup();
    const body = JSON.stringify(failure);

    await signedFetch(t, "/n8n/automation-failure", { body });
    const retry = await signedFetch(t, "/n8n/automation-failure", { body });

    expect(retry.status).toBe(200);
    const recorded = await events(t);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      type: "overdue_reminder",
      status: "failed",
      idempotencyKey: "automation_failure:1234",
      detail:
        "LendLoop overdue reminders failed at Fetch overdue loans: connect ECONNREFUSED",
    });
    expect(recorded[0].loanId).toBeUndefined();
  });

  it("limits how much failure text is stored", async () => {
    const t = setup();
    await signedFetch(t, "/n8n/automation-failure", {
      body: JSON.stringify({ ...failure, message: "x".repeat(2000) }),
    });
    expect((await events(t))[0].detail).toHaveLength(500);
  });

  it("returns 400 for an invalid event type", async () => {
    const t = setup();
    const response = await signedFetch(t, "/n8n/automation-failure", {
      body: JSON.stringify({ ...failure, eventType: "other" }),
    });
    expect(response.status).toBe(400);
  });
});
