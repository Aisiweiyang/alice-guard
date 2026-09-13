import { describe, expect, it } from "vitest";

import { SqliteAuditStore } from "../../src/adapters/audit/sqlite-audit-store";
import { runDemoRequest } from "../../src/application/demo-orchestrator";
import { createDemoDependencies, DEMO_SCENARIOS } from "../../src/demo/demo-template";

async function run(index: number) {
  const store = new SqliteAuditStore(":memory:");
  const scenario = DEMO_SCENARIOS[index]!;
  const dependencies = createDemoDependencies(scenario, store);
  try {
    const result = await runDemoRequest(scenario.request, dependencies);
    return { result, records: store.list(), valid: store.verifyChain() };
  } finally {
    store.close();
  }
}

describe("hackathon demo orchestration", () => {
  it("prepares the bounded swap without signing or execution", async () => {
    const { result, records, valid } = await run(0);
    expect(result.status).toBe("prepared");
    expect(result.plan?.status).toBe("validated");
    expect(result.plan?.transactions).toHaveLength(2);
    expect(result.audit.execution).toBeNull();
    expect(records).toHaveLength(1);
    expect(valid).toBe(true);
  });

  it("denies the over-limit request before transaction planning", async () => {
    const { result } = await run(1);
    expect(result.status).toBe("denied");
    expect(result.stage).toBe("policy");
    expect(result.reasonCodes).toContain("MAX_TRANSACTION_USD_EXCEEDED");
    expect(result.plan).toBeNull();
    expect(result.audit.transactionPlan).toBeNull();
  });

  it("denies policy-manipulation prompt injection before evidence collection", async () => {
    const store = new SqliteAuditStore(":memory:");
    const scenario = DEMO_SCENARIOS[2]!;
    const dependencies = createDemoDependencies(scenario, store);
    let evidenceCalled = false;
    dependencies.evidenceProvider = {
      id: "must-not-run",
      collect: async () => {
        evidenceCalled = true;
        throw new Error("must not run");
      },
    };
    try {
      const result = await runDemoRequest(scenario.request, dependencies);
      expect(result.status).toBe("denied");
      expect(result.stage).toBe("intent");
      expect(result.reasonCodes).toContain("MODEL_REJECTED");
      expect(evidenceCalled).toBe(false);
      expect(result.audit.evidence).toEqual([]);
    } finally {
      store.close();
    }
  });
});
