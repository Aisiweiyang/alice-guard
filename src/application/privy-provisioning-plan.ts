import { z } from "zod";

import { compilePrivyPolicy } from "../adapters/privy/privy-policy-compiler";
import { type PrivyDemoPublicState } from "../adapters/privy/privy-public-state";
import { DEFAULT_WALLET_POLICY_CONFIG } from "../config/wallet-policy";
import { PrivyCuidSchema, type PrivyLiveEnvironment, missingPrivySetupVariables } from "../config/privy-live";
import { hashCanonical } from "../domain/hash";
import { Bytes32Schema, EvmAddressSchema, IdentSchema } from "../domain/schemas";

const EnvironmentVariableNameSchema = z.enum([
  "PRIVY_APP_ID",
  "PRIVY_APP_SECRET",
  "PRIVY_AUTHORIZATION_KEY_ID",
  "PRIVY_AUTHORIZATION_PRIVATE_KEY",
]);

const ProvisioningStepSchema = z
  .object({
    order: z.number().int().min(1).max(20),
    action: z.enum([
      "validate_local_policy",
      "create_remote_policy",
      "verify_remote_policy",
      "create_demo_wallet",
      "verify_wallet_binding",
      "prepare_nonbroadcast_denial_suite",
    ]),
    state: z.enum(["LOCAL_ONLY", "REQUIRES_USER_CONFIRMATION"]),
    safeSummary: z.string().min(1).max(300),
  })
  .strict();

export const PrivySetupDryRunPlanSchema = z
  .object({
    schemaVersion: z.literal("phase4b.setup.v1"),
    mode: z.literal("dry-run"),
    status: z.enum(["READY_FOR_USER_SETUP", "READY_FOR_CONFIRMATION"]),
    chainId: z.literal(10143),
    walletDisplayName: z.literal("Alice Guard Hackathon Test Wallet"),
    walletExternalId: z.literal("alice-guard-hackathon-testnet-v1"),
    walletPolicyHash: Bytes32Schema,
    ownerConfigured: z.boolean(),
    missingEnvironment: z.array(EnvironmentVariableNameSchema),
    policyCreateIdempotencyKey: z.string().uuid(),
    walletCreateIdempotencyKey: z.string().uuid(),
    steps: z.array(ProvisioningStepSchema).length(6),
    nextGate: z.enum(["USER_PRIVY_DASHBOARD_SETUP", "USER_REMOTE_PROVISION_CONFIRMATION"]),
    remoteMutationsPerformed: z.literal(false),
    signingPerformed: z.literal(false),
    broadcastPerformed: z.literal(false),
    confirmationHash: Bytes32Schema,
  })
  .strict();

export type PrivySetupDryRunPlan = z.infer<typeof PrivySetupDryRunPlanSchema>;

function uuidFromHash(value: unknown): string {
  const hex = hashCanonical(value).slice(2, 34).split("");
  hex[12] = "5";
  hex[16] = ["8", "9", "a", "b"][Number.parseInt(hex[16] ?? "0", 16) % 4] ?? "8";
  const compact = hex.join("");
  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20, 32)}`;
}

export function buildPrivySetupDryRunPlan(config: PrivyLiveEnvironment): PrivySetupDryRunPlan {
  const compiled = compilePrivyPolicy(DEFAULT_WALLET_POLICY_CONFIG);
  const missingEnvironment = missingPrivySetupVariables(config);
  const body = {
    schemaVersion: "phase4b.setup.v1" as const,
    mode: "dry-run" as const,
    status: missingEnvironment.length === 0 ? "READY_FOR_CONFIRMATION" as const : "READY_FOR_USER_SETUP" as const,
    chainId: 10143 as const,
    walletDisplayName: "Alice Guard Hackathon Test Wallet" as const,
    walletExternalId: "alice-guard-hackathon-testnet-v1" as const,
    walletPolicyHash: compiled.walletPolicyHash,
    ownerConfigured: config.authorizationKeyId !== null,
    missingEnvironment,
    policyCreateIdempotencyKey: uuidFromHash({ operation: "create-policy", hash: compiled.walletPolicyHash }),
    walletCreateIdempotencyKey: uuidFromHash({ operation: "create-wallet", hash: compiled.walletPolicyHash }),
    steps: [
      { order: 1, action: "validate_local_policy", state: "LOCAL_ONLY", safeSummary: "Validate the strict, default-deny Monad testnet policy manifest." },
      { order: 2, action: "create_remote_policy", state: "REQUIRES_USER_CONFIRMATION", safeSummary: "Create exactly one owned Privy policy with the reviewed manifest." },
      { order: 3, action: "verify_remote_policy", state: "REQUIRES_USER_CONFIRMATION", safeSummary: "Read the remote policy and require an exact canonical hash match." },
      { order: 4, action: "create_demo_wallet", state: "REQUIRES_USER_CONFIRMATION", safeSummary: "Create one new Ethereum test wallet owned by the dedicated authorization key." },
      { order: 5, action: "verify_wallet_binding", state: "REQUIRES_USER_CONFIRMATION", safeSummary: "Require the wallet owner and singleton policy binding to match the plan." },
      { order: 6, action: "prepare_nonbroadcast_denial_suite", state: "LOCAL_ONLY", safeSummary: "Prepare policy-denial cases; do not sign or broadcast during Phase 4B-1." },
    ],
    nextGate: missingEnvironment.length === 0 ? "USER_REMOTE_PROVISION_CONFIRMATION" as const : "USER_PRIVY_DASHBOARD_SETUP" as const,
    remoteMutationsPerformed: false as const,
    signingPerformed: false as const,
    broadcastPerformed: false as const,
  };
  return PrivySetupDryRunPlanSchema.parse({ ...body, confirmationHash: hashCanonical(body) });
}

const DenialCaseSchema = z
  .object({
    caseId: IdentSchema,
    expected: z.literal("PRIVY_DENY"),
    status: z.literal("NOT_ATTEMPTED"),
    requiresUserApproval: z.literal(true),
  })
  .strict();

export const PrivyDenialDryRunPlanSchema = z
  .object({
    mode: z.literal("dry-run"),
    warning: z.string().min(1).max(500),
    cases: z.array(DenialCaseSchema).length(11),
    signingPerformed: z.literal(false),
    broadcastPerformed: z.literal(false),
  })
  .strict();

export function buildPrivyDenialDryRunPlan(): z.infer<typeof PrivyDenialDryRunPlanSchema> {
  const caseIds = [
    "wrong_chain",
    "wrong_recipient",
    "wrong_contract",
    "unknown_selector",
    "amount_above_limit",
    "unexpected_native_value",
    "unlimited_approval",
    "arbitrary_message_signing",
    "private_key_export",
    "revoked_signer",
    "expired_authorization",
  ] as const;
  return PrivyDenialDryRunPlanSchema.parse({
    mode: "dry-run",
    warning: "Simulation failures are not policy-denial evidence. Live cases remain blocked until a user approves a verified non-broadcast test design.",
    cases: caseIds.map((caseId) => ({ caseId, expected: "PRIVY_DENY", status: "NOT_ATTEMPTED", requiresUserApproval: true })),
    signingPerformed: false,
    broadcastPerformed: false,
  });
}

const RevocationStepSchema = z
  .object({
    order: z.number().int().min(1).max(10),
    action: z.enum(["verify_zero_balance", "reconcile_pending_actions", "archive_wallet", "delete_policy", "revoke_key_in_dashboard"]),
    state: z.literal("REQUIRES_USER_CONFIRMATION"),
  })
  .strict();

export const PrivyRevokeDryRunPlanSchema = z
  .object({
    mode: z.literal("dry-run"),
    status: z.enum(["NOT_CONFIGURED", "READY_FOR_CONFIRMATION"]),
    walletId: PrivyCuidSchema.nullable(),
    walletAddress: EvmAddressSchema.nullable(),
    policyId: PrivyCuidSchema.nullable(),
    policyHash: Bytes32Schema.nullable(),
    steps: z.array(RevocationStepSchema).max(5),
    confirmationHash: Bytes32Schema.nullable(),
    remoteMutationsPerformed: z.literal(false),
    signingPerformed: z.literal(false),
    broadcastPerformed: z.literal(false),
  })
  .strict();

export function buildPrivyRevokeDryRunPlan(state: PrivyDemoPublicState | null): z.infer<typeof PrivyRevokeDryRunPlanSchema> {
  if (state === null) {
    return PrivyRevokeDryRunPlanSchema.parse({
      mode: "dry-run",
      status: "NOT_CONFIGURED",
      walletId: null,
      walletAddress: null,
      policyId: null,
      policyHash: null,
      steps: [],
      confirmationHash: null,
      remoteMutationsPerformed: false,
      signingPerformed: false,
      broadcastPerformed: false,
    });
  }
  const target = {
    walletId: state.walletId,
    walletAddress: state.walletAddress,
    policyId: state.policyId,
    policyHash: state.policyHash,
  };
  const steps = [
    { order: 1, action: "verify_zero_balance" as const, state: "REQUIRES_USER_CONFIRMATION" as const },
    { order: 2, action: "reconcile_pending_actions" as const, state: "REQUIRES_USER_CONFIRMATION" as const },
    { order: 3, action: "archive_wallet" as const, state: "REQUIRES_USER_CONFIRMATION" as const },
    { order: 4, action: "delete_policy" as const, state: "REQUIRES_USER_CONFIRMATION" as const },
    { order: 5, action: "revoke_key_in_dashboard" as const, state: "REQUIRES_USER_CONFIRMATION" as const },
  ];
  return PrivyRevokeDryRunPlanSchema.parse({
    mode: "dry-run",
    status: "READY_FOR_CONFIRMATION",
    ...target,
    steps,
    confirmationHash: hashCanonical({ operation: "revoke-privy-demo", target, steps }),
    remoteMutationsPerformed: false,
    signingPerformed: false,
    broadcastPerformed: false,
  });
}
