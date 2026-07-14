import { describe, expect, it } from "vitest";
import { isWaterPoint } from "@/lib/water";

// Coordinates chosen to be unambiguous — well inland or well offshore.
describe("isWaterPoint", () => {
  it("treats central land locations as land", () => {
    expect(isWaterPoint(19.0178, 72.8478)).toBe(false); // Dadar station area
    expect(isWaterPoint(19.1176, 72.906)).toBe(false); // Powai
    expect(isWaterPoint(19.0473, 73.0699)).toBe(false); // Kharghar
  });

  it("treats the open Arabian Sea as water", () => {
    expect(isWaterPoint(19.0, 72.65)).toBe(true); // ~15km offshore
    expect(isWaterPoint(18.85, 72.7)).toBe(true); // sea south-west of the city
  });

  it("treats Thane creek (between Mumbai and Navi Mumbai) as water", () => {
    expect(isWaterPoint(19.08, 72.975)).toBe(true);
  });

  it("returns false (pickable) outside the mask's coverage", () => {
    expect(isWaterPoint(28.6139, 77.209)).toBe(false); // Delhi
    expect(isWaterPoint(0, 0)).toBe(false);
  });

  it("keeps shoreline landmarks pickable (conservative mask)", () => {
    expect(isWaterPoint(18.9067, 72.8147)).toBe(false); // Colaba
    expect(isWaterPoint(19.2307, 72.8567)).toBe(false); // Borivali
  });
});
