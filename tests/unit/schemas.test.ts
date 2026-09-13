import { describe, expect, it } from "vitest";

import { RiskConfigSchema } from "../../src/domain/evaluation";
import { AgentIntentSchema } from "../../src/domain/schemas";
import { intent } from "../fixtures/evaluation-fixtures";

describe("strict boundary schemas", () => {
  it("accepts the narrow MVP intent", () => {
    expect(AgentIntentSchema.parse(intent)).toEqual(intent);
  });

  it("rejects an address or calldata smuggled through LLM output", () => {
    expect(AgentIntentSchema.safeParse({ ...intent, recipient: `0x${"44".repeat(20)}` }).success).toBe(false);
    expect(AgentIntentSchema.safeParse({ ...intent, calldata: "0xdeadbeef" }).success).toBe(false);
  });

  it("rejects unsupported actions", () => {
    expect(AgentIntentSchema.safeParse({ ...intent, action: "transfer" }).success).toBe(false);
  });

  it("rejects same-asset swaps", () => {
    expect(AgentIntentSchema.safeParse({ ...intent, assetOutSymbol: "USDC" }).success).toBe(false);
  });

  it("rejects the reverse direction and zero-value requests outside the MVP", () => {
    expect(AgentIntentSchema.safeParse({ ...intent, assetInSymbol: "MON", assetOutSymbol: "USDC" }).success).toBe(false);
    expect(AgentIntentSchema.safeParse({ ...intent, amountIn: "0.000" }).success).toBe(false);
  });

  it("rejects network and chain mismatch", () => {
    expect(AgentIntentSchema.safeParse({ ...intent, network: "monad-mainnet" }).success).toBe(false);
  });

  it("rejects inverted risk thresholds", () => {
    const result = RiskConfigSchema.safeParse({
      version: "risk.v1",
      maxPriceAgeSeconds: 120,
      maxQuoteAgeSeconds: 20,
      futureTimestampToleranceSeconds: 5,
      warningVolatilityBps: 2000,
      criticalVolatilityBps: 1000,
      warningSlippageBps: 200,
      criticalSlippageBps: 100,
      maxPostTradeAllocationBps: 500,
      warningTransactionUsd: "50",
      minimumLiquidityUsd: "100000",
    });
    expect(result.success).toBe(false);
  });
});
