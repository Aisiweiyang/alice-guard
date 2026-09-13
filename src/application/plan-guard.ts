import { decodeFunctionData, keccak256, type Address, type Hex } from "viem";

import { erc20ApproveAbi, kuruRouterAbi } from "../adapters/kuru/abi";
import { KURU_TESTNET, PHASE3_GAS_LIMITS, ZERO_ADDRESS } from "../config/contracts";
import { KURU_TESTNET_USDC } from "../config/assets";
import { toScaledInteger } from "../domain/canonicalize";
import { KuruQuoteSchema, SimulationResultSchema, type KuruQuote, type SimulationResult } from "../domain/planning";
import {
  AgentIntentSchema,
  Bytes32Schema,
  EvmAddressSchema,
  TransactionPlanSchema,
  type AgentIntent,
  type TransactionPlan,
} from "../domain/schemas";
import { computePlanHash } from "./build-plan";

export const PlanGuardReason = {
  SchemaInvalid: "PLAN_SCHEMA_INVALID",
  IdentityMismatch: "PLAN_IDENTITY_MISMATCH",
  WrongChain: "PLAN_WRONG_CHAIN",
  QuoteMismatch: "PLAN_QUOTE_MISMATCH",
  QuoteExpired: "PLAN_QUOTE_EXPIRED",
  QuoteFromFuture: "PLAN_QUOTE_FROM_FUTURE",
  HashMismatch: "PLAN_HASH_MISMATCH",
  TransactionShape: "PLAN_TRANSACTION_SHAPE_INVALID",
  UnknownCalldata: "PLAN_UNKNOWN_CALLDATA",
  SemanticMismatch: "PLAN_SEMANTIC_MISMATCH",
  GasLimitExceeded: "PLAN_GAS_LIMIT_EXCEEDED",
  SimulationMissing: "PLAN_SIMULATION_MISSING",
  SimulationMismatch: "PLAN_SIMULATION_MISMATCH",
  SimulationReverted: "PLAN_SIMULATION_REVERTED",
  SimulationGasExceeded: "PLAN_SIMULATION_GAS_EXCEEDED",
} as const;

export type PlanGuardFailure = {
  ok: false;
  reasons: string[];
};

export type PlanGuardSuccess = {
  ok: true;
  plan: TransactionPlan;
};

export type PlanGuardResult = PlanGuardFailure | PlanGuardSuccess;

export interface ValidatePlanInput {
  plan: TransactionPlan;
  intent: AgentIntent;
  quote: KuruQuote;
  simulations: SimulationResult[];
  expectedWalletAddress: Address;
  expectedPolicyHash: `0x${string}`;
  now: string;
}

function sameAddress(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function unique(reasons: string[]): string[] {
  return [...new Set(reasons)];
}

export function validateKuruPlan(unknownInput: ValidatePlanInput): PlanGuardResult {
  const planResult = TransactionPlanSchema.safeParse(unknownInput.plan);
  const intentResult = AgentIntentSchema.safeParse(unknownInput.intent);
  const quoteResult = KuruQuoteSchema.safeParse(unknownInput.quote);
  const simulationResult = SimulationResultSchema.array().safeParse(unknownInput.simulations);
  const walletResult = EvmAddressSchema.safeParse(unknownInput.expectedWalletAddress);
  const policyHashResult = Bytes32Schema.safeParse(unknownInput.expectedPolicyHash);
  if (
    !planResult.success ||
    !intentResult.success ||
    !quoteResult.success ||
    !simulationResult.success ||
    !walletResult.success ||
    !policyHashResult.success
  ) {
    return { ok: false, reasons: [PlanGuardReason.SchemaInvalid] };
  }

  const plan = planResult.data;
  const intent = intentResult.data;
  const quote = quoteResult.data;
  const simulations = simulationResult.data;
  const reasons: string[] = [];
  const nowMs = Date.parse(unknownInput.now);

  if (!Number.isFinite(nowMs)) {
    return { ok: false, reasons: [PlanGuardReason.SchemaInvalid] };
  }
  if (
    plan.requestId !== intent.requestId ||
    plan.intentId !== intent.intentId ||
    !sameAddress(plan.walletAddress, unknownInput.expectedWalletAddress) ||
    plan.policyHash !== unknownInput.expectedPolicyHash
  ) {
    reasons.push(PlanGuardReason.IdentityMismatch);
  }
  if (plan.chainId !== 10143 || plan.network !== "monad-testnet" || intent.chainId !== 10143) {
    reasons.push(PlanGuardReason.WrongChain);
  }
  if (
    plan.quoteId !== quote.quoteId ||
    plan.quoteExpiresAt !== quote.expiresAt ||
    plan.evidenceHash !== quote.evidenceHash ||
    quote.chainId !== 10143
  ) {
    reasons.push(PlanGuardReason.QuoteMismatch);
  }
  if (nowMs >= Date.parse(quote.expiresAt) || Date.parse(plan.createdAt) >= Date.parse(quote.expiresAt)) {
    reasons.push(PlanGuardReason.QuoteExpired);
  }
  if (Date.parse(quote.observedAt) > nowMs || Date.parse(plan.createdAt) > nowMs) {
    reasons.push(PlanGuardReason.QuoteFromFuture);
  }
  if (plan.planHash !== computePlanHash(plan)) {
    reasons.push(PlanGuardReason.HashMismatch);
  }
  if (plan.transactions.length !== 2) {
    reasons.push(PlanGuardReason.TransactionShape);
  }

  const approval = plan.transactions[0];
  const swap = plan.transactions[1];
  const usdc = KURU_TESTNET_USDC;
  if (!approval || !swap || usdc.kind !== "erc20") {
    reasons.push(PlanGuardReason.TransactionShape);
  } else {
    if (
      approval.sequence !== 0 ||
      approval.purpose !== "approve_exact" ||
      !sameAddress(approval.to, usdc.address) ||
      approval.valueRaw !== "0" ||
      swap.sequence !== 1 ||
      swap.purpose !== "swap_exact_in" ||
      !sameAddress(swap.to, KURU_TESTNET.router) ||
      swap.valueRaw !== "0"
    ) {
      reasons.push(PlanGuardReason.TransactionShape);
    }

    if (
      BigInt(approval.gasLimit) > PHASE3_GAS_LIMITS.approveMax ||
      BigInt(swap.gasLimit) > PHASE3_GAS_LIMITS.swapMax ||
      BigInt(approval.gasLimit) === 0n ||
      BigInt(swap.gasLimit) === 0n
    ) {
      reasons.push(PlanGuardReason.GasLimitExceeded);
    }

    try {
      const decodedApproval = decodeFunctionData({ abi: erc20ApproveAbi, data: approval.data as Hex });
      const [spender, approvalAmount] = decodedApproval.args as readonly [Address, bigint];
      const intendedAmount = toScaledInteger(intent.amountIn, usdc.decimals);
      if (
        decodedApproval.functionName !== "approve" ||
        !sameAddress(spender, KURU_TESTNET.router) ||
        approvalAmount !== intendedAmount ||
        quote.amountInRaw !== intendedAmount.toString() ||
        approval.decodedCall.abiId !== "erc20.approve.v1" ||
        approval.decodedCall.functionName !== "approve" ||
        approval.decodedCall.selector !== approval.data.slice(0, 10) ||
        approval.decodedCall.arguments["amountRaw"] !== intendedAmount.toString() ||
        !sameAddress(String(approval.decodedCall.arguments["spender"]), KURU_TESTNET.router)
      ) {
        reasons.push(PlanGuardReason.SemanticMismatch);
      }
    } catch {
      reasons.push(PlanGuardReason.UnknownCalldata);
    }

    try {
      const decodedSwap = decodeFunctionData({ abi: kuruRouterAbi, data: swap.data as Hex });
      const [markets, isBuy, nativeSend, debitToken, creditToken, amount, minAmountOut] = decodedSwap.args as readonly [
        readonly Address[],
        readonly boolean[],
        readonly boolean[],
        Address,
        Address,
        bigint,
        bigint,
      ];
      const decodedArguments = swap.decodedCall.arguments;
      const recordedMarkets = decodedArguments["marketAddresses"];
      const recordedIsBuy = decodedArguments["isBuy"];
      const recordedNativeSend = decodedArguments["nativeSend"];
      if (
        decodedSwap.functionName !== "anyToAnySwap" ||
        markets.length !== 1 ||
        !markets[0] ||
        !sameAddress(markets[0], KURU_TESTNET.monUsdcMarket) ||
        isBuy.length !== 1 ||
        isBuy[0] !== true ||
        nativeSend.length !== 1 ||
        nativeSend[0] !== false ||
        !sameAddress(debitToken, usdc.address) ||
        !sameAddress(creditToken, ZERO_ADDRESS) ||
        amount.toString() !== quote.amountInRaw ||
        minAmountOut.toString() !== quote.minAmountOutRaw ||
        minAmountOut === 0n ||
        swap.decodedCall.abiId !== "kuru.router.any-to-any-swap.v1" ||
        swap.decodedCall.functionName !== "anyToAnySwap" ||
        swap.decodedCall.selector !== swap.data.slice(0, 10) ||
        !Array.isArray(recordedMarkets) ||
        recordedMarkets.length !== 1 ||
        !sameAddress(String(recordedMarkets[0]), KURU_TESTNET.monUsdcMarket) ||
        !Array.isArray(recordedIsBuy) ||
        recordedIsBuy.length !== 1 ||
        recordedIsBuy[0] !== true ||
        !Array.isArray(recordedNativeSend) ||
        recordedNativeSend.length !== 1 ||
        recordedNativeSend[0] !== false ||
        !sameAddress(String(decodedArguments["debitToken"]), usdc.address) ||
        !sameAddress(String(decodedArguments["creditToken"]), ZERO_ADDRESS) ||
        decodedArguments["amountRaw"] !== quote.amountInRaw ||
        decodedArguments["minAmountOutRaw"] !== quote.minAmountOutRaw
      ) {
        reasons.push(PlanGuardReason.SemanticMismatch);
      }
    } catch {
      reasons.push(PlanGuardReason.UnknownCalldata);
    }

    if (
      !sameAddress(quote.routerAddress, KURU_TESTNET.router) ||
      !sameAddress(quote.marketAddress, KURU_TESTNET.monUsdcMarket) ||
      !sameAddress(quote.assetInAddress, usdc.address) ||
      !sameAddress(quote.assetOutAddress, ZERO_ADDRESS) ||
      quote.route.length !== 1 ||
      !quote.route[0] ||
      !sameAddress(quote.route[0].marketAddress, KURU_TESTNET.monUsdcMarket) ||
      !quote.route[0].isBuy ||
      quote.route[0].nativeSend
    ) {
      reasons.push(PlanGuardReason.QuoteMismatch);
    }

    if (simulations.length !== 2) {
      reasons.push(PlanGuardReason.SimulationMissing);
    } else {
      const simulationBlocks = new Set(simulations.map((simulation) => simulation.blockNumber));
      if (
        simulationBlocks.size !== 1 ||
        simulations.some((simulation) => BigInt(simulation.blockNumber) < BigInt(quote.blockNumber))
      ) {
        reasons.push(PlanGuardReason.SimulationMismatch);
      }
      for (const transaction of [approval, swap]) {
        const simulation = simulations.find((candidate) => candidate.sequence === transaction.sequence);
        if (!simulation) {
          reasons.push(PlanGuardReason.SimulationMissing);
          continue;
        }
        if (
          !sameAddress(simulation.to, transaction.to) ||
          simulation.valueRaw !== transaction.valueRaw ||
          simulation.dataHash !== keccak256(transaction.data as Hex)
        ) {
          reasons.push(PlanGuardReason.SimulationMismatch);
        }
        if (!simulation.success) {
          reasons.push(PlanGuardReason.SimulationReverted);
        }
        if (BigInt(simulation.gasUsedRaw) > BigInt(transaction.gasLimit)) {
          reasons.push(PlanGuardReason.SimulationGasExceeded);
        }
      }
    }
  }

  if (reasons.length > 0) {
    return { ok: false, reasons: unique(reasons) };
  }
  return { ok: true, plan: TransactionPlanSchema.parse({ ...plan, status: "validated" }) };
}
