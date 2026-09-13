import { AssetSchema, type Asset } from "../domain/schemas";

const REGISTRY_REVISION = "6a7e204f4e428c31a12f8453f7966ddc59f24b1b";
const REGISTRY_URL =
  `https://raw.githubusercontent.com/monad-crypto/protocols/${REGISTRY_REVISION}/protocols-testnet.csv`;

export const MONAD_TESTNET_NATIVE_MON: Asset = AssetSchema.parse({
  kind: "native",
  assetId: "monad-testnet:MON",
  chainId: 10143,
  symbol: "MON",
  name: "Monad",
  decimals: 18,
  metadata: {
    sourceUrl: "https://docs.monad.xyz/developer-essentials/testnet",
    sourceRevision: "retrieved-2026-09-13",
    verifiedAt: "2026-09-13T12:00:00+08:00",
  },
});

/**
 * Kuru's post-reset MON/USDC market uses this protocol test token. It is not
 * Circle's separately registered testnet USDC (0x534b...). The distinct
 * assetId prevents symbol-only resolution from collapsing the two assets.
 */
export const KURU_TESTNET_USDC: Asset = AssetSchema.parse({
  kind: "erc20",
  assetId: "monad-testnet:KURU-USDC",
  chainId: 10143,
  address: "0x3bA3d39AFcf8bb994f7964B3e0171Ea2Ba361570",
  symbol: "USDC",
  name: "Kuru Testnet USDC",
  decimals: 6,
  metadata: {
    sourceUrl: REGISTRY_URL,
    sourceRevision: REGISTRY_REVISION,
    verifiedAt: "2026-09-13T12:00:00+08:00",
  },
});

export const PHASE3_ASSETS = Object.freeze({
  MON: MONAD_TESTNET_NATIVE_MON,
  KURU_USDC: KURU_TESTNET_USDC,
});
