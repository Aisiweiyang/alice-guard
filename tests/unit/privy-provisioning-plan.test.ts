import { describe, expect, it } from "vitest";

import {
  buildPrivyDenialDryRunPlan,
  buildPrivyRevokeDryRunPlan,
  buildPrivySetupDryRunPlan,
} from "../../src/application/privy-provisioning-plan";
import { PrivyLiveEnvironmentSchema } from "../../src/config/privy-live";
import { hashCanonical } from "../../src/domain/hash";

const RESOURCE_ID = "a".repeat(24);
const PRIVATE_KEY = Buffer.from("safe-test-pkcs8-placeholder-value").toString("base64");

describe("Privy Phase 4B-1 dry-run plans", () => {
  it("stays local and lists missing dashboard setup", () => {
    const config = PrivyLiveEnvironmentSchema.parse({
      mode: "disabled",
      appId: null,
      appSecret: null,
      authorizationKeyId: null,
      authorizationPrivateKey: null,
      policyId: null,
      walletId: null,
    });

    const plan = buildPrivySetupDryRunPlan(config);
    expect(plan.status).toBe("READY_FOR_USER_SETUP");
    expect(plan.nextGate).toBe("USER_PRIVY_DASHBOARD_SETUP");
    expect(plan.missingEnvironment).toHaveLength(4);
    expect(plan.steps).toHaveLength(6);
    expect(plan.remoteMutationsPerformed).toBe(false);
    expect(plan.signingPerformed).toBe(false);
    expect(plan.broadcastPerformed).toBe(false);
  });

  it("produces a deterministic confirmation-bound plan without applying it", () => {
    const config = PrivyLiveEnvironmentSchema.parse({
      mode: "privy-provision",
      appId: "alice-test-app",
      appSecret: "test-secret-value-with-enough-length",
      authorizationKeyId: RESOURCE_ID,
      authorizationPrivateKey: PRIVATE_KEY,
      policyId: null,
      walletId: null,
    });

    const first = buildPrivySetupDryRunPlan(config);
    const second = buildPrivySetupDryRunPlan(config);
    expect(first.status).toBe("READY_FOR_CONFIRMATION");
    expect(first.missingEnvironment).toEqual([]);
    expect(first.confirmationHash).toBe(second.confirmationHash);
    expect(first.policyCreateIdempotencyKey).toBe(second.policyCreateIdempotencyKey);
    expect(JSON.stringify(first)).not.toContain(config.appSecret);
    expect(JSON.stringify(first)).not.toContain(config.authorizationPrivateKey);
  });

  it("keeps every denial case unattempted and approval-gated", () => {
    const plan = buildPrivyDenialDryRunPlan();
    expect(plan.cases).toHaveLength(11);
    expect(plan.cases.every((item) => item.status === "NOT_ATTEMPTED" && item.requiresUserApproval)).toBe(true);
    expect(plan.warning).toContain("Simulation failures are not policy-denial evidence");
    expect(plan.signingPerformed).toBe(false);
    expect(plan.broadcastPerformed).toBe(false);
  });

  it("creates only a deterministic revoke plan for configured public state", () => {
    expect(buildPrivyRevokeDryRunPlan(null).status).toBe("NOT_CONFIGURED");
    const now = "2026-09-14T00:00:00.000Z";
    const state = {
      schemaVersion: "phase4b.state.v1" as const,
      revision: 1,
      status: "VERIFIED" as const,
      appIdFingerprint: hashCanonical("app"),
      policyHash: hashCanonical("policy"),
      policyId: "p".repeat(24),
      walletId: "w".repeat(24),
      walletAddress: `0x${"12".repeat(20)}` as const,
      ownerId: "o".repeat(24),
      chainId: 10143 as const,
      createdAt: now,
      updatedAt: now,
    };

    const plan = buildPrivyRevokeDryRunPlan(state);
    expect(plan.status).toBe("READY_FOR_CONFIRMATION");
    expect(plan.steps).toHaveLength(5);
    expect(plan.steps.every((step) => step.state === "REQUIRES_USER_CONFIRMATION")).toBe(true);
    expect(plan.remoteMutationsPerformed).toBe(false);
    expect(plan.confirmationHash).toBe(buildPrivyRevokeDryRunPlan(state).confirmationHash);
  });
});
