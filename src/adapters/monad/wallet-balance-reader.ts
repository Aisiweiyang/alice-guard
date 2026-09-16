import { createPublicClient, erc20Abi, http, type Address, type PublicClient } from "viem";
import { z } from "zod";

import { KURU_TESTNET_USDC } from "../../config/assets";
import { MONAD_TESTNET } from "../../config/networks";
import { EvmAddressSchema, UintStringSchema } from "../../domain/schemas";

export const WalletBalanceSnapshotSchema = z.object({
  chainId: z.literal(10143),
  blockNumber: UintStringSchema,
  nativeBalanceRaw: UintStringSchema,
  usdcBalanceRaw: UintStringSchema,
}).strict();

export type WalletBalanceSnapshot = z.infer<typeof WalletBalanceSnapshotSchema>;

export interface WalletBalanceReader {
  read(address: string): Promise<WalletBalanceSnapshot>;
}

const monadTestnetChain = {
  id: MONAD_TESTNET.id,
  name: MONAD_TESTNET.name,
  nativeCurrency: MONAD_TESTNET.nativeCurrency,
  rpcUrls: { default: { http: [MONAD_TESTNET.rpcUrl] } },
} as const;

export class ViemMonadWalletBalanceReader implements WalletBalanceReader {
  readonly #client: PublicClient;

  constructor(rpcUrl = MONAD_TESTNET.rpcUrl) {
    this.#client = createPublicClient({
      chain: monadTestnetChain,
      transport: http(rpcUrl, { timeout: 10_000, retryCount: 1 }),
    });
  }

  async read(candidateAddress: string): Promise<WalletBalanceSnapshot> {
    const address = EvmAddressSchema.parse(candidateAddress) as Address;
    if (KURU_TESTNET_USDC.kind !== "erc20") throw new Error("KURU_TESTNET_USDC_NOT_ERC20");
    const blockNumber = await this.#client.getBlockNumber();
    const [chainId, nativeBalance, usdcBalance] = await Promise.all([
      this.#client.getChainId(),
      this.#client.getBalance({ address, blockNumber }),
      this.#client.readContract({
        address: KURU_TESTNET_USDC.address as Address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address],
        blockNumber,
      }),
    ]);
    return WalletBalanceSnapshotSchema.parse({
      chainId,
      blockNumber: blockNumber.toString(),
      nativeBalanceRaw: nativeBalance.toString(),
      usdcBalanceRaw: usdcBalance.toString(),
    });
  }
}
