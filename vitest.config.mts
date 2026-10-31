import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Matches the runtime Convex functions run in, rather than Node.
    environment: "edge-runtime",
    include: ["convex/**/*.test.ts", "scripts/**/*.test.ts"],
    server: { deps: { inline: ["convex-test"] } },
  },
});
