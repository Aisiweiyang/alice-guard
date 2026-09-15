import { describe, expect, it } from "vitest";

import { parsePrivyProvisioningArguments } from "../../src/application/privy-provisioning-arguments";

const HASH = `0x${"ab".repeat(32)}`;

describe("parsePrivyProvisioningArguments", () => {
  it.each([
    ["direct invocation", ["--apply", `--confirmation-hash=${HASH}`]],
    ["pnpm separator", ["--", "--apply", `--confirmation-hash=${HASH}`]],
  ])("accepts one exact apply request via %s", (_name, arguments_) => {
    expect(parsePrivyProvisioningArguments(arguments_)).toEqual({
      allowed: true,
      confirmationHash: HASH,
    });
  });

  const invalidArgumentSets: string[][] = [
    [],
    ["--"],
    ["--apply"],
    [`--confirmation-hash=${HASH}`],
    ["--apply", "--apply", `--confirmation-hash=${HASH}`],
    ["--apply", `--confirmation-hash=${HASH}`, `--confirmation-hash=${HASH}`],
    ["--", "--", "--apply", `--confirmation-hash=${HASH}`],
    ["--apply", `--confirmation-hash=0x${"AB".repeat(32)}`],
    ["--apply", "--confirmation-hash=0xnot-a-hash"],
    ["--apply", `--confirmation-hash=${HASH}`, "--unexpected"],
  ];

  for (const arguments_ of invalidArgumentSets) {
    it(`rejects an ambiguous or malformed request: ${JSON.stringify(arguments_)}`, () => {
      expect(parsePrivyProvisioningArguments(arguments_)).toEqual({
        allowed: false,
        confirmationHash: "",
      });
    });
  }
});
