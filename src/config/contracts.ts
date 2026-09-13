import type { Address, Hex } from "viem";

export const ZERO_ADDRESS: Address = "0x0000000000000000000000000000000000000000";

const REGISTRY_URL =
  "https://raw.githubusercontent.com/monad-crypto/protocols/6a7e204f4e428c31a12f8453f7966ddc59f24b1b/protocols-testnet.csv";

const REGISTRY_HEAD_URL =
  "https://raw.githubusercontent.com/monad-crypto/protocols/refs/heads/main/protocols-testnet.csv";

export const KURU_TESTNET = Object.freeze({
  chainId: 10143,
  contractId: "kuru.testnet.swap",
  router: "0x7EFbE105Ca7415dE98F96622173458ac1c054630" as Address,
  monUsdcMarket: "0xa241896A7Dbe8a550D2E5fF7A914bB1989ceD2D9" as Address,
  marginAccount: "0xd029C2D98ff85D8F64799017fE00a59B1159CE02" as Address,
  sourceUrl: REGISTRY_URL,
  registryHeadUrl: REGISTRY_HEAD_URL,
  sourceRevision: "6a7e204f4e428c31a12f8453f7966ddc59f24b1b",
  routerAbiSourceUrl: "https://docs.kuru.io/contracts/Router",
  orderBookAbiSourceUrl:
    "https://raw.githubusercontent.com/Kuru-Labs/kuru-sdk/636509c2eafd63479d3f399703354e0d09f51e18/abi/OrderBook.json",
  abiRevision: "kuru-sdk@636509c2eafd63479d3f399703354e0d09f51e18",
  verifiedAt: "2026-09-13T12:00:00+08:00",
  codeIdentity: {
    observedAtBlock: "62103884",
    routerProxyCodeHash: "0xae572ec3ca9b5f49c0364ca34edc5880b6b2837e47802e64e6b681bf2e74aa5c" as Hex,
    marketProxyCodeHash: "0xae572ec3ca9b5f49c0364ca34edc5880b6b2837e47802e64e6b681bf2e74aa5c" as Hex,
    usdcCodeHash: "0xefd6505dcba0cb3b3375320d8f1a4120291dd9f05fbbdc97a9b6fb1d0e3d719e" as Hex,
    routerImplementation: "0xaaa0f0c4d49d09ef33ae758d88afab810ecbe1ed" as Address,
    marketImplementation: "0x72cae0a99c19b574e8a6de558f43fc1d019c9374" as Address,
    routerImplementationCodeHash: "0xadf3e1f5d9bc07f55d68556f5cca8b9c68381716f932f9b49169e152690583b9" as Hex,
    marketImplementationCodeHash: "0x24c5974f233021f00d607bfa191d430f79565663fb90805ebcfca52de7333500" as Hex,
  },
});

export const PHASE3_GAS_LIMITS = Object.freeze({
  approveMax: 150_000n,
  swapMax: 1_000_000n,
});
