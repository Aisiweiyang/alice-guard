import { describe, expect, it } from "vitest";

import { SqliteAuditStore } from "../../src/adapters/audit/sqlite-audit-store";
import { runDemoRequest } from "../../src/application/demo-orchestrator";
import { createDemoDependencies, DEMO_SCENARIOS } from "../../src/demo/demo-template";

describe("append-only SQLite audit store", () => {
  it("hash-chains multiple independently validated records", async () => {
    const store = new SqliteAuditStore(":memory:");
    try {
      const first = await runDemoRequest(DEMO_SCENARIOS[0]!.request, createDemoDependencies(DEMO_SCENARIOS[0]!, store));
      const second = await runDemoRequest(DEMO_SCENARIOS[1]!.request, createDemoDependencies(DEMO_SCENARIOS[1]!, store));
      const records = store.list();
      expect(records).toHaveLength(2);
      expect(store.count()).toBe(2);
      expect(first.audit.previousRecordHash).toBeNull();
      expect(second.audit.previousRecordHash).toBe(first.audit.recordHash);
      expect(store.verifyChain()).toBe(true);
    } finally {
      store.close();
    }
  });

  it("rejects a duplicate request instead of overwriting its audit", async () => {
    const store = new SqliteAuditStore(":memory:");
    const scenario = DEMO_SCENARIOS[0]!;
    try {
      await runDemoRequest(scenario.request, createDemoDependencies(scenario, store));
      await expect(runDemoRequest(scenario.request, createDemoDependencies(scenario, store))).rejects.toThrow();
      expect(store.list()).toHaveLength(1);
      expect(store.count()).toBe(1);
      expect(store.verifyChain()).toBe(true);
    } finally {
      store.close();
    }
  });
});
