/**
 * Finds anything secret-looking in exported n8n workflow JSON. It runs from
 * `npm run check:secrets` and from the test suite, so a workflow exported with
 * a pasted key fails before it can be committed.
 */
const RULES = [
  { name: "Clerk secret key", pattern: /\bsk_(test|live)_[A-Za-z0-9]+/ },
  { name: "Clerk publishable key", pattern: /\bpk_(test|live)_[A-Za-z0-9]+/ },
  { name: "Bearer token", pattern: /\bBearer\s+[A-Za-z0-9._~+/-]{8,}/ },
  { name: "JWT", pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+/ },
  { name: "Long hex string", pattern: /\b[a-fA-F0-9]{32,}\b/ },
  { name: "Long base64 string", pattern: /[A-Za-z0-9+/]{40,}={0,2}/ },
  { name: "Private key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: "Convex deployment URL", pattern: /[a-z0-9-]+\.convex\.(site|cloud)/ },
  {
    name: "Hardcoded secret value",
    pattern:
      /["']?(secret|password|passwd|api[_-]?key|token)["']?\s*[:=]\s*["'][^"'$]{4,}["']/i,
  },
  {
    name: "Real email address",
    pattern: /[A-Za-z0-9._%+-]+@(?!example\.(com|org|net)\b)[A-Za-z0-9-]+\.[A-Za-z]{2,}/,
  },
];

/** Returns one finding per rule match, as `{ rule, line }`. */
export function scanText(text) {
  const findings = [];
  text.split(/\r?\n/).forEach((content, index) => {
    for (const { name, pattern } of RULES) {
      if (pattern.test(content)) {
        findings.push({ rule: name, line: index + 1 });
      }
    }
  });
  return findings;
}

/**
 * Credential references are what n8n exports when a node has a credential
 * attached. They hold no secret, but they tie the file to one instance, and
 * these workflows are meant to ship with none.
 */
export function scanWorkflow(text) {
  const findings = scanText(text);
  const hasCredentials = JSON.parse(text).nodes.some(
    (node) => node.credentials && Object.keys(node.credentials).length > 0,
  );
  if (hasCredentials) {
    findings.push({ rule: "Attached credential reference", line: 0 });
  }
  return findings;
}
