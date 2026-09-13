import { encodeFunctionData, toFunctionSelector, type Address } from "viem";

import { erc20ApproveAbi, kuruRouterAbi } from "../adapters/kuru/abi";
import { KURU_TESTNET, PHASE3_GAS_LIMITS, ZERO_ADDRESS } from "../config/contracts";
import { KURU_TESTNET_USDC } from "../config/assets";
import { toScaledInteger } from "../domain/canonicalize";
import { hashCanonical } from "../domain/hash";
import { KuruQuoteSchema, type KuruQuote } from "../domain/planning";
import {
  AgentIntentSchema,
  TransactionPlanSchema,
  type AgentIntent,
  type TransactionPlan,
} from "../domain/schemas";

export interface BuildPlanInput {
  intent: AgentIntent;
  quote: KuruQuote;
  walletAddress: Address;
  policyHash: `0x${string}`;
  evidenceHash: `0x${string}`;
  gasLimits: {
    approve: bigint;
    swap: bigint;
  };
}

export interface BuildPlanDependencies {
  nextId(): string;
  now(): string;
}

function sameAddress(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

export function planHashMaterial(plan: TransactionPlan): unknown {
  const { planHash: _planHash, status: _status, ...material } = plan;
  return material;
}

export function computePlanHash(plan: TransactionPlan): `0x${string}` {
  return hashCanonical(planHashMaterial(plan));
}

export function buildKuruExactInputPlan(
  unknownInput: BuildPlanInput,
  dependencies: BuildPlanDependencies,
): TransactionPlan {
  const intent = AgentIntentSchema.parse(unknownInput.intent);
  const quote = KuruQuoteSchema.parse(unknownInput.quote);
  const usdc = KURU_TESTNET_USDC;

  if (usdc.kind !== "erc20") {
    throw new Error("INVALID_ASSET_CONFIGURATION");
  }
  if (intent.network !== "monad-testnet" || intent.chainId !== KURU_TESTNET.chainId) {
    throw new Error("UNSUPPORTED_PLAN_NETWORK");
  }
  if (!sameAddress(quote.routerAddress, KURU_TESTNET.router)) {
    throw new Error("QUOTE_ROUTER_MISMATCH");
  }
  if (!sameAddress(quote.marketAddress, KURU_TESTNET.monUsdcMarket)) {
    throw new Error("QUOTE_MARKET_MISMATCH");
  }
  if (!sameAddress(quote.assetInAddress, usdc.address) || !sameAddress(quote.assetOutAddress, ZERO_ADDRESS)) {
    throw new Error("QUOTE_ASSET_MISMATCH");
  }
  if (quote.route.length !== 1 || !quote.route[0] || !sameAddress(quote.route[0].marketAddress, KURU_TESTNET.monUsdcMarket)) {
    throw new Error("QUOTE_ROUTE_MISMATCH");
  }
  if (!quote.route[0].isBuy || quote.route[0].nativeSend) {
    throw new Error("QUOTE_DIRECTION_MISMATCH");
  }
  if (quote.evidenceHash !== unknownInput.evidenceHash) {
    throw new Error("QUOTE_EVIDENCE_MISMATCH");
  }

  const amountInRaw = toScaledInteger(intent.amountIn, usdc.decimals);
  if (quote.amountInRaw !== amountInRaw.toString()) {
    throw new Error("QUOTE_AMOUNT_MISMATCH");
  }
  if (
    unknownInput.gasLimits.approve <= 0n ||
    unknownInput.gasLimits.approve > PHASE3_GAS_LIMITS.approveMax ||
    unknownInput.gasLimits.swap <= 0n ||
    unknownInput.gasLimits.swap > PHASE3_GAS_LIMITS.swapMax
  ) {
    throw new Error("GAS_LIMIT_OUT_OF_BOUNDS");
  }

  const approvalData = encodeFunctionData({
    abi: erc20ApproveAbi,
    functionName: "approve",
    args: [KURU_TESTNET.router, amountInRaw],
  });
  const swapData = encodeFunctionData({
    abi: kuruRouterAbi,
    functionName: "anyToAnySwap",
    args: [
      [KURU_TESTNET.monUsdcMarket],
      [true],
      [false],
      usdc.address as Address,
      ZERO_ADDRESS,
      amountInRaw,
      BigInt(quote.minAmountOutRaw),
    ],
  });

  const unsignedPlan = {
    planId: dependencies.nextId(),
    requestId: intent.requestId,
    intentId: intent.intentId,
    network: "monad-testnet" as const,
    chainId: KURU_TESTNET.chainId,
    walletAddress: unknownInput.walletAddress,
    transactions: [
      {
        sequence: 0,
        purpose: "approve_exact" as const,
        chainId: KURU_TESTNET.chainId,
        to: usdc.address,
        valueRaw: "0",
        data: approvalData,
        gasLimit: unknownInput.gasLimits.approve.toString(),
        decodedCall: {
          abiId: "erc20.approve.v1",
          functionName: "approve",
          selector: toFunctionSelector("approve(address,uint256)"),
          arguments: { spender: KURU_TESTNET.router, amountRaw: amountInRaw.toString() },
        },
      },
      {
        sequence: 1,
        purpose: "swap_exact_in" as const,
        chainId: KURU_TESTNET.chainId,
        to: KURU_TESTNET.router,
        valueRaw: "0",
        data: swapData,
        gasLimit: unknownInput.gasLimits.swap.toString(),
        decodedCall: {
          abiId: "kuru.router.any-to-any-swap.v1",
          functionName: "anyToAnySwap",
          selector: toFunctionSelector(
            "anyToAnySwap(address[],bool[],bool[],address,address,uint256,uint256)",
          ),
          arguments: {
            marketAddresses: [KURU_TESTNET.monUsdcMarket],
            isBuy: [true],
            nativeSend: [false],
            debitToken: usdc.address,
            creditToken: ZERO_ADDRESS,
            amountRaw: amountInRaw.toString(),
            minAmountOutRaw: quote.minAmountOutRaw,
          },
        },
      },
    ],
    quoteId: quote.quoteId,
    quoteExpiresAt: quote.expiresAt,
    evidenceHash: unknownInput.evidenceHash,
    policyHash: unknownInput.policyHash,
    planHash: `0x${"00".repeat(32)}`,
    status: "draft" as const,
    createdAt: dependencies.now(),
  };

  const parsed = TransactionPlanSchema.parse(unsignedPlan);
  return TransactionPlanSchema.parse({ ...parsed, planHash: computePlanHash(parsed) });
}
