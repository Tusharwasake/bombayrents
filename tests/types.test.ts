import { afterEach, describe, expect, it, vi } from "vitest";
import { daysAgo, inrShort } from "@/lib/types";

describe("inrShort", () => {
  it("keeps values under 1,000 as-is", () => {
    expect(inrShort(0)).toBe("0");
    expect(inrShort(999)).toBe("999");
  });
  it("formats thousands as K", () => {
    expect(inrShort(1000)).toBe("1K");
    expect(inrShort(1499)).toBe("1K");
    expect(inrShort(1500)).toBe("2K"); // rounds
    expect(inrShort(35000)).toBe("35K");
    expect(inrShort(99999)).toBe("100K");
  });
  it("formats lakhs as L with one decimal under 10L", () => {
    expect(inrShort(100000)).toBe("1L");
    expect(inrShort(120000)).toBe("1.2L");
    expect(inrShort(950000)).toBe("9.5L");
  });
  it("drops the decimal at 10L and above", () => {
    expect(inrShort(1000000)).toBe("10L");
    expect(inrShort(1550000)).toBe("16L");
    expect(inrShort(2000000)).toBe("20L");
  });
});

describe("daysAgo", () => {
  afterEach(() => vi.useRealTimers());

  function at(now: string) {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now));
  }

  it("says 'today' for the same day", () => {
    at("2026-07-14T18:00:00Z");
    expect(daysAgo("2026-07-14T06:00:00Z")).toBe("today");
  });
  it("uses days under a month", () => {
    at("2026-07-14T00:00:00Z");
    expect(daysAgo("2026-07-09T00:00:00Z")).toBe("5d ago");
    expect(daysAgo("2026-06-15T00:00:00Z")).toBe("29d ago");
  });
  it("uses months under a year", () => {
    at("2026-07-14T00:00:00Z");
    expect(daysAgo("2026-05-30T00:00:00Z")).toBe("1mo ago");
    expect(daysAgo("2025-08-20T00:00:00Z")).toBe("10mo ago");
  });
  it("uses years beyond that", () => {
    at("2026-07-14T00:00:00Z");
    expect(daysAgo("2024-07-01T00:00:00Z")).toBe("2y ago");
  });
  it("clamps future timestamps to 'today' instead of negative days", () => {
    at("2026-07-14T00:00:00Z");
    expect(daysAgo("2026-07-20T00:00:00Z")).toBe("today");
  });
});
