import { buildPrivyRevokeDryRunPlan } from "../src/application/privy-provisioning-plan";
import { PrivyPublicStateStore } from "../src/adapters/privy/privy-public-state";

if (process.argv.slice(2).some((argument) => argument !== "--dry-run")) {
  process.stdout.write(`${JSON.stringify({
    mode: "dry-run",
    status: "DENIED",
    safeReason: "PHASE_4B1_EXTERNAL_MUTATION_DISABLED",
    remoteMutationsPerformed: false,
    signingPerformed: false,
    broadcastPerformed: false,
  }, null, 2)}\n`);
  process.exitCode = 1;
} else {
  try {
    const state = await new PrivyPublicStateStore().read();
    process.stdout.write(`${JSON.stringify(buildPrivyRevokeDryRunPlan(state), null, 2)}\n`);
  } catch {
    process.stdout.write(`${JSON.stringify({
      mode: "dry-run",
      status: "UNAVAILABLE",
      safeReason: "PRIVY_PUBLIC_STATE_UNAVAILABLE",
      remoteMutationsPerformed: false,
      signingPerformed: false,
      broadcastPerformed: false,
    }, null, 2)}\n`);
    process.exitCode = 1;
  }
}
