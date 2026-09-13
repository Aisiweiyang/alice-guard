import { z } from "zod";
import type { Address } from "viem";

import { DecimalStringSchema, EvmAddressSchema, UintStringSchema } from "../../domain/schemas";

const ApiUintSchema = z
  .union([UintStringSchema, z.number().int().nonnegative().safe()])
  .transform((value) => String(value));

const ExchangeInfoEnvelopeSchema = z
  .object({ symbols: z.array(z.unknown()) })
  .loose();

const MarketSymbolCandidateSchema = z
  .object({
    symbol: z.string().min(1).max(64),
    status: z.string().min(1).max(32),
    marketAddress: EvmAddressSchema,
    baseAsset: z.string().min(1).max(32),
    baseAssetAddress: EvmAddressSchema,
    baseAssetDecimals: z.number().int().min(0).max(255),
    quoteAsset: z.string().min(1).max(32),
    quoteAssetAddress: EvmAddressSchema,
    quoteAssetDecimals: z.number().int().min(0).max(255),
  })
  .loose();

const PriceLevelSchema = z.tuple([DecimalStringSchema, DecimalStringSchema]);

const OrderBookEnvelopeSchema = z
  .object({
    lastUpdateId: ApiUintSchema,
    bids: z.array(PriceLevelSchema),
    asks: z.array(PriceLevelSchema),
  })
  .loose();

export interface ExpectedKuruMarket {
  symbol: string;
  marketAddress: Address;
  baseAssetAddress: Address;
  quoteAssetAddress: Address;
  baseAssetDecimals: number;
  quoteAssetDecimals: number;
}

export interface ValidatedKuruMarket extends ExpectedKuruMarket {
  status: "TRADING";
  baseAsset: string;
  quoteAsset: string;
}

export interface ValidatedOrderBookDepth {
  lastUpdateId: string;
  bids: ReadonlyArray<readonly [string, string]>;
  asks: ReadonlyArray<readonly [string, string]>;
}

function sameAddress(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

/**
 * The public exchange API currently serves mainnet data. It is an untrusted
 * discovery aid only: a symbol match is never enough to establish network or
 * asset identity. This function returns a deliberately small trusted projection.
 */
export function validateExchangeMarket(candidate: unknown, expected: ExpectedKuruMarket): ValidatedKuruMarket {
  const envelope = ExchangeInfoEnvelopeSchema.parse(candidate);
  const rawMarket = envelope.symbols.find((entry) => {
    return typeof entry === "object" && entry !== null && "symbol" in entry && entry.symbol === expected.symbol;
  });
  if (!rawMarket) throw new Error(`MARKET_NOT_FOUND:${expected.symbol}`);

  const market = MarketSymbolCandidateSchema.parse(rawMarket);
  if (
    !sameAddress(market.marketAddress, expected.marketAddress) ||
    !sameAddress(market.baseAssetAddress, expected.baseAssetAddress) ||
    !sameAddress(market.quoteAssetAddress, expected.quoteAssetAddress)
  ) {
    throw new Error(`MARKET_NETWORK_MISMATCH:${expected.symbol}`);
  }
  if (
    market.baseAssetDecimals !== expected.baseAssetDecimals ||
    market.quoteAssetDecimals !== expected.quoteAssetDecimals
  ) {
    throw new Error(`MARKET_DECIMALS_MISMATCH:${expected.symbol}`);
  }
  if (market.status !== "TRADING") throw new Error(`MARKET_NOT_TRADING:${expected.symbol}`);

  return {
    ...expected,
    status: "TRADING",
    baseAsset: market.baseAsset,
    quoteAsset: market.quoteAsset,
  };
}

/** Drops every API field that is not needed by deterministic quote validation. */
export function validateOrderBookDepth(candidate: unknown): ValidatedOrderBookDepth {
  const depth = OrderBookEnvelopeSchema.parse(candidate);
  return {
    lastUpdateId: depth.lastUpdateId,
    bids: depth.bids,
    asks: depth.asks,
  };
}
