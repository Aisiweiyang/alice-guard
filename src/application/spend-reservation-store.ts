import { z } from "zod";

import { DecimalStringSchema, EvmAddressSchema, IsoDateTimeSchema } from "../domain/schemas";

export const SpendReservationStatusSchema = z.enum([
  "reserved",
  "committed",
  "released",
  "expired",
  "reconciliation_required",
]);

export const SpendReservationSchema = z
  .object({
    reservationId: z.string().uuid(),
    requestId: z.string().uuid(),
    walletAddress: EvmAddressSchema,
    amountUsd: DecimalStringSchema,
    status: SpendReservationStatusSchema,
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
    expiresAt: IsoDateTimeSchema,
  })
  .strict();

export const ReserveSpendInputSchema = z
  .object({
    requestId: z.string().uuid(),
    walletAddress: EvmAddressSchema,
    amountUsd: DecimalStringSchema,
    maxTransactionUsd: DecimalStringSchema,
    maxRollingUsd: DecimalStringSchema,
    windowSeconds: z.number().int().positive().max(31_536_000),
    now: IsoDateTimeSchema,
    expiresAt: IsoDateTimeSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (Date.parse(value.expiresAt) <= Date.parse(value.now)) {
      context.addIssue({ code: "custom", path: ["expiresAt"], message: "reservation expiry must be in the future" });
    }
  });

export type SpendReservation = z.infer<typeof SpendReservationSchema>;
export type ReserveSpendInput = z.infer<typeof ReserveSpendInputSchema>;

export type ReserveSpendResult =
  | { ok: true; reservation: SpendReservation; idempotentReplay: boolean }
  | { ok: false; reason: "TRANSACTION_LIMIT_EXCEEDED" | "ROLLING_LIMIT_EXCEEDED" | "RESERVATION_INPUT_INVALID" | "REQUEST_RESERVATION_CONFLICT" };

export interface SpendReservationStore {
  reserve(input: ReserveSpendInput): ReserveSpendResult;
  commit(reservationId: string, now: string): SpendReservation;
  release(reservationId: string, now: string): SpendReservation;
  requireReconciliation(reservationId: string, now: string): SpendReservation;
  expire(reservationId: string, now: string): SpendReservation;
  get(reservationId: string): SpendReservation | null;
  list(): readonly SpendReservation[];
  verifyEventChain(): boolean;
}
