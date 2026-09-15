import { PrivyNodeProvisioningClient } from "../src/adapters/privy/privy-provisioning-client";
import { PrivyPublicStateStore } from "../src/adapters/privy/privy-public-state";
import {
  PrivyProvisioningError,
  provisionPrivyDemoWallet,
  withPrivyProvisioningLock,
} from "../src/application/privy-live-provisioning";
import { readPrivyLiveEnvironment } from "../src/config/privy-live";

const arguments_ = process.argv.slice(2);
const confirmationArgument = arguments_.find((argument) => argument.startsWith("--confirmation-hash="));
const allowed = arguments_.every((argument) => argument === "--apply" || argument.startsWith("--confirmation-hash="));
const confirmationHash = confirmationArgument?.slice("--confirmation-hash=".length) ?? "";

if (!allowed || !arguments_.includes("--apply") || confirmationArgument === undefined || confirmationHash.length !== 66) {
  process.stdout.write(`${JSON.stringify({
    status: "DENIED",
    safeReason: "PRIVY_EXACT_APPLY_CONFIRMATION_REQUIRED",
    remoteMutationsPerformed: false,
    signingPerformed: false,
    broadcastPerformed: false,
    walletFundingPerformed: false,
  }, null, 2)}\n`);
  process.exitCode = 1;
} else {
  try {
    const config = readPrivyLiveEnvironment(process.env);
    const result = await withPrivyProvisioningLock(() => provisionPrivyDemoWallet({
      config,
      confirmationHash,
      client: new PrivyNodeProvisioningClient(config),
      store: new PrivyPublicStateStore(),
    }));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({
      status: "DENIED",
      safeReason: error instanceof PrivyProvisioningError ? error.safeReason : "PRIVY_PROVISIONING_UNAVAILABLE",
      remoteMutationsPerformed: "UNKNOWN",
      signingPerformed: false,
      broadcastPerformed: false,
      walletFundingPerformed: false,
    }, null, 2)}\n`);
    process.exitCode = 1;
  }
}
