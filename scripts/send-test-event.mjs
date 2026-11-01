/**
 * Local testing aid for the n8n notification webhook. Reads the secret from
 * n8n/.env and sends a request. Run from the repo root:
 *
 *   node scripts/send-test-event.mjs              Signed event for a loan that
 *                                                 doesn't exist. n8n accepts it,
 *                                                 the write-back fails, and the
 *                                                 Error Workflow reports it.
 *   node scripts/send-test-event.mjs --tampered   Body changed after signing, so
 *                                                 n8n must answer 401.
 */
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

const WEBHOOK_URL = "http://localhost:5678/webhook/lendloop-notification";

const envFile = readFileSync("n8n/.env", "utf8");
const secret = /^LENDLOOP_WEBHOOK_SECRET=(.+)$/m.exec(envFile)?.[1]?.trim();
if (!secret) {
  console.error("LENDLOOP_WEBHOOK_SECRET is not set in n8n/.env");
  process.exit(1);
}

const loanId = "test-loan-that-does-not-exist";
const status = "pending";
const body = JSON.stringify({
  eventId: `request_notification:${loanId}:${status}`,
  eventType: "request_notification",
  loanId,
  status,
  recipient: { email: "test@example.com", firstName: "Test" },
  toolName: "Test tool",
  startDate: "2030-01-01",
  endDate: "2030-01-02",
});

const timestamp = Math.floor(Date.now() / 1000);
const signature = createHmac("sha256", secret)
  .update(`${timestamp}.${body}`)
  .digest("hex");
const isTampered = process.argv.includes("--tampered");

const response = await fetch(WEBHOOK_URL, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-LendLoop-Timestamp": String(timestamp),
    "X-LendLoop-Signature": signature,
  },
  body: isTampered ? `${body} ` : body,
});
console.log(`n8n responded with ${response.status}`);
