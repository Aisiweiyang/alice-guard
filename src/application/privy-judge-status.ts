import { z } from "zod";

import type { WalletBalanceReader, WalletBalanceSnapshot } from "../adapters/monad/wallet-balance-reader";
import type { PrivyDemoPublicState, PrivyPublicStateStore } from "../adapters/privy/privy-public-state";
import { compilePrivyPolicy } from "../adapters/privy/privy-policy-compiler";
import type { PrivyWalletBindingVerification } from "../adapters/privy/privy-policy-manager";
import type { PrivyLiveEnvironment } from "../config/privy-live";
import { DEFAULT_WALLET_POLICY_CONFIG } from "../config/wallet-policy";
import { MONAD_TESTNET } from "../config/networks";
import { hashCanonical } from "../domain/hash";
import { Bytes32Schema, EvmAddressSchema, IsoDateTimeSchema, IdentSchema, UintStringSchema } from "../domain/schemas";

const LiveCheckSchema = z.enum(["MATCHED", "DRIFTED", "NOT_CONFIGURED", "UNAVAILABLE"]);

export const PrivyJudgeStatusSchema = z.object({
  schemaVersion: z.literal("phase4c.status.v1"),
  mode: z.enum(["disabled", "live-read-only"]),
  status: z.enum(["VERIFIED", "DEGRADED", "NOT_CONFIGURED"]),
  network: z.object({
    name: z.literal("Monad Testnet"),
    chainId: z.literal(10143),
    explorerUrl: z.literal("https://testnet.monadvision.com"),
  }).strict(),
  wallet: z.object({
    id: z.string().length(24),
    address: EvmAddressSchema,
    ownerId: z.string().length(24),
    archived: z.boolean().nullable(),
  }).strict().nullable(),
  policy: z.object({
    id: z.string().length(24),
    expectedHash: Bytes32Schema,
    observedHash: Bytes32Schema.nullable(),
    bound: z.boolean().nullable(),
    ownerMatched: z.boolean().nullable(),
  }).strict().nullable(),
  balances: z.object({
    blockNumber: UintStringSchema,
    nativeSymbol: z.literal("MON"),
    nativeBalanceRaw: UintStringSchema,
    tokenSymbol: z.literal("USDC"),
    tokenBalanceRaw: UintStringSchema,
  }).strict().nullable(),
  liveChecks: z.object({
    publicState: LiveCheckSchema,
    remoteBinding: LiveCheckSchema,
    onchainBalances: LiveCheckSchema,
  }).strict(),
  checkedAt: IsoDateTimeSchema,
  safeReason: IdentSchema,
  capabilities: z.object({
    walletProvisioned: z.boolean(),
    signing: z.literal(false),
    broadcast: z.literal(false),
    funding: z.literal(false),
  }).strict(),
}).strict();

export type PrivyJudgeStatus = z.infer<typeof PrivyJudgeStatusSchema>;

export interface PrivyJudgeStatusProvider {
  read(): Promise<PrivyJudgeStatus>;
}

export interface WalletBindingVerifier {
  verifyWalletBinding(
    expected: ReturnType<typeof compilePrivyPolicy>,
    policyId: string | null,
    walletId: string | null,
    expectedOwnerId: string | null,
  ): Promise<PrivyWalletBindingVerification>;
}

const network = Object.freeze({
  name: MONAD_TESTNET.name,
  chainId: MONAD_TESTNET.id,
  explorerUrl: MONAD_TESTNET.explorerUrl,
});

function disabledStatus(now: Date, safeReason = "PRIVY_LIVE_STATUS_DISABLED"): PrivyJudgeStatus {
  return PrivyJudgeStatusSchema.parse({
    schemaVersion: "phase4c.status.v1",
    mode: "disabled",
    status: "NOT_CONFIGURED",
    network,
    wallet: null,
    policy: null,
    balances: null,
    liveChecks: {
      publicState: "NOT_CONFIGURED",
      remoteBinding: "NOT_CONFIGURED",
      onchainBalances: "NOT_CONFIGURED",
    },
    checkedAt: now.toISOString(),
    safeReason,
    capabilities: { walletProvisioned: false, signing: false, broadcast: false, funding: false },
  });
}

export class DisabledPrivyJudgeStatusProvider implements PrivyJudgeStatusProvider {
  readonly #now: () => Date;

  constructor(now: () => Date = () => new Date()) {
    this.#now = now;
  }

  read(): Promise<PrivyJudgeStatus> {
    return Promise.resolve(disabledStatus(this.#now()));
  }
}

function publicProjection(
  state: PrivyDemoPublicState,
  binding: PrivyWalletBindingVerification | null,
  balances: WalletBalanceSnapshot | null,
) {
  return {
    wallet: {
      id: state.walletId,
      address: state.walletAddress,
      ownerId: state.ownerId,
      archived: binding?.archived ?? null,
    },
    policy: {
      id: state.policyId,
      expectedHash: state.policyHash,
      observedHash: binding?.observedPolicyHash ?? null,
      bound: binding === null ? null : binding.policyBound,
      ownerMatched: binding === null ? null : binding.ownerMatched,
    },
    balances: balances === null ? null : {
      blockNumber: balances.blockNumber,
      nativeSymbol: "MON" as const,
      nativeBalanceRaw: balances.nativeBalanceRaw,
      tokenSymbol: "USDC" as const,
      tokenBalanceRaw: balances.usdcBalanceRaw,
    },
  };
}

function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("PRIVY_LIVE_STATUS_TIMEOUT")), timeoutMs);
    operation.then(
      (value) => { clearTimeout(timeout); resolve(value); },
      (error: unknown) => { clearTimeout(timeout); reject(error); },
    );
  });
}

export class LivePrivyJudgeStatusProvider implements PrivyJudgeStatusProvider {
  readonly #store: Pick<PrivyPublicStateStore, "read">;
  readonly #environment: PrivyLiveEnvironment;
  readonly #bindingVerifier: WalletBindingVerifier | null;
  readonly #balanceReader: WalletBalanceReader;
  readonly #now: () => Date;
  readonly #timeoutMs: number;
  readonly #cacheTtlMs: number;
  #cached: { expiresAt: number; value: PrivyJudgeStatus } | null = null;

  constructor(input: {
    store: Pick<PrivyPublicStateStore, "read">;
    environment: PrivyLiveEnvironment;
    bindingVerifier: WalletBindingVerifier | null;
    balanceReader: WalletBalanceReader;
    now?: () => Date;
    timeoutMs?: number;
    cacheTtlMs?: number;
  }) {
    this.#store = input.store;
    this.#environment = input.environment;
    this.#bindingVerifier = input.bindingVerifier;
    this.#balanceReader = input.balanceReader;
    this.#now = input.now ?? (() => new Date());
    this.#timeoutMs = input.timeoutMs ?? 12_000;
    this.#cacheTtlMs = input.cacheTtlMs ?? 15_000;
  }

  async read(): Promise<PrivyJudgeStatus> {
    const now = this.#now();
    if (this.#cached !== null && now.getTime() < this.#cached.expiresAt) return this.#cached.value;
    const state = await this.#store.read();
    if (state === null || state.walletId === null || state.walletAddress === null) return disabledStatus(now, "PRIVY_PUBLIC_STATE_NOT_CONFIGURED");

    const expected = compilePrivyPolicy(DEFAULT_WALLET_POLICY_CONFIG);
    const appFingerprint = this.#environment.appId === null ? null : hashCanonical({ appId: this.#environment.appId });
    const localMatched = state.status === "VERIFIED"
      && state.chainId === MONAD_TESTNET.id
      && state.policyHash === expected.walletPolicyHash
      && state.appIdFingerprint === appFingerprint
      && state.ownerId === this.#environment.authorizationKeyId;
    const canVerifyRemote = localMatched
      && this.#bindingVerifier !== null
      && this.#environment.appId !== null
      && this.#environment.appSecret !== null;

    const [bindingResult, balanceResult] = await Promise.allSettled([
      canVerifyRemote
        ? withTimeout(this.#bindingVerifier!.verifyWalletBinding(expected, state.policyId, state.walletId, state.ownerId), this.#timeoutMs)
        : Promise.reject(new Error("PRIVY_REMOTE_BINDING_NOT_CONFIGURED")),
      withTimeout(this.#balanceReader.read(state.walletAddress), this.#timeoutMs),
    ]);
    const binding = bindingResult.status === "fulfilled" ? bindingResult.value : null;
    const balances = balanceResult.status === "fulfilled" ? balanceResult.value : null;
    const bindingMatched = binding?.status === "MATCHED";
    const balanceMatched = balances?.chainId === MONAD_TESTNET.id;
    const verified = localMatched && bindingMatched && balanceMatched;
    const drifted = !localMatched || binding?.status === "DRIFTED";
    const projection = publicProjection(state, binding, balances);
    const value = PrivyJudgeStatusSchema.parse({
      schemaVersion: "phase4c.status.v1",
      mode: "live-read-only",
      status: verified ? "VERIFIED" : "DEGRADED",
      network,
      ...projection,
      liveChecks: {
        publicState: localMatched ? "MATCHED" : "DRIFTED",
        remoteBinding: binding?.status ?? (canVerifyRemote ? "UNAVAILABLE" : "NOT_CONFIGURED"),
        onchainBalances: balanceMatched ? "MATCHED" : "UNAVAILABLE",
      },
      checkedAt: now.toISOString(),
      safeReason: verified
        ? "PRIVY_LIVE_STATUS_VERIFIED"
        : drifted ? "PRIVY_LIVE_STATUS_DRIFTED" : "PRIVY_LIVE_STATUS_UNAVAILABLE",
      capabilities: { walletProvisioned: true, signing: false, broadcast: false, funding: false },
    });
    this.#cached = { expiresAt: now.getTime() + this.#cacheTtlMs, value };
    return value;
  }
}

export function unavailablePrivyJudgeStatus(now: Date = new Date()): PrivyJudgeStatus {
  return PrivyJudgeStatusSchema.parse({
    ...disabledStatus(now, "PRIVY_LIVE_STATUS_UNAVAILABLE"),
    mode: "live-read-only",
    status: "DEGRADED",
    safeReason: "PRIVY_LIVE_STATUS_UNAVAILABLE",
  });
}
