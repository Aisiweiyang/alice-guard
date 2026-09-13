import type { Address } from "viem";

import { KURU_TESTNET } from "../../config/contracts";
import { KURU_TESTNET_USDC } from "../../config/assets";

export interface RegistryExpectation {
  contract: string;
  address: Address;
}

export interface VerifiedRegistryEntry extends RegistryExpectation {
  protocol: "Kuru";
}

function configuredUsdcAddress(): Address {
  if (KURU_TESTNET_USDC.kind !== "erc20") throw new Error("INVALID_ASSET_CONFIGURATION");
  return KURU_TESTNET_USDC.address as Address;
}

export const KURU_TESTNET_REGISTRY_EXPECTATIONS: readonly RegistryExpectation[] = Object.freeze([
  { contract: "Router", address: KURU_TESTNET.router },
  { contract: "MarginAccount", address: KURU_TESTNET.marginAccount },
  { contract: "Market-MON/USDC", address: KURU_TESTNET.monUsdcMarket },
  { contract: "USDC", address: configuredUsdcAddress() },
  { contract: "OrderBookImpl", address: KURU_TESTNET.codeIdentity.marketImplementation },
]);

/**
 * Validates the small Kuru slice of Monad's registry. Expected rows contain no
 * quoted commas, so rejecting any non-six-column Kuru row is safer than silently
 * applying a permissive CSV parser at this trust boundary.
 */
export function verifyKuruTestnetRegistry(
  csv: string,
  expectations: readonly RegistryExpectation[] = KURU_TESTNET_REGISTRY_EXPECTATIONS,
): readonly VerifiedRegistryEntry[] {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (lines[0] !== "name,ctype,csubtype,contract,address,all_categories") {
    throw new Error("REGISTRY_HEADER_MISMATCH");
  }

  const kuruRows = lines.slice(1).filter((line) => line.startsWith("Kuru,"));
  const parsed = kuruRows.map((line) => {
    const cells = line.split(",");
    if (cells.length !== 6) throw new Error("REGISTRY_KURU_ROW_INVALID");
    return { contract: cells[3]!, address: cells[4]! };
  });

  return expectations.map((expected) => {
    const matches = parsed.filter((row) => row.contract === expected.contract);
    if (matches.length !== 1) throw new Error(`REGISTRY_ENTRY_COUNT_MISMATCH:${expected.contract}`);
    if (matches[0]!.address.toLowerCase() !== expected.address.toLowerCase()) {
      throw new Error(`REGISTRY_ADDRESS_MISMATCH:${expected.contract}`);
    }
    return { protocol: "Kuru", ...expected };
  });
}
