// Demo-mode data layer: no Supabase env vars are set under vitest, so
// lib/data.ts runs its localStorage-backed branch. We stub window.localStorage.
import { beforeEach, describe, expect, it } from "vitest";

function stubLocalStorage() {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
  (globalThis as Record<string, unknown>).window = { localStorage };
  return store;
}

const data = await import("@/lib/data");
const { addListing, addPin, availableFlats, fetchPins, isLive, matchPreview } = data;
const { generateSeedPins } = await import("@/lib/seed");

const BASE_LISTING = {
  rent: 30000,
  deposit: 90000,
  bhk: "1BHK" as const,
  furnishing: "Semi-furnished" as const,
  whole_flat: true,
  veg_only: false,
  smoking_ok: true,
  parking: false,
  contact_email: "owner@example.com",
  contact_phone: null,
};

const BASE_SEEKER = {
  lat: 19.06,
  lng: 72.83,
  budget_max: 30000,
  bhk: "1BHK" as const,
  room_ok: false,
};

beforeEach(() => {
  stubLocalStorage();
});

describe("demo mode wiring", () => {
  it("runs in demo mode when Supabase env vars are absent", () => {
    expect(isLive).toBe(false);
  });

  it("fetchPins returns the seed set when nothing was added", async () => {
    expect(await fetchPins()).toEqual(generateSeedPins());
  });
});

describe("addPin (demo)", () => {
  const input = {
    lat: 19.0601234,
    lng: 72.8299876,
    rent: 35000,
    deposit: null,
    bhk: "1BHK" as const,
    housing_type: "Society" as const,
    furnishing: null,
    maintenance_included: null,
    gated: null,
    tenant_type: null,
    pets: null,
    parking_count: null,
    sqft: null,
    society: null,
    note: null,
  };

  it("rounds coordinates to ~100m (3 decimals) for privacy", async () => {
    const pin = await addPin(input);
    expect(pin.lat).toBe(19.06);
    expect(pin.lng).toBe(72.83);
  });

  it("persists the pin so fetchPins includes it", async () => {
    const pin = await addPin(input);
    const all = await fetchPins();
    expect(all.some((p) => p.id === pin.id)).toBe(true);
    expect(all.length).toBe(generateSeedPins().length + 1);
  });

  it("initializes social counters to zero", async () => {
    const pin = await addPin(input);
    expect(pin.rating_sum).toBe(0);
    expect(pin.rating_count).toBe(0);
    expect(pin.report_count).toBe(0);
  });
});

describe("matchPreview (demo) — 2.5km radius, budget and BHK edges", () => {
  it("matches a listing at the same spot within budget", async () => {
    await addListing({ ...BASE_LISTING, lat: 19.06, lng: 72.83 });
    expect(await matchPreview(BASE_SEEKER)).toHaveLength(1);
  });

  it("matches exactly at the budget boundary (rent == budget)", async () => {
    await addListing({ ...BASE_LISTING, lat: 19.06, lng: 72.83, rent: 30000 });
    expect(await matchPreview({ ...BASE_SEEKER, budget_max: 30000 })).toHaveLength(1);
  });

  it("rejects a listing ₹1 over budget", async () => {
    await addListing({ ...BASE_LISTING, lat: 19.06, lng: 72.83, rent: 30001 });
    expect(await matchPreview(BASE_SEEKER)).toHaveLength(0);
  });

  it("matches ~2.2km away but not ~2.8km away", async () => {
    // 0.02° of latitude ≈ 2.23km; 0.025° ≈ 2.78km
    await addListing({ ...BASE_LISTING, lat: 19.08, lng: 72.83 });
    await addListing({ ...BASE_LISTING, lat: 19.085, lng: 72.83 });
    expect(await matchPreview(BASE_SEEKER)).toHaveLength(1);
  });

  it("requires the exact BHK for whole flats", async () => {
    await addListing({ ...BASE_LISTING, lat: 19.06, lng: 72.83, bhk: "2BHK" });
    expect(await matchPreview(BASE_SEEKER)).toHaveLength(0);
  });

  it("accepts a different-BHK shared room when room_ok is set", async () => {
    await addListing({
      ...BASE_LISTING,
      lat: 19.06,
      lng: 72.83,
      bhk: "3BHK",
      whole_flat: false,
    });
    expect(await matchPreview(BASE_SEEKER)).toHaveLength(0);
    expect(await matchPreview({ ...BASE_SEEKER, room_ok: true })).toHaveLength(1);
  });

  it("returns empty when there are no listings", async () => {
    expect(await matchPreview(BASE_SEEKER)).toEqual([]);
  });

  it("never leaks contact details in preview items", async () => {
    await addListing({ ...BASE_LISTING, lat: 19.06, lng: 72.83 });
    const [item] = await matchPreview(BASE_SEEKER);
    expect(item).not.toHaveProperty("contact_email");
    expect(item).not.toHaveProperty("contact_phone");
  });
});

describe("availableFlats (demo)", () => {
  it("returns all listings, anonymized", async () => {
    await addListing({ ...BASE_LISTING, lat: 19.06, lng: 72.83 });
    await addListing({ ...BASE_LISTING, lat: 19.2, lng: 72.85, rent: 50000 });
    const flats = await availableFlats();
    expect(flats).toHaveLength(2);
    for (const f of flats) {
      expect(f).not.toHaveProperty("contact_email");
    }
  });
});
