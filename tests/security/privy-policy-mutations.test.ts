import { encodeFunctionData, type Address } from "viem";
import { describe, expect, it } from "vitest";

import { compilePrivyPolicy } from "../../src/adapters/privy/privy-policy-compiler";
import { previewPrivyPolicyDecision } from "../../src/adapters/privy/privy-policy-preview";
import { erc20ApproveAbi, kuruRouterAbi } from "../../src/adapters/kuru/abi";
import { DEFAULT_WALLET_POLICY_CONFIG } from "../../src/config/wallet-policy";
import { ZERO_ADDRESS } from "../../src/config/contracts";
import { createValidatedDemoPlan } from "../fixtures/phase4-fixtures";

describe("Privy policy mutation preview", () => {
  const compiled = compilePrivyPolicy(DEFAULT_WALLET_POLICY_CONFIG);
  const candidate = (transaction: { chainId: number; to: string; valueRaw: string; data: string }) => ({
    chainId: transaction.chainId,
    to: transaction.to,
    valueRaw: transaction.valueRaw,
    data: transaction.data,
  });

  it("admits only the two validated demo transaction shapes", async () => {
    const { plan } = await createValidatedDemoPlan();
    for (const transaction of plan.transactions) {
      expect(previewPrivyPolicyDecision(compiled, candidate(transaction)).decision).toBe("ALLOW");
    }
  });

  it.each([
    ["wrong chain", (candidate: Record<string, unknown>) => ({ ...candidate, chainId: 143 })],
    ["wrong target", (candidate: Record<string, unknown>) => ({ ...candidate, to: `0x${"99".repeat(20)}` })],
    ["native value", (candidate: Record<string, unknown>) => ({ ...candidate, valueRaw: "1" })],
    ["unknown selector", (candidate: Record<string, unknown>) => ({ ...candidate, data: "0xdeadbeef" })],
  ])("denies %s mutations", async (_name, mutate) => {
    const { plan } = await createValidatedDemoPlan();
    expect(previewPrivyPolicyDecision(compiled, mutate(candidate(plan.transactions[1]!))).decision).toBe("DENY");
  });

  it.each([
    ["wrong spender", encodeFunctionData({ abi: erc20ApproveAbi, functionName: "approve", args: [`0x${"88".repeat(20)}`, 20_000_000n] })],
    ["unlimited approval", encodeFunctionData({ abi: erc20ApproveAbi, functionName: "approve", args: [DEFAULT_WALLET_POLICY_CONFIG.routerAddress, 2n ** 256n - 1n] })],
    ["zero approval", encodeFunctionData({ abi: erc20ApproveAbi, functionName: "approve", args: [DEFAULT_WALLET_POLICY_CONFIG.routerAddress, 0n] })],
  ])("denies %s", async (_name, data) => {
    const { plan } = await createValidatedDemoPlan();
    expect(previewPrivyPolicyDecision(compiled, { ...candidate(plan.transactions[0]!), data }).decision).toBe("DENY");
  });

  type SwapArgs = readonly [readonly Address[], readonly boolean[], readonly boolean[], Address, Address, bigint, bigint];
  const swapMutations: readonly [string, SwapArgs][] = [
    ["wrong market", [[`0x${"77".repeat(20)}` as Address], [true], [false], DEFAULT_WALLET_POLICY_CONFIG.tokenAddress as Address, ZERO_ADDRESS, 20_000_000n, 1n]],
    ["wrong token", [[DEFAULT_WALLET_POLICY_CONFIG.marketAddress as Address], [true], [false], `0x${"66".repeat(20)}` as Address, ZERO_ADDRESS, 20_000_000n, 1n]],
    ["wrong direction", [[DEFAULT_WALLET_POLICY_CONFIG.marketAddress as Address], [false], [false], DEFAULT_WALLET_POLICY_CONFIG.tokenAddress as Address, ZERO_ADDRESS, 20_000_000n, 1n]],
    ["amount above cap", [[DEFAULT_WALLET_POLICY_CONFIG.marketAddress as Address], [true], [false], DEFAULT_WALLET_POLICY_CONFIG.tokenAddress as Address, ZERO_ADDRESS, 100_000_001n, 1n]],
    ["zero minimum output", [[DEFAULT_WALLET_POLICY_CONFIG.marketAddress as Address], [true], [false], DEFAULT_WALLET_POLICY_CONFIG.tokenAddress as Address, ZERO_ADDRESS, 20_000_000n, 0n]],
  ];
  it.each(swapMutations)("denies %s", async (_name, args) => {
    const { plan } = await createValidatedDemoPlan();
    const data = encodeFunctionData({
      abi: kuruRouterAbi,
      functionName: "anyToAnySwap",
      args,
    });
    expect(previewPrivyPolicyDecision(compiled, { ...candidate(plan.transactions[1]!), data }).decision).toBe("DENY");
  });
});
