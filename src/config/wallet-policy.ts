import { z } from "zod";

import { KURU_TESTNET_USDC } from "./assets";
import { KURU_TESTNET, ZERO_ADDRESS } from "./contracts";

const tokenAddress = KURU_TESTNET_USDC.kind === "erc20" ? KURU_TESTNET_USDC.address : ZERO_ADDRESS;

export const WalletPolicyConfigSchema = z
  .object({
    name: z.literal("Alice Guard Monad Testnet Kuru Boundary"),
    chainId: z.literal(10143),
    tokenAddress: z.literal(tokenAddress),
    routerAddress: z.literal(KURU_TESTNET.router),
    marketAddress: z.literal(KURU_TESTNET.monUsdcMarket),
    creditTokenAddress: z.literal(ZERO_ADDRESS),
    maxInputRaw: z.literal("100000000"),
  })
  .strict();

export const DEFAULT_WALLET_POLICY_CONFIG = WalletPolicyConfigSchema.parse({
  name: "Alice Guard Monad Testnet Kuru Boundary",
  chainId: 10143,
  tokenAddress,
  routerAddress: KURU_TESTNET.router,
  marketAddress: KURU_TESTNET.monUsdcMarket,
  creditTokenAddress: ZERO_ADDRESS,
  maxInputRaw: "100000000",
});

export type WalletPolicyConfig = z.infer<typeof WalletPolicyConfigSchema>;
