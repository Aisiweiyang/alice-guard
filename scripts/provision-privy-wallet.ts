import { PrivyNodeProvisioningClient } from "../src/adapters/privy/privy-provisioning-client";
import { PrivyPublicStateStore } from "../src/adapters/privy/privy-public-state";
import {
  PrivyProvisioningError,
  provisionPrivyDemoWallet,
  withPrivyProvisioningLock,
} from "../src/application/privy-live-provisioning";
import { parsePrivyProvisioningArguments } from "../src/application/privy-provisioning-arguments";
import { readPrivyLiveEnvironment } from "../src/config/privy-live";

const parsedArguments = parsePrivyProvisioningArguments(process.argv.slice(2));

if (!parsedArguments.allowed) {
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
      confirmationHash: parsedArguments.confirmationHash,
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
