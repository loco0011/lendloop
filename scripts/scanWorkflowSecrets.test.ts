// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scanText, scanWorkflow } from "./scanWorkflowSecrets.mjs";

const WORKFLOW_DIR = "n8n/workflows";

describe("exported workflows", () => {
  const files = readdirSync(WORKFLOW_DIR).filter((f) => f.endsWith(".json"));

  it("includes all three workflows", () => {
    expect(files).toHaveLength(3);
  });

  it.each(files)("%s contains nothing secret-looking", (file) => {
    const text = readFileSync(join(WORKFLOW_DIR, file), "utf8");
    expect(scanWorkflow(text)).toEqual([]);
  });

  it.each(files)("%s reads the HMAC secret only from the environment", (file) => {
    const text = readFileSync(join(WORKFLOW_DIR, file), "utf8");
    expect(text).toContain("$env.LENDLOOP_WEBHOOK_SECRET");
  });
});

describe("scanText", () => {
  it.each([
    ["Clerk secret key", '"sk_test_abc123"'],
    ["Long hex string", `"${"ab12".repeat(16)}"`],
    ["JWT", '"eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc"'],
    ["Bearer token", '"Authorization": "Bearer abcdefgh12345"'],
    ["Hardcoded secret value", '"secret": "hunter2hunter2"'],
    ["Hardcoded secret value", "const secret = 'hunter2hunter2';"],
    ["Convex deployment URL", '"https://happy-otter-123.convex.site/n8n"'],
    ["Real email address", '"sam@gmail.com"'],
  ])("flags a %s", (rule, line) => {
    expect(scanText(line).map((finding) => finding.rule)).toContain(rule);
  });

  it.each([
    "const secret = $env.LENDLOOP_WEBHOOK_SECRET;",
    '"={{ $env.LENDLOOP_CONVEX_SITE_URL }}/n8n/overdue-loans"',
    '"fromEmail": "lendloop@example.com"',
  ])("allows %s", (line) => {
    expect(scanText(line)).toEqual([]);
  });

  it("flags an attached credential", () => {
    const workflow = JSON.stringify({
      nodes: [{ credentials: { smtp: { id: "1", name: "Mail" } } }],
    });
    expect(scanWorkflow(workflow).map((finding) => finding.rule)).toEqual([
      "Attached credential reference",
    ]);
  });
});
