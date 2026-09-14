import { compilePrivyPolicy } from "../src/adapters/privy/privy-policy-compiler";
import { PrivyPolicyManager } from "../src/adapters/privy/privy-policy-manager";
import { loadPrivyReadClients } from "../src/adapters/privy/privy-runtime";
import { DEFAULT_WALLET_POLICY_CONFIG } from "../src/config/wallet-policy";
import { missingPrivyVerificationVariables, readPrivyLiveEnvironment } from "../src/config/privy-live";

const expected = compilePrivyPolicy(DEFAULT_WALLET_POLICY_CONFIG);

try {
  const environment = readPrivyLiveEnvironment(process.env);
  const missingEnvironment = missingPrivyVerificationVariables(environment);
  if (environment.mode !== "privy-verify" || missingEnvironment.length > 0) {
    process.stdout.write(`${JSON.stringify({
      mode: environment.mode,
      status: "NOT_CONFIGURED",
      expectedPolicyHash: expected.walletPolicyHash,
      missingEnvironment,
      safeReason: "PRIVY_WALLET_VERIFICATION_NOT_CONFIGURED",
      signingEnabled: false,
      broadcastEnabled: false,
    }, null, 2)}\n`);
  } else {
    const readers = loadPrivyReadClients(environment);
    const result = await new PrivyPolicyManager(readers.policyReader, readers.walletReader).verifyWalletBinding(
      expected,
      environment.policyId,
      environment.walletId,
      environment.authorizationKeyId,
    );
    process.stdout.write(`${JSON.stringify({
      mode: environment.mode,
      ...result,
      signingEnabled: false,
      broadcastEnabled: false,
    }, null, 2)}\n`);
  }
} catch {
  process.stdout.write(`${JSON.stringify({
    mode: "unknown",
    status: "UNAVAILABLE",
    expectedPolicyHash: expected.walletPolicyHash,
    safeReason: "PRIVY_WALLET_VERIFICATION_UNAVAILABLE",
    signingEnabled: false,
    broadcastEnabled: false,
  }, null, 2)}\n`);
  process.exitCode = 1;
}
