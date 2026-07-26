import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
    // Heavy measured gates — run via npm run test:reliability-1000
    exclude: [
      "lib/reliability/e2e-1000.test.ts",
      "lib/reliability/x-post-1000.test.ts",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "server-only": path.resolve(__dirname, "lib/test/server-only-stub.ts"),
    },
  },
});
