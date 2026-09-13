import { describe, expect, it } from "vitest";

import { extractOriginClaims, verifyProposalOrigin } from "../../src/application/request-origin-guard";

describe("trusted request origin guard", () => {
  it("extracts exact amount and percentage from English", () => {
    const claims = extractOriginClaims("Swap 20 USDC to MON. Do not trade above 1% slippage.");
    expect(claims).toMatchObject({
      supportedActionMentioned: true,
      conflictingActionMentioned: false,
      assetInMentioned: true,
      assetOutMentioned: true,
      amountCandidates: ["20"],
      slippageCandidatesBps: [100],
    });
  });

  it("extracts Chinese request constraints", () => {
    const claims = extractOriginClaims("用最多 20 USDC 买 MON，如果滑点超过 1%，不要交易。");
    expect(claims.amountCandidates).toEqual(["20"]);
    expect(claims.slippageCandidatesBps).toEqual([100]);
    expect(claims.supportedActionMentioned).toBe(true);
  });

  it("rejects a model-invented amount", () => {
    const result = verifyProposalOrigin("Swap 20 USDC to MON", {
      kind: "swap_exact_in",
      amountIn: "200",
      maxSlippageBps: null,
    });
    expect(result.ok).toBe(false);
    expect(result.issues.map((item) => item.code)).toContain("AMOUNT_ORIGIN_MISMATCH");
  });

  it("rejects an omitted explicit slippage constraint", () => {
    const result = verifyProposalOrigin("Buy 20 USDC worth of MON with max slippage 0.5%", {
      kind: "swap_exact_in",
      amountIn: "20",
      maxSlippageBps: null,
    });
    expect(result.issues.map((item) => item.code)).toContain("SLIPPAGE_OMITTED");
  });

  it("rejects multiple amount candidates as ambiguous", () => {
    const result = verifyProposalOrigin("Swap 20 USDC to MON, not 30 USDC", {
      kind: "swap_exact_in",
      amountIn: "20",
      maxSlippageBps: null,
    });
    expect(result.issues.map((item) => item.code)).toContain("AMOUNT_AMBIGUOUS");
  });
});
