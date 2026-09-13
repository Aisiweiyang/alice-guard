import { encodeFunctionData, keccak256 } from "viem";
import { describe, expect, it } from "vitest";

import { erc20ApproveAbi, kuruRouterAbi } from "../../src/adapters/kuru/abi";
import { buildKuruExactInputPlan, computePlanHash } from "../../src/application/build-plan";
import { PlanGuardReason, validateKuruPlan } from "../../src/application/plan-guard";
import { KURU_TESTNET, PHASE3_GAS_LIMITS, ZERO_ADDRESS } from "../../src/config/contracts";
import { KURU_TESTNET_USDC } from "../../src/config/assets";
import type { KuruQuote, SimulationResult } from "../../src/domain/planning";
import type { TransactionPlan } from "../../src/domain/schemas";
import { HASH, INTENT_ID, NOW, RECIPIENT, REQUEST_ID, intent } from "../fixtures/evaluation-fixtures";

const PLAN_ID = "00000000-0000-4000-8000-000000000005";
const QUOTE_HASH = `0x${"33".repeat(32)}` as const;
const usdc = KURU_TESTNET_USDC.kind === "erc20" ? KURU_TESTNET_USDC : undefined;
if (!usdc) throw new Error("invalid test config");

const quote: KuruQuote = {
  quoteId: "kuru.quote.1",
  chainId: 10143,
  routerAddress: KURU_TESTNET.router,
  marketAddress: KURU_TESTNET.monUsdcMarket,
  assetInAddress: usdc.address,
  assetOutAddress: ZERO_ADDRESS,
  amountInRaw: "20000000",
  expectedAmountOutRaw: "25000000000000000000",
  minAmountOutRaw: "24750000000000000000",
  route: [{ marketAddress: KURU_TESTNET.monUsdcMarket, isBuy: true, nativeSend: false }],
  blockNumber: "123456",
  observedAt: "2026-09-12T23:59:55.000Z",
  expiresAt: "2026-09-13T00:00:10.000Z",
  source: "local-orderbook",
  evidenceHash: QUOTE_HASH,
};

function makePlan(): TransactionPlan {
  return buildKuruExactInputPlan(
    {
      intent,
      quote,
      walletAddress: RECIPIENT,
      policyHash: HASH,
      evidenceHash: QUOTE_HASH,
      gasLimits: { approve: 80_000n, swap: 500_000n },
    },
    { nextId: () => PLAN_ID, now: () => NOW },
  );
}

function simulationsFor(plan: TransactionPlan): SimulationResult[] {
  return plan.transactions.map((transaction) => ({
    sequence: transaction.sequence,
    to: transaction.to,
    valueRaw: transaction.valueRaw,
    dataHash: keccak256(transaction.data as `0x${string}`),
    gasUsedRaw: transaction.sequence === 0 ? "45000" : "350000",
    blockNumber: "123457",
    success: true,
    revertReason: null,
  }));
}

function validate(plan: TransactionPlan, simulations = simulationsFor(plan), now = NOW) {
  return validateKuruPlan({
    plan,
    intent,
    quote,
    simulations,
    expectedWalletAddress: RECIPIENT,
    expectedPolicyHash: HASH,
    now,
  });
}

function withRecomputedHash(plan: TransactionPlan): TransactionPlan {
  return { ...plan, planHash: computePlanHash(plan) };
}

describe("Phase 3 plan builder and independent Plan Guard", () => {
  it("builds byte-stable exact approval plus exact-input swap and validates simulation", () => {
    const first = makePlan();
    const second = makePlan();
    expect(first.planHash).toBe(second.planHash);
    expect(first.transactions).toHaveLength(2);
    expect(first.transactions[0]?.decodedCall.arguments["amountRaw"]).toBe("20000000");

    const result = validate(first);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.plan.status).toBe("validated");
  });

  it("fails closed after quote expiry", () => {
    const result = validate(makePlan(), undefined, quote.expiresAt);
    expect(result).toEqual({ ok: false, reasons: [PlanGuardReason.QuoteExpired] });
  });

  it("rejects an excessive gas limit even when the attacker recomputes the plan hash", () => {
    const original = makePlan();
    const changed = withRecomputedHash({
      ...original,
      transactions: original.transactions.map((transaction) =>
        transaction.sequence === 1
          ? { ...transaction, gasLimit: (PHASE3_GAS_LIMITS.swapMax + 1n).toString() }
          : transaction,
      ),
    });
    expect(validate(changed).ok).toBe(false);
    expect(validate(changed)).toMatchObject({ reasons: expect.arrayContaining([PlanGuardReason.GasLimitExceeded]) });
  });

  it("rejects a changed wallet or policy binding", () => {
    const original = makePlan();
    const changed = withRecomputedHash({
      ...original,
      walletAddress: `0x${"55".repeat(20)}`,
      policyHash: `0x${"66".repeat(32)}`,
    });
    expect(validate(changed)).toMatchObject({ reasons: expect.arrayContaining([PlanGuardReason.IdentityMismatch]) });
  });

  it("rejects unknown calldata", () => {
    const original = makePlan();
    const changed = withRecomputedHash({
      ...original,
      transactions: original.transactions.map((transaction) =>
        transaction.sequence === 1 ? { ...transaction, data: "0xdeadbeef" } : transaction,
      ),
    });
    expect(validate(changed)).toMatchObject({ reasons: expect.arrayContaining([PlanGuardReason.UnknownCalldata]) });
  });

  it("rejects mutated spender, amount, market, and minimum output", () => {
    const variants: TransactionPlan[] = [];
    const original = makePlan();
    const badApprovalData = encodeFunctionData({
      abi: erc20ApproveAbi,
      functionName: "approve",
      args: [RECIPIENT, 20_000_000n],
    });
    variants.push(
      withRecomputedHash({
        ...original,
        transactions: original.transactions.map((transaction) =>
          transaction.sequence === 0 ? { ...transaction, data: badApprovalData } : transaction,
        ),
      }),
    );

    for (const [amount, minimum, market] of [
      [20_000_001n, 24_750_000_000_000_000_000n, KURU_TESTNET.monUsdcMarket],
      [20_000_000n, 1n, KURU_TESTNET.monUsdcMarket],
      [20_000_000n, 24_750_000_000_000_000_000n, RECIPIENT],
    ] as const) {
      const badSwapData = encodeFunctionData({
        abi: kuruRouterAbi,
        functionName: "anyToAnySwap",
        args: [[market], [true], [false], usdc.address as `0x${string}`, ZERO_ADDRESS, amount, minimum],
      });
      variants.push(
        withRecomputedHash({
          ...original,
          transactions: original.transactions.map((transaction) =>
            transaction.sequence === 1 ? { ...transaction, data: badSwapData } : transaction,
          ),
        }),
      );
    }

    for (const variant of variants) {
      expect(validate(variant)).toMatchObject({ reasons: expect.arrayContaining([PlanGuardReason.SemanticMismatch]) });
    }
  });

  it("rejects a revert and a simulation that is not bound to calldata", () => {
    const plan = makePlan();
    const reverted = simulationsFor(plan);
    reverted[1] = { ...reverted[1]!, success: false, revertReason: "ContractFunctionRevertedError" };
    expect(validate(plan, reverted)).toMatchObject({ reasons: expect.arrayContaining([PlanGuardReason.SimulationReverted]) });

    const unbound = simulationsFor(plan);
    unbound[1] = { ...unbound[1]!, dataHash: HASH };
    expect(validate(plan, unbound)).toMatchObject({ reasons: expect.arrayContaining([PlanGuardReason.SimulationMismatch]) });

    const mixedBlocks = simulationsFor(plan);
    mixedBlocks[1] = { ...mixedBlocks[1]!, blockNumber: "123458" };
    expect(validate(plan, mixedBlocks)).toMatchObject({ reasons: expect.arrayContaining([PlanGuardReason.SimulationMismatch]) });
  });

  it("rejects sub-unit precision instead of rounding USDC", () => {
    expect(() =>
      buildKuruExactInputPlan(
        {
          intent: { ...intent, amountIn: "0.0000001", intentId: INTENT_ID, requestId: REQUEST_ID },
          quote: { ...quote, amountInRaw: "1" },
          walletAddress: RECIPIENT,
          policyHash: HASH,
          evidenceHash: QUOTE_HASH,
          gasLimits: { approve: 80_000n, swap: 500_000n },
        },
        { nextId: () => PLAN_ID, now: () => NOW },
      ),
    ).toThrow("TOO_MANY_DECIMAL_PLACES");
  });
});
