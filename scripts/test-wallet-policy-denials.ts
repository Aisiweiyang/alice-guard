import { buildPrivyDenialDryRunPlan } from "../src/application/privy-provisioning-plan";

if (process.argv.slice(2).some((argument) => argument !== "--dry-run")) {
  process.stdout.write(`${JSON.stringify({
    mode: "dry-run",
    status: "DENIED",
    safeReason: "PHASE_4B1_LIVE_POLICY_TESTS_DISABLED",
    signingPerformed: false,
    broadcastPerformed: false,
  }, null, 2)}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`${JSON.stringify(buildPrivyDenialDryRunPlan(), null, 2)}\n`);
}
