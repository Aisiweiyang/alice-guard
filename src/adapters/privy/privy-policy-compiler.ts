import { erc20ApproveAbi, kuruRouterAbi } from "../kuru/abi";
import { WalletPolicyConfigSchema, type WalletPolicyConfig } from "../../config/wallet-policy";
import { hashCanonical } from "../../domain/hash";
import {
  CompiledWalletPolicySchema,
  PrivyPolicyManifestSchema,
  WalletPolicyCoverageSchema,
  type CompiledWalletPolicy,
  type WalletPolicyCoverage,
} from "./privy-policy-schema";

const CRITICAL_RULES = new Set<WalletPolicyCoverage["rule"]>([
  "chain",
  "contract",
  "selector",
  "token",
  "spender",
  "recipient",
  "amount",
  "native_value",
  "key_export",
  "arbitrary_signing",
]);

function coverage(): WalletPolicyCoverage[] {
  return WalletPolicyCoverageSchema.array().parse([
    { rule: "chain", enforcement: "PRIVY_ENFORCED", detail: "Both allowed calls require ethereum_transaction.chain_id = 10143." },
    { rule: "contract", enforcement: "PRIVY_ENFORCED", detail: "Transaction targets are limited to the pinned USDC token and Kuru router." },
    { rule: "selector", enforcement: "PRIVY_ENFORCED", detail: "Only calldata that decodes against approve or anyToAnySwap can satisfy an allow rule." },
    { rule: "token", enforcement: "PRIVY_ENFORCED", detail: "The approve target and swap debit/credit tokens are pinned." },
    { rule: "spender", enforcement: "PRIVY_ENFORCED", detail: "ERC-20 approve.spender must equal the pinned Kuru router." },
    { rule: "recipient", enforcement: "APP_ONLY", detail: "Kuru credits msg.sender; Plan Guard verifies the fixed function and wallet semantics." },
    { rule: "amount", enforcement: "PRIVY_ENFORCED", detail: "Approve and swap inputs are capped at 100 testnet USDC base units; exact equality remains Plan Guard enforced." },
    { rule: "native_value", enforcement: "PRIVY_ENFORCED", detail: "Both allowed transaction shapes require zero native MON value." },
    { rule: "slippage", enforcement: "APP_ONLY", detail: "The quote-relative minimum output relationship is checked by deterministic Plan Guard." },
    { rule: "usd_limit", enforcement: "APP_ONLY", detail: "Wallet policy caps raw testnet USDC; USD valuation remains evidence-dependent application policy." },
    { rule: "rolling_spend", enforcement: "APP_ONLY", detail: "SQLite reserve/commit/release accounting closes concurrent-request races." },
    { rule: "evidence_freshness", enforcement: "APP_ONLY", detail: "Price, quote, registry, RPC and simulation freshness are checked before the wallet boundary." },
    { rule: "human_approval", enforcement: "APP_ONLY", detail: "Approval binds the canonical plan and expires before wallet authorization." },
    { rule: "key_export", enforcement: "PRIVY_ENFORCED", detail: "No exportPrivateKey rule exists; Privy policy default deny is required." },
    { rule: "arbitrary_signing", enforcement: "PRIVY_ENFORCED", detail: "No message, typed-data, raw signing, 7702 or wildcard method is admitted." },
  ]);
}
function assertCriticalCoverage(entries: readonly WalletPolicyCoverage[]): void {
  for (const rule of CRITICAL_RULES) {
    const entry = entries.find((candidate) => candidate.rule === rule);
    if (!entry || entry.enforcement === "UNSUPPORTED") {
      throw new Error(`WALLET_POLICY_CRITICAL_COVERAGE_MISSING:${rule}`);
    }
  }
}

export function compilePrivyPolicy(unknownConfig: WalletPolicyConfig): CompiledWalletPolicy {
  const config = WalletPolicyConfigSchema.parse(unknownConfig);
  const entries = coverage();
  assertCriticalCoverage(entries);

  const manifest = PrivyPolicyManifestSchema.parse({
    version: "1.0",
    name: config.name,
    chain_type: "ethereum",
    rules: [
      {
        name: "Allow exact Kuru USDC approvals within the raw-token cap",
        method: "eth_sendTransaction",
        action: "ALLOW",
        conditions: [
          { field_source: "ethereum_transaction", field: "chain_id", operator: "eq", value: config.chainId },
          { field_source: "ethereum_transaction", field: "to", operator: "eq", value: config.tokenAddress },
          { field_source: "ethereum_transaction", field: "value", operator: "eq", value: "0" },
          { field_source: "ethereum_calldata", field: "approve.spender", operator: "eq", value: config.routerAddress, abi: erc20ApproveAbi },
          { field_source: "ethereum_calldata", field: "approve.amount", operator: "lte", value: config.maxInputRaw, abi: erc20ApproveAbi },
        ],
      },
      {
        name: "Allow bounded Kuru exact-input USDC to MON swaps",
        method: "eth_sendTransaction",
        action: "ALLOW",
        conditions: [
          { field_source: "ethereum_transaction", field: "chain_id", operator: "eq", value: config.chainId },
          { field_source: "ethereum_transaction", field: "to", operator: "eq", value: config.routerAddress },
          { field_source: "ethereum_transaction", field: "value", operator: "eq", value: "0" },
          { field_source: "ethereum_calldata", field: "anyToAnySwap.marketAddresses", operator: "eq", value: [config.marketAddress], abi: kuruRouterAbi },
          { field_source: "ethereum_calldata", field: "anyToAnySwap.debitToken", operator: "eq", value: config.tokenAddress, abi: kuruRouterAbi },
          { field_source: "ethereum_calldata", field: "anyToAnySwap.creditToken", operator: "eq", value: config.creditTokenAddress, abi: kuruRouterAbi },
          { field_source: "ethereum_calldata", field: "anyToAnySwap.amount", operator: "lte", value: config.maxInputRaw, abi: kuruRouterAbi },
          { field_source: "ethereum_calldata", field: "anyToAnySwap.minAmountOut", operator: "gte", value: "1", abi: kuruRouterAbi },
        ],
      },
    ],
  });

  return CompiledWalletPolicySchema.parse({
    manifest,
    walletPolicyHash: hashCanonical(manifest),
    coverage: entries,
    chainId: config.chainId,
    tokenAddress: config.tokenAddress,
    routerAddress: config.routerAddress,
    marketAddress: config.marketAddress,
    maxInputRaw: config.maxInputRaw,
  });
}
