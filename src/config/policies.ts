import type { Policy } from "../domain/schemas";

export const DEFAULT_DEMO_LIMITS = Object.freeze({
  maxTransactionUsd: "100",
  rollingSpendUsd: "200",
  humanApprovalThresholdUsd: "50",
  maxSlippageBps: 100,
  maxPortfolioAllocationBps: 500,
  maxPriceAgeSeconds: 120,
  maxQuoteAgeSeconds: 20,
});

export interface DemoPolicyOptions {
  policyId: string;
  version: string;
  configHash: string;
  createdAt: string;
  recipient: `0x${string}`;
  contractId: string;
  minimumNativeReserveRaw: string;
}

export function createDemoPolicy(options: DemoPolicyOptions): Policy {
  return {
    policyId: options.policyId,
    version: options.version,
    defaultEffect: "deny",
    configHash: options.configHash,
    createdAt: options.createdAt,
    rules: [
      { ruleId: "chain.monad-testnet", enabled: true, type: "allowed_chain_ids", chainIds: [10143] },
      { ruleId: "action.swap-exact-in", enabled: true, type: "allowed_actions", actions: ["swap_exact_in"] },
      { ruleId: "token.mon-usdc", enabled: true, type: "token_allowlist", assetIds: ["monad-testnet:MON", "monad-testnet:KURU-USDC"] },
      { ruleId: "contract.kuru", enabled: true, type: "contract_allowlist", contractIds: [options.contractId] },
      { ruleId: "recipient.self", enabled: true, type: "recipient_allowlist", recipients: [options.recipient] },
      { ruleId: "limit.transaction-usd", enabled: true, type: "max_transaction_usd", maxUsd: DEFAULT_DEMO_LIMITS.maxTransactionUsd },
      { ruleId: "limit.rolling-usd", enabled: true, type: "rolling_spend_usd", maxUsd: DEFAULT_DEMO_LIMITS.rollingSpendUsd, windowSeconds: 86_400 },
      { ruleId: "approval.transaction-usd", enabled: true, type: "human_approval_threshold_usd", thresholdUsd: DEFAULT_DEMO_LIMITS.humanApprovalThresholdUsd },
      { ruleId: "limit.slippage", enabled: true, type: "max_slippage_bps", maxBps: DEFAULT_DEMO_LIMITS.maxSlippageBps },
      { ruleId: "reserve.native", enabled: true, type: "min_native_reserve", minRaw: options.minimumNativeReserveRaw },
      { ruleId: "limit.mon-allocation", enabled: true, type: "max_portfolio_allocation_bps", assetId: "monad-testnet:MON", maxBps: DEFAULT_DEMO_LIMITS.maxPortfolioAllocationBps },
      { ruleId: "freshness.price", enabled: true, type: "max_data_age_seconds", evidenceKind: "price", maxAgeSeconds: DEFAULT_DEMO_LIMITS.maxPriceAgeSeconds },
      { ruleId: "freshness.quote", enabled: true, type: "max_data_age_seconds", evidenceKind: "quote", maxAgeSeconds: DEFAULT_DEMO_LIMITS.maxQuoteAgeSeconds },
      { ruleId: "risk.high-critical", enabled: true, type: "deny_risk_levels", levels: ["high", "critical"] },
      { ruleId: "calldata.known-only", enabled: true, type: "known_calldata_only", required: true },
    ],
  };
}
