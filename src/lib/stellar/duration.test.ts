import { describe, expect, it } from "vitest";

import { formatDuration, humanizeApprox } from "./duration";

describe("formatDuration", () => {
  it("says a period back in the unit it was set in", () => {
    expect(formatDuration(2_592_000n)).toBe("30 days");
    expect(formatDuration(21_600n)).toBe("6 hours");
    expect(formatDuration(300n)).toBe("5 minutes");
  });

  it("drops the plural for exactly one", () => {
    expect(formatDuration(86_400n)).toBe("1 day");
    expect(formatDuration(3_600n)).toBe("1 hour");
    expect(formatDuration(60n)).toBe("1 minute");
    expect(formatDuration(1n)).toBe("1 second");
  });

  it("falls to the largest unit that divides evenly, not the largest that fits", () => {
    // 25 hours is more than a day, but a day does not divide it.
    expect(formatDuration(90_000n)).toBe("25 hours");
    // 90 minutes is more than an hour, likewise.
    expect(formatDuration(5_400n)).toBe("90 minutes");
    // And a prime number of seconds stays seconds.
    expect(formatDuration(97n)).toBe("97 seconds");
  });

  it("has a phrase for nothing at all", () => {
    expect(formatDuration(0n)).toBe("no time");
    expect(formatDuration(-5n)).toBe("no time");
  });

  it("handles periods far beyond a lifetime without losing precision", () => {
    // The reason these are bigints: this is past 2^53 milliseconds.
    expect(formatDuration(86_400n * 100_000_000n)).toBe("100000000 days");
  });
});

describe("humanizeApprox", () => {
  it("reports the largest whole unit that fits", () => {
    expect(humanizeApprox(2_592_000)).toBe("30 days");
    expect(humanizeApprox(90_000)).toBe("1 day");
    expect(humanizeApprox(5_400)).toBe("1 hour");
    expect(humanizeApprox(90)).toBe("1 minute");
    expect(humanizeApprox(30)).toBe("30 seconds");
  });

  it("rounds down rather than up, so nothing reads as more time than there is", () => {
    expect(humanizeApprox(172_799)).toBe("1 day");
    expect(humanizeApprox(119)).toBe("1 minute");
  });

  it("never reports negative time", () => {
    expect(humanizeApprox(-1)).toBe("0 seconds");
    expect(humanizeApprox(-99_999)).toBe("0 seconds");
  });

  it("takes fractional seconds without showing them", () => {
    expect(humanizeApprox(59.9)).toBe("59 seconds");
  });
});
