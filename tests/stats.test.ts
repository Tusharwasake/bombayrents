import { describe, expect, it } from "vitest";
import { formatINR, median, pinsInBounds, statsByBhk, Bounds } from "@/lib/stats";
import { RentPin } from "@/lib/types";

function pin(overrides: Partial<RentPin>): RentPin {
  return {
    id: "x",
    lat: 19.0,
    lng: 72.85,
    rent: 30000,
    deposit: null,
    bhk: "1BHK",
    housing_type: "Society",
    furnishing: null,
    maintenance_included: null,
    gated: null,
    tenant_type: null,
    pets: null,
    parking_count: null,
    sqft: null,
    society: null,
    note: null,
    rating_sum: 0,
    rating_count: 0,
    report_count: 0,
    created_at: "2026-01-15T00:00:00.000Z",
    ...overrides,
  };
}

describe("median", () => {
  it("returns null for an empty list", () => {
    expect(median([])).toBeNull();
  });
  it("returns the single element", () => {
    expect(median([42])).toBe(42);
  });
  it("returns the middle of an odd-length list", () => {
    expect(median([30, 10, 20])).toBe(20);
  });
  it("averages the two middle values of an even-length list", () => {
    expect(median([10, 20, 30, 100])).toBe(25);
  });
  it("handles unsorted input and duplicates", () => {
    expect(median([5, 1, 5, 1])).toBe(3);
  });
  it("does not mutate its input", () => {
    const input = [3, 1, 2];
    median(input);
    expect(input).toEqual([3, 1, 2]);
  });
});

describe("pinsInBounds", () => {
  const b: Bounds = { north: 19.1, south: 19.0, east: 72.9, west: 72.8 };
  it("keeps pins strictly inside", () => {
    expect(pinsInBounds([pin({ lat: 19.05, lng: 72.85 })], b)).toHaveLength(1);
  });
  it("includes pins exactly on every boundary", () => {
    for (const p of [
      pin({ lat: 19.1, lng: 72.85 }),
      pin({ lat: 19.0, lng: 72.85 }),
      pin({ lat: 19.05, lng: 72.9 }),
      pin({ lat: 19.05, lng: 72.8 }),
    ]) {
      expect(pinsInBounds([p], b)).toHaveLength(1);
    }
  });
  it("excludes pins outside each edge", () => {
    for (const p of [
      pin({ lat: 19.11 }),
      pin({ lat: 18.99 }),
      pin({ lng: 72.91 }),
      pin({ lng: 72.79 }),
    ]) {
      expect(pinsInBounds([p], b)).toHaveLength(0);
    }
  });
  it("returns empty for an empty list", () => {
    expect(pinsInBounds([], b)).toEqual([]);
  });
});

describe("statsByBhk", () => {
  it("returns empty for no pins", () => {
    expect(statsByBhk([])).toEqual([]);
  });
  it("skips BHK groups with no pins", () => {
    const stats = statsByBhk([pin({ bhk: "2BHK", rent: 40000 })]);
    expect(stats).toHaveLength(1);
    expect(stats[0].bhk).toBe("2BHK");
  });
  it("computes median rent per group", () => {
    const stats = statsByBhk([
      pin({ bhk: "1BHK", rent: 20000 }),
      pin({ bhk: "1BHK", rent: 30000 }),
      pin({ bhk: "1BHK", rent: 100000 }),
      pin({ bhk: "2BHK", rent: 50000 }),
    ]);
    const oneBhk = stats.find((s) => s.bhk === "1BHK")!;
    expect(oneBhk.count).toBe(3);
    expect(oneBhk.medianRent).toBe(30000);
    expect(stats.find((s) => s.bhk === "2BHK")!.medianRent).toBe(50000);
  });
  it("ignores null deposits in the deposit median, null when none", () => {
    const stats = statsByBhk([
      pin({ bhk: "1BHK", deposit: null }),
      pin({ bhk: "1BHK", deposit: 100000 }),
      pin({ bhk: "2BHK", deposit: null }),
    ]);
    expect(stats.find((s) => s.bhk === "1BHK")!.medianDeposit).toBe(100000);
    expect(stats.find((s) => s.bhk === "2BHK")!.medianDeposit).toBeNull();
  });
  it("orders groups by BHK size", () => {
    const stats = statsByBhk([
      pin({ bhk: "4BHK+" }),
      pin({ bhk: "1RK" }),
      pin({ bhk: "2BHK" }),
    ]);
    expect(stats.map((s) => s.bhk)).toEqual(["1RK", "2BHK", "4BHK+"]);
  });
});

describe("formatINR", () => {
  it("uses Indian digit grouping", () => {
    expect(formatINR(150000)).toBe("₹1,50,000");
    expect(formatINR(10000000)).toBe("₹1,00,00,000");
  });
  it("rounds fractions", () => {
    expect(formatINR(999.6)).toBe("₹1,000");
  });
  it("handles zero", () => {
    expect(formatINR(0)).toBe("₹0");
  });
});
