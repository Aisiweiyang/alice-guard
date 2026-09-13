import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { SqliteAuditStore } from "../src/adapters/audit/sqlite-audit-store";
import { runDemoRequest } from "../src/application/demo-orchestrator";
import { createDemoDependencies, DEMO_SCENARIOS } from "../src/demo/demo-template";

const runId = new Date().toISOString().replace(/[:.]/g, "-");
const outputDirectory = resolve("demo-output", runId);
mkdirSync(outputDirectory, { recursive: true });
const databasePath = resolve(outputDirectory, "alice-guard-audit.sqlite");
const store = new SqliteAuditStore(databasePath);

try {
  const summaries = [];
  for (const scenario of DEMO_SCENARIOS) {
    const result = await runDemoRequest(scenario.request, createDemoDependencies(scenario, store));
    summaries.push({
      scenario: scenario.name,
      title: scenario.title,
      input: scenario.request.text,
      status: result.status,
      stoppedAt: result.stage,
      risk: result.riskAssessment === null ? null : {
        score: result.riskAssessment.score,
        level: result.riskAssessment.level,
      },
      policyDecision: result.policyEvaluation?.decision.decision ?? null,
      reasonCodes: result.reasonCodes,
      planHash: result.plan?.planHash ?? null,
      transactionCount: result.plan?.transactions.length ?? 0,
      auditHash: result.audit.recordHash,
      previousAuditHash: result.audit.previousRecordHash,
      execution: "not_attempted",
    });
  }

  const output = JSON.stringify({
    mode: "offline-demo-no-wallet",
    warning: "Fixtures prove deterministic control flow only; they are not live market evidence or chain simulation.",
    auditDatabase: databasePath,
    auditChainValid: store.verifyChain(),
    scenarios: summaries,
  }, null, 2);
  writeFileSync(resolve(outputDirectory, "demo-summary.json"), `${output}\n`, { encoding: "utf8", flag: "wx" });
  process.stdout.write(`${output}\n`);
} finally {
  store.close();
}
