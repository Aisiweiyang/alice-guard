import { SqliteAuditStore } from "../adapters/audit/sqlite-audit-store";
import { runDemoRequest } from "../application/demo-orchestrator";
import { createDemoDependencies, DEMO_SCENARIOS, type DemoScenario } from "./demo-template";

/** Synthetic positive control. No network, credentials, or wallet adapter. */
export async function createDemoProofFixture(amountIn = "20", maxSlippageBps = 100) {
  const base = DEMO_SCENARIOS[0]!;
  const scenario: DemoScenario = {...base,
    request: {...base.request, text: `Swap ${amountIn} USDC to MON. Do not trade above ${maxSlippageBps / 100}% slippage.`},
    proposal: {kind: "swap_exact_in", amountIn, maxSlippageBps}};
  const store = new SqliteAuditStore(":memory:");
  try {
    const result = await runDemoRequest(scenario.request, createDemoDependencies(scenario, store));
    if (!result.proof) throw new Error("PROOF_FIXTURE_UNAVAILABLE");
    return structuredClone({candidate: result.proof.candidate, trusted: result.proof.trusted, options: result.proof.options});
  } finally { store.close(); }
}
