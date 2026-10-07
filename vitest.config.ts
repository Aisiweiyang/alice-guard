import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // The exhaustive replay benchmark is CPU-heavy; avoid oversubscribing Windows.
    maxWorkers: 2,
    include: ["tests/**/*.test.ts"],
    coverage: {
      include: ["src/**/*.ts"],
      reporter: ["text", "json-summary"],
    },
  },
});
