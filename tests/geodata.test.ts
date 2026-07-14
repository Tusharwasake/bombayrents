// The bundled transit GeoJSON must stay valid and inside the locked map area,
// or the overlay silently renders nothing.
import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const DATA_DIR = join(__dirname, "..", "public", "data");

// Slightly wider than MMR_BOUNDS — line geometry may legitimately poke past
// the viewport lock (e.g. Central Line towards Kalyan).
const LNG = [72.4, 73.6];
const LAT = [18.6, 19.7];

function load(name: string) {
  return JSON.parse(readFileSync(join(DATA_DIR, name), "utf8"));
}

describe("transit-lines.geojson", () => {
  const geo = load("transit-lines.geojson");

  it("is a FeatureCollection with all expected lines", () => {
    expect(geo.type).toBe("FeatureCollection");
    const names = geo.features.map((f: { properties: { name: string } }) => f.properties.name);
    for (const required of [
      "Western Line",
      "Central Line",
      "Harbour Line",
      "Trans-Harbour Line",
    ]) {
      expect(names).toContain(required);
    }
  });

  it("gives every line a color and a group", () => {
    for (const f of geo.features) {
      expect(f.properties.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(typeof f.properties.group).toBe("string");
    }
  });

  it("keeps all coordinates in the greater Mumbai area", () => {
    for (const f of geo.features) {
      for (const line of f.geometry.coordinates) {
        for (const [lng, lat] of line) {
          expect(lng).toBeGreaterThanOrEqual(LNG[0]);
          expect(lng).toBeLessThanOrEqual(LNG[1]);
          expect(lat).toBeGreaterThanOrEqual(LAT[0]);
          expect(lat).toBeLessThanOrEqual(LAT[1]);
        }
      }
    }
  });
});

describe("stations.geojson", () => {
  const geo = load("stations.geojson");

  it("has a healthy number of named stations", () => {
    expect(geo.features.length).toBeGreaterThan(100);
    for (const f of geo.features) {
      expect(f.properties.name).toBeTruthy();
      expect(["rail", "metro"]).toContain(f.properties.kind);
    }
  });

  it("contains the landmark interchanges", () => {
    const names = geo.features.map((f: { properties: { name: string } }) => f.properties.name);
    for (const station of ["Dadar", "Andheri", "Thane", "Vashi", "Panvel", "Borivali"]) {
      expect(names).toContain(station);
    }
  });

  it("has no duplicate station names", () => {
    const names = geo.features.map((f: { properties: { name: string } }) => f.properties.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
