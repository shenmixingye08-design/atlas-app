import path from "path";
import { defineConfig } from "vitest/config";

/** Dedicated config for Phase 2-4 wall-clock proof (not used by default CI). */
export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/scheduler-core/wall-clock-proof/wall-clock-proof.test.ts"],
    testTimeout: 900_000,
    hookTimeout: 120_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "server-only": path.resolve(__dirname, "lib/test/server-only-stub.ts"),
    },
  },
});
