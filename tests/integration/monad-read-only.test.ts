import { keccak256 } from "viem";
import { describe, expect, it } from "vitest";

import {
  verifyMonadTestnetDeployment,
  type MonadReadPort,
} from "../../src/adapters/monad/read-only-client";
import type { PlannedTransaction } from "../../src/domain/schemas";
import type { SimulationResult } from "../../src/domain/planning";

const fakeIdentity = {
  routerProxyCodeHash: keccak256("0x6000"),
  marketProxyCodeHash: keccak256("0x6000"),
  usdcCodeHash: keccak256("0x6000"),
  routerImplementation: null,
  marketImplementation: null,
  routerImplementationCodeHash: null,
  marketImplementationCodeHash: null,
};

function fakeClient(overrides: Partial<MonadReadPort> = {}): MonadReadPort {
  return {
    getChainId: async () => 10143,
    getBytecode: async () => "0x6000",
    getStorageAt: async () => undefined,
    readErc20Symbol: async () => "USDC",
    readErc20Decimals: async () => 6,
    readBestBidAsk: async () => [100n, 101n] as const,
    getBlockNumber: async () => 123456n,
    simulate: async (_transaction: PlannedTransaction): Promise<SimulationResult> => {
      throw new Error("not used");
    },
    ...overrides,
  };
}

describe("Monad read-only deployment verifier", () => {
  it("accepts code-bearing contracts and exact token metadata", async () => {
    await expect(verifyMonadTestnetDeployment(fakeClient(), fakeIdentity)).resolves.toMatchObject({
      chainId: 10143,
      usdcSymbol: "USDC",
      usdcDecimals: 6,
      hasQuotedLiquidity: true,
    });
  });

  it("rejects code identity drift", async () => {
    await expect(verifyMonadTestnetDeployment(fakeClient())).rejects.toThrow("DEPLOYMENT_IDENTITY_MISMATCH");
  });

  it("stops before reads when RPC reports the wrong chain", async () => {
    await expect(verifyMonadTestnetDeployment(fakeClient({ getChainId: async () => 143 }))).rejects.toThrow(
      "WRONG_CHAIN:143",
    );
  });

  it("rejects missing bytecode and mismatched decimals", async () => {
    await expect(
      verifyMonadTestnetDeployment(fakeClient({ getBytecode: async () => "0x" })),
    ).rejects.toThrow("CONFIGURED_CONTRACT_HAS_NO_CODE");
    await expect(
      verifyMonadTestnetDeployment(fakeClient({ readErc20Decimals: async () => 18 })),
    ).rejects.toThrow("ASSET_METADATA_MISMATCH:USDC:18");
  });
});
