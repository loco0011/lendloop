import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { scanWorkflow } from "./scanWorkflowSecrets.mjs";

const WORKFLOW_DIR = "n8n/workflows";
const files = readdirSync(WORKFLOW_DIR).filter((file) => file.endsWith(".json"));

let findingCount = 0;
for (const file of files) {
  const path = join(WORKFLOW_DIR, file);
  for (const { rule, line } of scanWorkflow(readFileSync(path, "utf8"))) {
    // Prints the location only, so the secret doesn't end up in CI logs too.
    console.error(`${path}:${line} ${rule}`);
    findingCount++;
  }
}

if (findingCount > 0) {
  console.error(`Found ${findingCount} secret-looking value(s).`);
  process.exit(1);
}
console.log(`No secrets found in ${files.length} workflow file(s).`);
