import { z } from "zod";

import { Bytes32Schema, EvmAddressSchema, IdentSchema, UintStringSchema } from "../../domain/schemas";

export const PrivyPolicyStatusSchema = z.enum(["MATCHED", "DRIFTED", "NOT_CONFIGURED", "UNAVAILABLE"]);

export const PrivyConditionSchema = z
  .object({
    field_source: z.enum(["ethereum_transaction", "ethereum_calldata"]),
    field: z.string().min(1).max(128),
    operator: z.enum(["eq", "neq", "lt", "lte", "gt", "gte", "in", "in_condition_set"]),
    value: z.union([z.string().max(512), z.number().safe(), z.array(z.string().max(128)).max(16)]),
    abi: z.array(z.unknown()).max(32).optional(),
  })
  .strict();

export const PrivyRuleSchema = z
  .object({
    name: z.string().min(1).max(50),
    method: z.literal("eth_sendTransaction"),
    conditions: z.array(PrivyConditionSchema).min(1).max(16),
    action: z.enum(["ALLOW", "DENY"]),
  })
  .strict();

export const PrivyPolicyManifestSchema = z
  .object({
    version: z.literal("1.0"),
    name: z.string().min(1).max(50),
    chain_type: z.literal("ethereum"),
    rules: z.array(PrivyRuleSchema).min(1).max(16),
  })
  .strict()
  .superRefine((value, context) => {
    for (const [index, rule] of value.rules.entries()) {
      if ((rule.method as string) === "*") {
        context.addIssue({ code: "custom", path: ["rules", index, "method"], message: "wildcard methods are forbidden" });
      }
      if (rule.action !== "ALLOW") {
        context.addIssue({ code: "custom", path: ["rules", index, "action"], message: "this compiler emits explicit allows only; absence denies" });
      }
    }
  });

export const WalletPolicyCoverageSchema = z
  .object({
    rule: z.enum([
      "chain",
      "contract",
      "selector",
      "token",
      "spender",
      "recipient",
      "amount",
      "native_value",
      "slippage",
      "usd_limit",
      "rolling_spend",
      "evidence_freshness",
      "human_approval",
      "key_export",
      "arbitrary_signing",
    ]),
    enforcement: z.enum(["PRIVY_ENFORCED", "APP_ONLY", "UNSUPPORTED"]),
    detail: z.string().min(1).max(300),
  })
  .strict();

export const CompiledWalletPolicySchema = z
  .object({
    manifest: PrivyPolicyManifestSchema,
    walletPolicyHash: Bytes32Schema,
    coverage: z.array(WalletPolicyCoverageSchema).min(1),
    chainId: z.literal(10143),
    tokenAddress: EvmAddressSchema,
    routerAddress: EvmAddressSchema,
    marketAddress: EvmAddressSchema,
    maxInputRaw: UintStringSchema,
  })
  .strict();

export const WalletPolicyVerificationSchema = z
  .object({
    status: PrivyPolicyStatusSchema,
    expectedHash: Bytes32Schema,
    observedHash: Bytes32Schema.nullable(),
    safeReason: IdentSchema,
  })
  .strict();

export type PrivyPolicyManifest = z.infer<typeof PrivyPolicyManifestSchema>;
export type WalletPolicyCoverage = z.infer<typeof WalletPolicyCoverageSchema>;
export type CompiledWalletPolicy = z.infer<typeof CompiledWalletPolicySchema>;
export type WalletPolicyVerification = z.infer<typeof WalletPolicyVerificationSchema>;
