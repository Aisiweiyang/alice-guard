import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { SqliteExecutionNonceStore } from "../../src/adapters/audit/sqlite-execution-nonce-store";

const NONCE = "00000000-abcd-4000-8000-000000000001";

describe("durable execution nonce store", () => {
  it("provides nonconsuming lookup, consumes once, and fails closed for malformed nonces", () => {
    const store = new SqliteExecutionNonceStore(":memory:");
    try {
      expect(store.has(NONCE)).toBe(false);
      expect(store.isConsumed(NONCE)).toBe(false);
      expect(store.consume(NONCE)).toBe(true);
      expect(store.has(NONCE)).toBe(true);
      expect(store.consume(NONCE.toUpperCase())).toBe(false);
      expect(store.consume("invalid")).toBe(false);
      expect(store.has("invalid")).toBe(true);
    } finally {
      store.close();
    }
  });

  it("shares spent nonces across connections and retains them after restart", () => {
    const directory = mkdtempSync(join(tmpdir(), "alice-nonce-restart-"));
    const path = join(directory, "nonces.sqlite");
    try {
      const first = new SqliteExecutionNonceStore(path);
      const second = new SqliteExecutionNonceStore(path);
      try {
        expect(first.consume(NONCE)).toBe(true);
        expect(second.consume(NONCE)).toBe(false);
        expect(second.has(NONCE)).toBe(true);
      } finally {
        first.close();
        second.close();
      }
      const restarted = new SqliteExecutionNonceStore(path);
      try {
        expect(restarted.has(NONCE)).toBe(true);
        expect(restarted.consume(NONCE)).toBe(false);
      } finally {
        restarted.close();
      }
    } finally {
      rmSync(directory, { recursive: true });
    }
  });
});
