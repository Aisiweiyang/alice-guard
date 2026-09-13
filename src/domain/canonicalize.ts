const UNSIGNED_DECIMAL = /^(0|[1-9][0-9]*)(?:\.([0-9]+))?$/;
const UNSIGNED_INTEGER = /^(0|[1-9][0-9]*)$/;

export const USD_DECIMALS = 6;

export function normalizeUnsignedDecimal(value: string): string {
  const match = UNSIGNED_DECIMAL.exec(value);
  if (!match) {
    throw new Error("INVALID_UNSIGNED_DECIMAL");
  }

  const [integerPart, fractionPart = ""] = value.split(".");
  const normalizedFraction = fractionPart.replace(/0+$/, "");
  return normalizedFraction.length === 0 ? integerPart! : `${integerPart}.${normalizedFraction}`;
}

export function toScaledInteger(value: string, scale: number): bigint {
  if (!Number.isInteger(scale) || scale < 0 || scale > 255) {
    throw new Error("INVALID_SCALE");
  }

  const normalized = normalizeUnsignedDecimal(value);
  const [integerPart, fractionPart = ""] = normalized.split(".");
  if (fractionPart.length > scale) {
    throw new Error("TOO_MANY_DECIMAL_PLACES");
  }

  const digits = `${integerPart}${fractionPart.padEnd(scale, "0")}`;
  return BigInt(digits);
}

export function fromScaledInteger(value: bigint, scale: number): string {
  if (value < 0n || !Number.isInteger(scale) || scale < 0 || scale > 255) {
    throw new Error("INVALID_SCALED_INTEGER");
  }
  if (scale === 0) {
    return value.toString();
  }

  const padded = value.toString().padStart(scale + 1, "0");
  const integerPart = padded.slice(0, -scale);
  const fractionPart = padded.slice(-scale).replace(/0+$/, "");
  return fractionPart.length === 0 ? integerPart : `${integerPart}.${fractionPart}`;
}

export function compareUnsignedDecimals(left: string, right: string): -1 | 0 | 1 {
  const leftNormalized = normalizeUnsignedDecimal(left);
  const rightNormalized = normalizeUnsignedDecimal(right);
  const leftScale = leftNormalized.split(".")[1]?.length ?? 0;
  const rightScale = rightNormalized.split(".")[1]?.length ?? 0;
  const scale = Math.max(leftScale, rightScale);
  const leftInteger = toScaledInteger(leftNormalized, scale);
  const rightInteger = toScaledInteger(rightNormalized, scale);
  return leftInteger < rightInteger ? -1 : leftInteger > rightInteger ? 1 : 0;
}

export function addUnsignedDecimals(...values: readonly string[]): string {
  if (values.length === 0) {
    return "0";
  }

  const normalized = values.map(normalizeUnsignedDecimal);
  const scale = normalized.reduce((maximum, value) => Math.max(maximum, value.split(".")[1]?.length ?? 0), 0);
  const sum = normalized.reduce((total, value) => total + toScaledInteger(value, scale), 0n);
  return fromScaledInteger(sum, scale);
}

export function toUnsignedInteger(value: string): bigint {
  if (!UNSIGNED_INTEGER.test(value)) {
    throw new Error("INVALID_UNSIGNED_INTEGER");
  }
  return BigInt(value);
}

export function remainingAfterSpend(balanceRaw: string, spendRaw: string): bigint | null {
  const balance = toUnsignedInteger(balanceRaw);
  const spend = toUnsignedInteger(spendRaw);
  return spend > balance ? null : balance - spend;
}
