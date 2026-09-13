import { describe, expect, it } from "vitest";

import {
  addUnsignedDecimals,
  compareUnsignedDecimals,
  fromScaledInteger,
  normalizeUnsignedDecimal,
  remainingAfterSpend,
  toScaledInteger,
} from "../../src/domain/canonicalize";

describe("canonical decimal arithmetic", () => {
  it("normalizes trailing fractional zeroes", () => {
    expect(normalizeUnsignedDecimal("100.0001000")).toBe("100.0001");
  });

  it("compares decimal limits exactly without floating point", () => {
    expect(compareUnsignedDecimals("100", "100.000000")).toBe(0);
    expect(compareUnsignedDecimals("100.000001", "100")).toBe(1);
    expect(compareUnsignedDecimals("99.999999", "100")).toBe(-1);
  });

  it("handles integers larger than Number.MAX_SAFE_INTEGER", () => {
    expect(compareUnsignedDecimals("900719925474099312345", "900719925474099312344")).toBe(1);
  });

  it("adds values with different scales exactly", () => {
    expect(addUnsignedDecimals("150", "10.25", "39.75")).toBe("200");
  });

  it("converts fixed-scale USD without rounding", () => {
    expect(toScaledInteger("20.123456", 6)).toBe(20_123_456n);
    expect(fromScaledInteger(20_123_456n, 6)).toBe("20.123456");
    expect(() => toScaledInteger("1.0000001", 6)).toThrow("TOO_MANY_DECIMAL_PLACES");
  });

  it("returns null rather than underflowing an insufficient balance", () => {
    expect(remainingAfterSpend("10", "11")).toBeNull();
    expect(remainingAfterSpend("10", "10")).toBe(0n);
  });
});
