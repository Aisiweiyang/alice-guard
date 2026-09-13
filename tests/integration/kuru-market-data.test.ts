import { describe, expect, it } from "vitest";
import type { Address } from "viem";

import { validateExchangeMarket, validateOrderBookDepth } from "../../src/adapters/kuru/market-data";
import { KURU_TESTNET_USDC } from "../../src/config/assets";
import { KURU_TESTNET, ZERO_ADDRESS } from "../../src/config/contracts";

const usdc = KURU_TESTNET_USDC.kind === "erc20" ? KURU_TESTNET_USDC : undefined;
if (!usdc) throw new Error("invalid test config");
const usdcAddress = usdc.address as Address;

const expected = {
  symbol: "MON_USDC",
  marketAddress: KURU_TESTNET.monUsdcMarket,
  baseAssetAddress: ZERO_ADDRESS,
  quoteAssetAddress: usdcAddress,
  baseAssetDecimals: 18,
  quoteAssetDecimals: 6,
};

function market(overrides: Record<string, unknown> = {}): unknown {
  return {
    symbols: [
      {
        symbol: "MON_USDC",
        status: "TRADING",
        marketAddress: KURU_TESTNET.monUsdcMarket,
        baseAsset: "MON",
        baseAssetAddress: ZERO_ADDRESS,
        baseAssetDecimals: 18,
        quoteAsset: "USDC",
        quoteAssetAddress: usdcAddress,
        quoteAssetDecimals: 6,
        untrustedExtraField: "discarded",
        ...overrides,
      },
    ],
    serverTime: 1,
  };
}

describe("Kuru public market-data boundary", () => {
  it("returns only a request-bound trusted projection", () => {
    expect(validateExchangeMarket(market(), expected)).toEqual({
      ...expected,
      status: "TRADING",
      baseAsset: "MON",
      quoteAsset: "USDC",
    });
  });

  it("rejects the current mainnet market even though its symbol is MON_USDC", () => {
    expect(() =>
      validateExchangeMarket(
        market({
          marketAddress: "0x065c9d28e428a0db40191a54d33d5b7c71a9c394",
          quoteAssetAddress: "0x754704bc059f8c67012fed69bc8a327a5aafb603",
        }),
        expected,
      ),
    ).toThrow("MARKET_NETWORK_MISMATCH:MON_USDC");
  });

  it("normalizes update ids and strips unknown depth fields", () => {
    expect(
      validateOrderBookDepth({
        lastUpdateId: 104384799,
        bids: [["1.25", "2"]],
        asks: [["1.26", "3"]],
        E: 1,
        T: 2,
      }),
    ).toEqual({ lastUpdateId: "104384799", bids: [["1.25", "2"]], asks: [["1.26", "3"]] });
  });

  it("rejects malformed numeric data", () => {
    expect(() => validateOrderBookDepth({ lastUpdateId: 1, bids: [["NaN", "2"]], asks: [] })).toThrow();
  });
});
