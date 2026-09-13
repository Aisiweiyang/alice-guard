import { z } from "zod";

import {
  Bytes32Schema,
  DecimalStringSchema,
  EvmAddressSchema,
  IdentSchema,
  IsoDateTimeSchema,
  MonadChainIdSchema,
  UintStringSchema,
} from "./schemas";

export const KuruQuoteSchema = z
  .object({
    quoteId: IdentSchema,
    chainId: MonadChainIdSchema,
    routerAddress: EvmAddressSchema,
    marketAddress: EvmAddressSchema,
    assetInAddress: EvmAddressSchema,
    assetOutAddress: EvmAddressSchema,
    amountInRaw: UintStringSchema,
    expectedAmountOutRaw: UintStringSchema,
    minAmountOutRaw: UintStringSchema,
    route: z
      .array(
        z
          .object({
            marketAddress: EvmAddressSchema,
            isBuy: z.boolean(),
            nativeSend: z.boolean(),
          })
          .strict(),
      )
      .length(1),
    blockNumber: UintStringSchema,
    observedAt: IsoDateTimeSchema,
    expiresAt: IsoDateTimeSchema,
    source: z.enum(["kuru-sdk", "kuru-api", "local-orderbook"]),
    evidenceHash: Bytes32Schema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (BigInt(value.amountInRaw) === 0n) {
      ctx.addIssue({ code: "custom", path: ["amountInRaw"], message: "quote input must be positive" });
    }
    if (BigInt(value.minAmountOutRaw) === 0n) {
      ctx.addIssue({ code: "custom", path: ["minAmountOutRaw"], message: "minimum output must be positive" });
    }
    if (BigInt(value.minAmountOutRaw) > BigInt(value.expectedAmountOutRaw)) {
      ctx.addIssue({ code: "custom", path: ["minAmountOutRaw"], message: "minimum output exceeds expected output" });
    }
    if (Date.parse(value.observedAt) >= Date.parse(value.expiresAt)) {
      ctx.addIssue({ code: "custom", path: ["expiresAt"], message: "quote must expire after observation" });
    }
  });

export const SimulationResultSchema = z
  .object({
    sequence: z.number().int().min(0).max(1),
    to: EvmAddressSchema,
    valueRaw: UintStringSchema,
    dataHash: Bytes32Schema,
    gasUsedRaw: UintStringSchema,
    blockNumber: UintStringSchema,
    success: z.boolean(),
    revertReason: z.string().min(1).max(500).nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.success && value.revertReason !== null) {
      ctx.addIssue({ code: "custom", path: ["revertReason"], message: "successful simulation cannot have a revert reason" });
    }
    if (!value.success && value.revertReason === null) {
      ctx.addIssue({ code: "custom", path: ["revertReason"], message: "failed simulation requires a safe reason" });
    }
  });

export const PriceObservationSchema = z
  .object({
    assetId: IdentSchema,
    usdPrice: DecimalStringSchema,
    observedAt: IsoDateTimeSchema,
    expiresAt: IsoDateTimeSchema,
    source: z.enum(["oracle", "signed-api", "test-fixture"]),
    blockNumber: UintStringSchema.nullable(),
    evidenceHash: Bytes32Schema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (BigInt(value.usdPrice.replace(".", "")) === 0n) {
      ctx.addIssue({ code: "custom", path: ["usdPrice"], message: "price must be positive" });
    }
    if (Date.parse(value.observedAt) >= Date.parse(value.expiresAt)) {
      ctx.addIssue({ code: "custom", path: ["expiresAt"], message: "price must expire after observation" });
    }
  });

export type KuruQuote = z.infer<typeof KuruQuoteSchema>;
export type SimulationResult = z.infer<typeof SimulationResultSchema>;
export type PriceObservation = z.infer<typeof PriceObservationSchema>;

