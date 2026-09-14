import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  assertPublicStateContainsNoSecrets,
  PrivyPublicStateStore,
  type PrivyDemoPublicState,
} from "../../src/adapters/privy/privy-public-state";
import { hashCanonical } from "../../src/domain/hash";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

function validState(): PrivyDemoPublicState {
  return {
    schemaVersion: "phase4b.state.v1",
    revision: 1,
    status: "VERIFIED",
    appIdFingerprint: hashCanonical("app"),
    policyHash: hashCanonical("policy"),
    policyId: "p".repeat(24),
    walletId: "w".repeat(24),
    walletAddress: `0x${"12".repeat(20)}`,
    ownerId: "o".repeat(24),
    chainId: 10143,
    createdAt: "2026-09-14T00:00:00.000Z",
    updatedAt: "2026-09-14T00:00:00.000Z",
  };
}

describe("Privy public state store", () => {
  it("round-trips only the strict public projection", async () => {
    const directory = await mkdtemp(join(tmpdir(), "alice-privy-state-"));
    directories.push(directory);
    const path = join(directory, "state.json");
    const store = new PrivyPublicStateStore(path);
    expect(await store.read()).toBeNull();
    await store.write(validState());
    expect(await store.read()).toEqual(validState());
    const serialized = await readFile(path, "utf8");
    expect(serialized).not.toMatch(/secret|private.?key|mnemonic|signature/iu);
  });

  it("rejects secret-shaped keys and private-key values", () => {
    expect(() => assertPublicStateContainsNoSecrets({ appSecret: "should-not-exist" })).toThrow("PRIVY_PUBLIC_STATE_FORBIDDEN_KEY");
    expect(() => assertPublicStateContainsNoSecrets({ value: "-----BEGIN PRIVATE KEY-----" })).toThrow("PRIVY_PUBLIC_STATE_FORBIDDEN_VALUE");
  });

  it("fails closed on malformed or extra persisted fields", async () => {
    const directory = await mkdtemp(join(tmpdir(), "alice-privy-state-"));
    directories.push(directory);
    const path = join(directory, "state.json");
    await writeFile(path, JSON.stringify({ ...validState(), unexpected: true }), "utf8");
    await expect(new PrivyPublicStateStore(path).read()).rejects.toThrow();
  });
});
