import { Bhk, HousingType, RentPin } from "./types";

// Locality anchors with a plausible 1BHK base rent (₹/month). Other BHKs are
// derived from it. Purely illustrative demo data shown until Supabase is
// connected — clearly labelled as such in the UI.
const ANCHORS: [name: string, lat: number, lng: number, base1bhk: number][] = [
  // Mumbai
  ["Colaba", 18.9067, 72.8147, 55000],
  ["Lower Parel", 18.9977, 72.8306, 60000],
  ["Dadar", 19.0178, 72.8478, 42000],
  ["Bandra West", 19.0596, 72.8295, 55000],
  ["Khar", 19.0728, 72.8326, 50000],
  ["Andheri West", 19.1364, 72.8296, 35000],
  ["Andheri East", 19.1178, 72.8631, 30000],
  ["Powai", 19.1176, 72.906, 35000],
  ["Goregaon", 19.1663, 72.8526, 28000],
  ["Malad West", 19.1874, 72.8484, 25000],
  ["Kandivali", 19.2041, 72.8520, 24000],
  ["Borivali", 19.2307, 72.8567, 23000],
  ["Chembur", 19.0522, 72.9005, 28000],
  ["Ghatkopar", 19.0790, 72.9080, 26000],
  ["Mulund", 19.1726, 72.9425, 24000],
  ["Wadala", 19.0178, 72.8660, 32000],
  // Navi Mumbai
  ["Vashi", 19.0771, 72.9981, 22000],
  ["Nerul", 19.0330, 73.0169, 20000],
  ["Seawoods", 19.0227, 73.0176, 22000],
  ["CBD Belapur", 19.0237, 73.0400, 19000],
  ["Kharghar", 19.0473, 73.0699, 17000],
  ["Airoli", 19.1568, 72.9940, 19000],
  ["Ghansoli", 19.1235, 73.0031, 18000],
  ["Panvel", 18.9894, 73.1175, 13000],
];

const BHK_MULT: [Bhk, number][] = [
  ["1RK", 0.62],
  ["1BHK", 1.0],
  ["2BHK", 1.65],
  ["3BHK", 2.5],
  ["4BHK+", 3.6],
];

const NOTES = [
  "Great locality, noisy at night",
  "Peaceful lane, 5 min to station",
  "Water issues in summer",
  "Friendly society, strict on visitors",
  "Close to market, gets crowded",
];

const HOUSING: HousingType[] = [
  "Society",
  "Society",
  "Society",
  "Standalone building",
  "Chawl",
  "Gaothan/Village",
];

// Deterministic pseudo-random so the demo map looks the same on every load.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateSeedPins(): RentPin[] {
  const rand = mulberry32(20260714);
  const pins: RentPin[] = [];
  ANCHORS.forEach(([name, lat, lng, base], ai) => {
    const count = 4 + Math.floor(rand() * 4);
    for (let i = 0; i < count; i++) {
      const [bhk, mult] = BHK_MULT[Math.floor(rand() * BHK_MULT.length)];
      const noise = 0.82 + rand() * 0.36;
      const rent = Math.round((base * mult * noise) / 500) * 500;
      const monthsDeposit = 2 + Math.floor(rand() * 4);
      const housing_type = HOUSING[Math.floor(rand() * HOUSING.length)];
      const sqftBase = { "1RK": 250, "1BHK": 450, "2BHK": 750, "3BHK": 1100, "4BHK+": 1600 }[bhk];
      pins.push({
        id: `seed-${ai}-${i}`,
        lat: +(lat + (rand() - 0.5) * 0.014).toFixed(3),
        lng: +(lng + (rand() - 0.5) * 0.014).toFixed(3),
        rent,
        deposit: rand() < 0.8 ? rent * monthsDeposit : null,
        bhk,
        housing_type,
        furnishing: rand() < 0.7 ? (rand() < 0.5 ? "Furnished" : "Unfurnished") : null,
        maintenance_included: rand() < 0.6 ? rand() < 0.5 : null,
        gated: housing_type === "Society" ? rand() < 0.85 : rand() < 0.2,
        tenant_type: rand() < 0.5 ? (rand() < 0.6 ? "Family" : "Bachelor") : null,
        pets: rand() < 0.4 ? (["Yes", "No", "Not sure"] as const)[Math.floor(rand() * 3)] : null,
        parking_count: rand() < 0.6 ? Math.floor(rand() * 3) : null,
        sqft: rand() < 0.5 ? Math.round((sqftBase * (0.85 + rand() * 0.4)) / 10) * 10 : null,
        society: null,
        note: rand() < 0.25 ? NOTES[Math.floor(rand() * NOTES.length)] : null,
        ...(() => {
          const count = rand() < 0.35 ? 1 + Math.floor(rand() * 8) : 0;
          const avg = 3 + rand() * 2;
          return {
            rating_count: count,
            rating_sum: count ? Math.round(avg * count) : 0,
            report_count: rand() < 0.06 ? 1 + Math.floor(rand() * 2) : 0,
          };
        })(),
        created_at: `2026-0${1 + Math.floor(rand() * 6)}-15T00:00:00.000Z`,
      });
    }
    void name;
  });
  return pins;
}
