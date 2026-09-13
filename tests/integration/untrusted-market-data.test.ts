import { describe, expect, it } from "vitest";

import { validateQuoteResponse } from "../../src/adapters/kuru/quote-provider";
import { validatePriceObservation } from "../../src/adapters/price/price-provider";
import { KURU_TESTNET, ZERO_ADDRESS } from "../../src/config/contracts";
import { KURU_TESTNET_USDC } from "../../src/config/assets";

const evidenceHash = `0x${"77".repeat(32)}`;
const usdc = KURU_TESTNET_USDC.kind === "erc20" ? KURU_TESTNET_USDC : undefined;
if (!usdc) throw new Error("invalid test config");

const request = {
  chainId: 10143 as const,
  assetInAddress: usdc.address as `0x${string}`,
  assetOutAddress: ZERO_ADDRESS,
  amountInRaw: "20000000",
  maxSlippageBps: 100,
};

const quote = {
  quoteId: "quote.boundary.1",
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
  observedAt: "2026-09-13T00:00:00.000Z",
  expiresAt: "2026-09-13T00:00:20.000Z",
  source: "kuru-api",
  evidenceHash,
};

describe("untrusted quote and price boundaries", () => {
  it("binds a quote response back to the exact request", () => {
    expect(validateQuoteResponse(quote, request, "2026-09-13T00:00:10.000Z").amountInRaw).toBe("20000000");
    expect(() => validateQuoteResponse({ ...quote, amountInRaw: "1" }, request, "2026-09-13T00:00:10.000Z")).toThrow(
      "QUOTE_REQUEST_MISMATCH",
    );
  });

  it("rejects stale, future, and schema-expanded quote responses", () => {
    expect(() => validateQuoteResponse(quote, request, quote.expiresAt)).toThrow("QUOTE_STALE");
    expect(() =>
      validateQuoteResponse({ ...quote, observedAt: "2026-09-13T00:00:11.000Z" }, request, "2026-09-13T00:00:10.000Z"),
    ).toThrow("QUOTE_FROM_FUTURE");
    expect(() => validateQuoteResponse({ ...quote, calldata: "0xdeadbeef" }, request, "2026-09-13T00:00:10.000Z")).toThrow();
  });

  it("rejects manipulated or stale price observations", () => {
    const price = {
      assetId: "monad-testnet:KURU-USDC",
      usdPrice: "1",
      observedAt: "2026-09-13T00:00:00.000Z",
      expiresAt: "2026-09-13T00:02:00.000Z",
      source: "test-fixture",
      blockNumber: null,
      evidenceHash,
    };
    expect(validatePriceObservation(price, {
      expectedAssetId: price.assetId,
      now: "2026-09-13T00:01:00.000Z",
      maxAgeSeconds: 120,
    })).toEqual(price);
    expect(() => validatePriceObservation({ ...price, usdPrice: "NaN" }, {
      expectedAssetId: price.assetId,
      now: "2026-09-13T00:01:00.000Z",
      maxAgeSeconds: 120,
    })).toThrow();
    expect(() => validatePriceObservation(price, {
      expectedAssetId: price.assetId,
      now: "2026-09-13T00:03:00.000Z",
      maxAgeSeconds: 120,
    })).toThrow("PRICE_STALE");
  });
});

