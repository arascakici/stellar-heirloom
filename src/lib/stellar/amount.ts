/**
 * XLM has exactly 7 decimal places, and the smallest unit is a stroop. Balances
 * arrive from Horizon as decimal strings; doing arithmetic on them as floats
 * quietly loses stroops, so everything here converts to integers first.
 */
export const STROOPS_PER_XLM = 10_000_000n;

export function toStroops(amount: string): bigint {
  const [whole, fraction = ""] = amount.split(".");
  const padded = fraction.padEnd(7, "0").slice(0, 7);
  return BigInt(whole) * STROOPS_PER_XLM + BigInt(padded || "0");
}

export function fromStroops(stroops: bigint): string {
  const negative = stroops < 0n;
  const value = negative ? -stroops : stroops;
  const whole = value / STROOPS_PER_XLM;
  const fraction = (value % STROOPS_PER_XLM).toString().padStart(7, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

/**
 * Trims trailing zeros so a balance reads like a number a person would say,
 * while never rounding away a value that is small but not zero.
 */
export function formatXlm(amount: string): string {
  const [whole, fraction = ""] = amount.split(".");
  const trimmed = fraction.replace(/0+$/, "");
  const grouped = BigInt(whole).toLocaleString("en-US");
  return trimmed ? `${grouped}.${trimmed}` : grouped;
}
