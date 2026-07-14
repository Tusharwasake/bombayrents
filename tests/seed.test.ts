import { describe, expect, it } from "vitest";
import { generateSeedPins } from "@/lib/seed";
import { BHK_OPTIONS, HOUSING_OPTIONS } from "@/lib/types";

// The map is locked to the Mumbai Metropolitan Region; every seed pin must be
// inside it or demo mode shows pins the user can never see.
const MMR = { south: 18.75, north: 19.5, west: 72.6, east: 73.35 };

describe("generateSeedPins", () => {
  const pins = generateSeedPins();

  it("is deterministic across calls", () => {
    expect(generateSeedPins()).toEqual(pins);
  });

  it("produces a reasonable demo-sized dataset", () => {
    expect(pins.length).toBeGreaterThan(50);
    expect(pins.length).toBeLessThan(500);
  });

  it("gives every pin a unique id", () => {
    expect(new Set(pins.map((p) => p.id)).size).toBe(pins.length);
  });

  it("keeps every pin inside the MMR map bounds", () => {
    for (const p of pins) {
      expect(p.lat).toBeGreaterThanOrEqual(MMR.south);
      expect(p.lat).toBeLessThanOrEqual(MMR.north);
      expect(p.lng).toBeGreaterThanOrEqual(MMR.west);
      expect(p.lng).toBeLessThanOrEqual(MMR.east);
    }
  });

  it("keeps rents within the schema's allowed range", () => {
    for (const p of pins) {
      expect(p.rent).toBeGreaterThanOrEqual(1000);
      expect(p.rent).toBeLessThanOrEqual(2000000);
    }
  });

  it("uses only valid BHK and housing types", () => {
    for (const p of pins) {
      expect(BHK_OPTIONS).toContain(p.bhk);
      expect(HOUSING_OPTIONS).toContain(p.housing_type);
    }
  });

  it("keeps deposits non-negative when present", () => {
    for (const p of pins) {
      if (p.deposit !== null) expect(p.deposit).toBeGreaterThanOrEqual(0);
    }
  });

  it("keeps ratings internally consistent", () => {
    for (const p of pins) {
      expect(p.rating_count).toBeGreaterThanOrEqual(0);
      if (p.rating_count === 0) {
        expect(p.rating_sum).toBe(0);
      } else {
        // average must be a possible star value (1–5)
        const avg = p.rating_sum / p.rating_count;
        expect(avg).toBeGreaterThanOrEqual(1);
        expect(avg).toBeLessThanOrEqual(5);
      }
    }
  });

  it("never seeds a pin at or past the 3-report auto-hide threshold", () => {
    for (const p of pins) {
      expect(p.report_count).toBeLessThan(3);
    }
  });

  it("marks all pins as seed pins (report/rating no-op detection relies on it)", () => {
    for (const p of pins) {
      expect(p.id.startsWith("seed-")).toBe(true);
    }
  });
});
