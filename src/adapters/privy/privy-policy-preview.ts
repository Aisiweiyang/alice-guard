import { decodeFunctionData, type Address, type Hex } from "viem";
import { z } from "zod";

import { EvmAddressSchema, HexDataSchema, UintStringSchema } from "../../domain/schemas";
import { erc20ApproveAbi, kuruRouterAbi } from "../kuru/abi";
import type { CompiledWalletPolicy } from "./privy-policy-schema";

export const WalletPolicyCandidateSchema = z
  .object({
    chainId: z.number().int().positive(),
    to: EvmAddressSchema,
    valueRaw: UintStringSchema,
    data: HexDataSchema,
  })
  .strict();

export type WalletPolicyPreview =
  | { decision: "ALLOW"; reasonCodes: ["OFFLINE_POLICY_PREVIEW_ALLOW"] }
  | { decision: "DENY"; reasonCodes: string[] };

function sameAddress(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}
/**
 * Deterministic local parity preview for tests and demos. This does not claim
 * to execute Privy's remote policy engine and never authorizes a signature.
 */
export function previewPrivyPolicyDecision(
  compiled: CompiledWalletPolicy,
  unknownCandidate: unknown,
): WalletPolicyPreview {
  const parsed = WalletPolicyCandidateSchema.safeParse(unknownCandidate);
  if (!parsed.success) return { decision: "DENY", reasonCodes: ["WALLET_POLICY_CANDIDATE_INVALID"] };
  const candidate = parsed.data;
  const reasons: string[] = [];
  if (candidate.chainId !== compiled.chainId) reasons.push("WALLET_POLICY_WRONG_CHAIN");
  if (candidate.valueRaw !== "0") reasons.push("WALLET_POLICY_NATIVE_VALUE_FORBIDDEN");

  if (sameAddress(candidate.to, compiled.tokenAddress)) {
    try {
      const decoded = decodeFunctionData({ abi: erc20ApproveAbi, data: candidate.data as Hex });
      const [spender, amount] = decoded.args as readonly [Address, bigint];
      if (decoded.functionName !== "approve") reasons.push("WALLET_POLICY_UNKNOWN_SELECTOR");
      if (!sameAddress(spender, compiled.routerAddress)) reasons.push("WALLET_POLICY_WRONG_SPENDER");
      if (amount === 0n || amount > BigInt(compiled.maxInputRaw)) reasons.push("WALLET_POLICY_AMOUNT_EXCEEDED");
    } catch {
      reasons.push("WALLET_POLICY_UNKNOWN_SELECTOR");
    }
  } else if (sameAddress(candidate.to, compiled.routerAddress)) {
    try {
      const decoded = decodeFunctionData({ abi: kuruRouterAbi, data: candidate.data as Hex });
      const [markets, isBuy, nativeSend, debitToken, creditToken, amount, minAmountOut] = decoded.args as readonly [
        readonly Address[], readonly boolean[], readonly boolean[], Address, Address, bigint, bigint,
      ];
      if (decoded.functionName !== "anyToAnySwap") reasons.push("WALLET_POLICY_UNKNOWN_SELECTOR");
      if (markets.length !== 1 || !markets[0] || !sameAddress(markets[0], compiled.marketAddress)) reasons.push("WALLET_POLICY_WRONG_MARKET");
      if (isBuy.length !== 1 || isBuy[0] !== true || nativeSend.length !== 1 || nativeSend[0] !== false) reasons.push("WALLET_POLICY_WRONG_SWAP_DIRECTION");
      if (!sameAddress(debitToken, compiled.tokenAddress) || !sameAddress(creditToken, `0x${"00".repeat(20)}`)) reasons.push("WALLET_POLICY_WRONG_TOKEN");
      if (amount === 0n || amount > BigInt(compiled.maxInputRaw)) reasons.push("WALLET_POLICY_AMOUNT_EXCEEDED");
      if (minAmountOut === 0n) reasons.push("WALLET_POLICY_ZERO_MIN_OUTPUT");
    } catch {
      reasons.push("WALLET_POLICY_UNKNOWN_SELECTOR");
    }
  } else {
    reasons.push("WALLET_POLICY_WRONG_TARGET");
  }

  return reasons.length === 0
    ? { decision: "ALLOW", reasonCodes: ["OFFLINE_POLICY_PREVIEW_ALLOW"] }
    : { decision: "DENY", reasonCodes: [...new Set(reasons)] };
}
