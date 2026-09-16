import { ViemMonadWalletBalanceReader } from "../monad/wallet-balance-reader";
import { LivePrivyJudgeStatusProvider, type WalletBindingVerifier } from "../../application/privy-judge-status";
import type { PrivyLiveEnvironment } from "../../config/privy-live";
import { PrivyPolicyManager } from "./privy-policy-manager";
import { PrivyPublicStateStore } from "./privy-public-state";
import { loadPrivyReadClients } from "./privy-runtime";

export function createLivePrivyJudgeStatusProvider(environment: PrivyLiveEnvironment): LivePrivyJudgeStatusProvider {
  let bindingVerifier: WalletBindingVerifier | null = null;
  if (environment.appId !== null && environment.appSecret !== null) {
    const readers = loadPrivyReadClients(environment);
    bindingVerifier = new PrivyPolicyManager(readers.policyReader, readers.walletReader);
  }
  return new LivePrivyJudgeStatusProvider({
    store: new PrivyPublicStateStore(),
    environment,
    bindingVerifier,
    balanceReader: new ViemMonadWalletBalanceReader(),
  });
}
