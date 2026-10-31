import { describe, expect, it } from "vitest";
import {
  MAX_SIGNATURE_AGE_SECONDS,
  nowInSeconds,
  sign,
  verifySignature,
} from "./lib/signing";

const SECRET = "test-secret";
const BODY = '{"loanId":"abc"}';
const NOW = Date.UTC(2030, 0, 1);

async function verifyWith(
  overrides: Partial<Parameters<typeof verifySignature>[0]> = {},
) {
  const timestamp = String(nowInSeconds(NOW));
  return verifySignature({
    secret: SECRET,
    timestamp,
    signature: await sign(SECRET, timestamp, BODY),
    rawBody: BODY,
    now: NOW,
    ...overrides,
  });
}

describe("sign", () => {
  it("matches a signature computed with Node's crypto, which n8n uses", async () => {
    // createHmac("sha256", "test-secret").update('1700000000.{"a":1}').digest("hex")
    expect(await sign("test-secret", 1700000000, '{"a":1}')).toBe(
      "8cb2c3355fca388e9ac2caec004f4d5d7045d74937ab5faad61dc11682247a9f",
    );
  });

  it("changes when the timestamp or the body changes", async () => {
    const original = await sign(SECRET, 100, BODY);
    expect(await sign(SECRET, 101, BODY)).not.toBe(original);
    expect(await sign(SECRET, 100, `${BODY} `)).not.toBe(original);
  });
});

describe("verifySignature", () => {
  it("accepts a correctly signed request", async () => {
    expect(await verifyWith()).toEqual({ ok: true });
  });

  it("accepts an uppercase hex signature", async () => {
    const timestamp = String(nowInSeconds(NOW));
    const signature = (await sign(SECRET, timestamp, BODY)).toUpperCase();
    expect(await verifyWith({ timestamp, signature })).toEqual({ ok: true });
  });

  it("rejects a tampered body", async () => {
    expect(await verifyWith({ rawBody: '{"loanId":"xyz"}' })).toEqual({
      ok: false,
      reason: "bad_signature",
    });
  });

  it("rejects a signature made with another secret", async () => {
    const timestamp = String(nowInSeconds(NOW));
    expect(
      await verifyWith({ signature: await sign("wrong", timestamp, BODY) }),
    ).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects a refreshed timestamp on an old signature", async () => {
    const oldTimestamp = nowInSeconds(NOW) - 1000;
    expect(
      await verifyWith({ signature: await sign(SECRET, oldTimestamp, BODY) }),
    ).toEqual({ ok: false, reason: "bad_signature" });
  });

  it.each([
    ["just inside the window", -MAX_SIGNATURE_AGE_SECONDS, true],
    ["just outside the window", -MAX_SIGNATURE_AGE_SECONDS - 1, false],
    ["too far in the future", MAX_SIGNATURE_AGE_SECONDS + 1, false],
  ])("handles a timestamp %s", async (_label, offset, shouldPass) => {
    const timestamp = String(nowInSeconds(NOW) + offset);
    const result = await verifyWith({
      timestamp,
      signature: await sign(SECRET, timestamp, BODY),
    });
    expect(result).toEqual(
      shouldPass ? { ok: true } : { ok: false, reason: "expired" },
    );
  });

  it.each([
    ["no timestamp", { timestamp: null }, "missing_headers"],
    ["no signature", { signature: null }, "missing_headers"],
    ["a non-numeric timestamp", { timestamp: "soon" }, "bad_timestamp"],
    ["a short signature", { signature: "abc123" }, "bad_signature"],
    ["a non-hex signature", { signature: "z".repeat(64) }, "bad_signature"],
  ])("rejects %s", async (_label, overrides, reason) => {
    expect(await verifyWith(overrides)).toEqual({ ok: false, reason });
  });
});
