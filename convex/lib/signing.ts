/**
 * Request signing shared by both directions (Convex -> n8n and n8n -> Convex).
 *
 *   signature = hex(HMAC-SHA256(secret, `${timestamp}.${rawBody}`))
 *
 * Including the timestamp in the signed text means an attacker can't refresh an
 * old request's timestamp without the secret, which is what makes the replay
 * window enforceable. The raw body is signed, not parsed JSON, because
 * re-serializing could reorder keys and change the bytes.
 */
export const TIMESTAMP_HEADER = "X-LendLoop-Timestamp";
export const SIGNATURE_HEADER = "X-LendLoop-Signature";
export const EVENT_ID_HEADER = "X-LendLoop-Event-Id";

export const MAX_SIGNATURE_AGE_SECONDS = 5 * 60;

const encoder = new TextEncoder();

function importKey(secret: string, usage: "sign" | "verify") {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage],
  );
}

export function nowInSeconds(now: number = Date.now()): number {
  return Math.floor(now / 1000);
}

export async function sign(
  secret: string,
  timestamp: number | string,
  rawBody: string,
): Promise<string> {
  const key = await importKey(secret, "sign");
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${timestamp}.${rawBody}`),
  );
  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[0-9a-f]{64}$/i.test(hex)) return null;
  const bytes = new Uint8Array(32);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export type VerifyResult =
  | { ok: true }
  | {
      ok: false;
      reason: "missing_headers" | "bad_timestamp" | "expired" | "bad_signature";
    };

export async function verifySignature({
  secret,
  timestamp,
  signature,
  rawBody,
  now = Date.now(),
}: {
  secret: string;
  timestamp: string | null;
  signature: string | null;
  rawBody: string;
  now?: number;
}): Promise<VerifyResult> {
  if (!timestamp || !signature) {
    return { ok: false, reason: "missing_headers" };
  }
  if (!/^\d+$/.test(timestamp)) {
    return { ok: false, reason: "bad_timestamp" };
  }
  // Both directions: a far-future timestamp would stay replayable for longer.
  const age = Math.abs(nowInSeconds(now) - Number(timestamp));
  if (age > MAX_SIGNATURE_AGE_SECONDS) {
    return { ok: false, reason: "expired" };
  }

  const signatureBytes = hexToBytes(signature);
  if (!signatureBytes) {
    return { ok: false, reason: "bad_signature" };
  }
  // subtle.verify compares in constant time. Comparing two hex strings with
  // === would leak through timing how many leading characters matched.
  const key = await importKey(secret, "verify");
  const isValid = await crypto.subtle.verify(
    "HMAC",
    key,
    signatureBytes,
    encoder.encode(`${timestamp}.${rawBody}`),
  );
  return isValid ? { ok: true } : { ok: false, reason: "bad_signature" };
}
