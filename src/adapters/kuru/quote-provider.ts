import type { Address } from "viem";

import { KuruQuoteSchema, type KuruQuote } from "../../domain/planning";

export interface ExactInputQuoteRequest {
  chainId: 10143;
  assetInAddress: Address;
  assetOutAddress: Address;
  amountInRaw: string;
  maxSlippageBps: number;
}

export interface KuruQuoteProvider {
  readonly id: string;
  quoteExactInput(request: ExactInputQuoteRequest): Promise<unknown>;
}

export function validateQuoteResponse(candidate: unknown, request: ExactInputQuoteRequest, now: string): KuruQuote {
  const quote = KuruQuoteSchema.parse(candidate);
  if (
    quote.chainId !== request.chainId ||
    quote.assetInAddress.toLowerCase() !== request.assetInAddress.toLowerCase() ||
    quote.assetOutAddress.toLowerCase() !== request.assetOutAddress.toLowerCase() ||
    quote.amountInRaw !== request.amountInRaw
  ) {
    throw new Error("QUOTE_REQUEST_MISMATCH");
  }
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) {
    throw new Error("INVALID_QUOTE_CLOCK");
  }
  if (Date.parse(quote.observedAt) > nowMs) {
    throw new Error("QUOTE_FROM_FUTURE");
  }
  if (nowMs >= Date.parse(quote.expiresAt)) {
    throw new Error("QUOTE_STALE");
  }
  return quote;
}

