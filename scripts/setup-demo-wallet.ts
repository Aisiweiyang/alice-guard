import { buildPrivySetupDryRunPlan } from "../src/application/privy-provisioning-plan";
import { readPrivyLiveEnvironment } from "../src/config/privy-live";

const allowedArguments = new Set(["--dry-run"]);
const unsupported = process.argv.slice(2).filter((argument) => !allowedArguments.has(argument));

if (unsupported.length > 0 || process.argv.includes("--apply")) {
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
    const plan = buildPrivySetupDryRunPlan(readPrivyLiveEnvironment(process.env));
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  } catch {
    process.stdout.write(`${JSON.stringify({
      mode: "dry-run",
      status: "INVALID_CONFIGURATION",
      safeReason: "PRIVY_LOCAL_CONFIGURATION_REJECTED",
      remoteMutationsPerformed: false,
      signingPerformed: false,
      broadcastPerformed: false,
    }, null, 2)}\n`);
    process.exitCode = 1;
  }
}
