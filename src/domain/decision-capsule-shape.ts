import { z } from "zod";

// Deliberately independent of domain/schemas to allow capsules in persisted audits.
const Hash = z.string().regex(/^0x[0-9a-f]{64}$/);
const Time = z.string().datetime({ offset: true });
export const ProvenanceSchema = z.object({
  evidenceId: z.string().min(1).max(128),
  sourceType: z.string().min(1).max(128),
  sourceId: z.string().min(1).max(128),
  observedAt: Time,
  blockNumber: z.string().regex(/^(0|[1-9][0-9]*)$/).nullable(),
  trustClass: z.enum(["USER_DIRECT", "CHAIN_VERIFIED", "SIGNED_PROVIDER", "APP_CONFIG", "MODEL_DERIVED", "UNTRUSTED_EXTERNAL", "OFFLINE_FIXTURE"]),
  contentHash: Hash,
  expiresAt: Time,
  validationStatus: z.enum(["FIXTURE_ONLY", "VERIFIED", "UNVERIFIED", "REJECTED"]),
}).strict();

export const DecisionCapsuleSchema = z.object({
  schemaVersion: z.literal("alice-guard.capsule.v1"),
  recordId: z.string().uuid(), requestId: z.string().uuid(),
  requestHash: Hash, intentHash: Hash, evidenceHash: Hash, evidenceRoot: Hash,
  riskConfigHash: Hash, applicationPolicyHash: Hash, policyDefinitionHash: Hash,
  walletPolicyHash: Hash, planHash: Hash.nullable(), simulationHash: Hash,
  approvalHash: Hash.nullable(), envelopeHash: Hash.nullable(), materialHash: Hash,
  chainId: z.literal(10143), walletAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  quoteBlockNumber: z.string().regex(/^(0|[1-9][0-9]*)$/), quoteExpiresAt: Time,
  decisionCreatedAt: Time, decisionExpiresAt: Time, executionNonce: z.string().uuid().nullable(),
  verdict: z.enum(["ALLOW", "DENY", "REQUIRE_APPROVAL"]),
  firedRuleIds: z.array(z.string().min(1).max(128)).max(128),
  safeReasonCodes: z.array(z.string().min(1).max(128)).max(128),
  enforcementCoverage: z.array(z.object({
    rule: z.string().min(1).max(128),
    enforcement: z.enum(["PRIVY_ENFORCED", "APP_ONLY", "UNSUPPORTED"]),
  }).strict()).max(32),
  attestation: z.object({ status: z.literal("UNATTESTED") }).strict(),
  capsuleHash: Hash,
}).strict();
export type DecisionCapsule = z.infer<typeof DecisionCapsuleSchema>;

export const ProofPresentationSchema = z.object({
  capsule: DecisionCapsuleSchema,
  verification: z.object({ok: z.boolean(), reasonCodes: z.array(z.string()), executionAuthorized: z.literal(false)}).strict(),
  provenance: z.array(ProvenanceSchema),
  limitation: z.string().min(1).max(1000),
}).strict();
