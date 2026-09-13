import { PriceObservationSchema, type PriceObservation } from "../../domain/planning";

export interface PriceRequest {
  assetId: string;
  chainId: 10143;
}

export interface PriceProvider {
  readonly id: string;
  getUsdPrice(request: PriceRequest): Promise<unknown>;
}

export interface PriceBoundary {
  expectedAssetId: string;
  now: string;
  maxAgeSeconds: number;
}

export function validatePriceObservation(candidate: unknown, boundary: PriceBoundary): PriceObservation {
  const price = PriceObservationSchema.parse(candidate);
  const nowMs = Date.parse(boundary.now);
  const observedMs = Date.parse(price.observedAt);
  if (!Number.isFinite(nowMs) || !Number.isInteger(boundary.maxAgeSeconds) || boundary.maxAgeSeconds <= 0) {
    throw new Error("INVALID_PRICE_BOUNDARY");
  }
  if (price.assetId !== boundary.expectedAssetId) {
    throw new Error("PRICE_ASSET_MISMATCH");
  }
  if (observedMs > nowMs) {
    throw new Error("PRICE_FROM_FUTURE");
  }
  if (nowMs - observedMs > boundary.maxAgeSeconds * 1_000 || nowMs >= Date.parse(price.expiresAt)) {
    throw new Error("PRICE_STALE");
  }
  return price;
}

