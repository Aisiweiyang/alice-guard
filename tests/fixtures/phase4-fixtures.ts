import { SqliteAuditStore } from "../../src/adapters/audit/sqlite-audit-store";
import { runDemoRequest } from "../../src/application/demo-orchestrator";
import { createDemoDependencies, DEMO_SCENARIOS } from "../../src/demo/demo-template";
import type { AgentIntent, TransactionPlan } from "../../src/domain/schemas";

export async function createValidatedDemoPlan(): Promise<{ plan: TransactionPlan; intent: AgentIntent }> {
  const scenario = DEMO_SCENARIOS[0];
  if (!scenario) throw new Error("DEMO_SCENARIO_MISSING");
  const store = new SqliteAuditStore(":memory:");
  try {
    const result = await runDemoRequest(scenario.request, createDemoDependencies(scenario, store));
    if (!result.plan || !result.audit.parsedIntent) throw new Error("VALIDATED_DEMO_PLAN_MISSING");
    return { plan: result.plan, intent: result.audit.parsedIntent };
  } finally {
    store.close();
  }
}
