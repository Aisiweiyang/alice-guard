import { describe, expect, it } from "vitest";

import { verifyKuruTestnetRegistry } from "../../src/adapters/monad/registry-verifier";

const header = "name,ctype,csubtype,contract,address,all_categories";
const expectations = [
  { contract: "Router", address: "0x7EFbE105Ca7415dE98F96622173458ac1c054630" as const },
  { contract: "USDC", address: "0x3bA3d39AFcf8bb994f7964B3e0171Ea2Ba361570" as const },
];

const valid = [
  header,
  "Kuru,DeFi,DEX,Router,0x7efbe105ca7415de98f96622173458ac1c054630,DeFi::DEX",
  "Kuru,DeFi,DEX,USDC,0x3ba3d39afcf8bb994f7964b3e0171ea2ba361570,DeFi::DEX",
].join("\n");

describe("Monad registry drift verifier", () => {
  it("accepts the exact expected Kuru rows case-insensitively", () => {
    expect(verifyKuruTestnetRegistry(valid, expectations)).toHaveLength(2);
  });

  it("rejects address drift", () => {
    expect(() => verifyKuruTestnetRegistry(valid.replace("0x7efb", "0x0000"), expectations)).toThrow(
      "REGISTRY_ADDRESS_MISMATCH:Router",
    );
  });

  it("rejects duplicate and missing identities", () => {
    expect(() => verifyKuruTestnetRegistry(`${valid}\n${valid.split("\n")[1]}`, expectations)).toThrow(
      "REGISTRY_ENTRY_COUNT_MISMATCH:Router",
    );
    expect(() => verifyKuruTestnetRegistry(header, expectations)).toThrow("REGISTRY_ENTRY_COUNT_MISMATCH:Router");
  });
});
