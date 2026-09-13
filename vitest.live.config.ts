import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["scripts/**/*.live.ts"],
    testTimeout: 45_000,
  },
});
