import { compilePrivyPolicy } from "../src/adapters/privy/privy-policy-compiler";
import { verifyPrivyPolicy } from "../src/adapters/privy/privy-policy-verifier";
import {
  hasCompletePrivyVerificationCredentials,
  loadPrivyPolicyReader,
  readPrivyVerificationEnvironment,
} from "../src/adapters/privy/privy-runtime";
import { DEFAULT_WALLET_POLICY_CONFIG } from "../src/config/wallet-policy";

const expected = compilePrivyPolicy(DEFAULT_WALLET_POLICY_CONFIG);
const environment = readPrivyVerificationEnvironment(process.env);
let result;
if (!hasCompletePrivyVerificationCredentials(environment)) {
  result = await verifyPrivyPolicy(expected, null, null);
} else {
  try {
    const reader = await loadPrivyPolicyReader(environment);
    result = await verifyPrivyPolicy(expected, reader, environment.policyId);
  } catch {
    result = {
      status: "UNAVAILABLE" as const,
      expectedHash: expected.walletPolicyHash,
      observedHash: null,
      safeReason: "PRIVY_POLICY_UNAVAILABLE",
    };
  }
}

process.stdout.write(`${JSON.stringify({
  mode: environment.mode,
  ...result,
  signingEnabled: false,
  broadcastEnabled: false,
}, null, 2)}\n`);
