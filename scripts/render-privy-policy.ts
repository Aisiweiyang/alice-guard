import { compilePrivyPolicy } from "../src/adapters/privy/privy-policy-compiler";
import { DEFAULT_WALLET_POLICY_CONFIG } from "../src/config/wallet-policy";

const compiled = compilePrivyPolicy(DEFAULT_WALLET_POLICY_CONFIG);
process.stdout.write(`${JSON.stringify({
  mode: "offline-policy-render",
  warning: "This is a deterministic policy manifest. No wallet, signing or broadcast capability was used.",
  walletPolicyHash: compiled.walletPolicyHash,
  manifest: compiled.manifest,
  coverage: compiled.coverage,
}, null, 2)}\n`);
