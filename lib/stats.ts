import { Bhk, BHK_OPTIONS, RentPin } from "./types";

export interface Bounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export function pinsInBounds(pins: RentPin[], b: Bounds): RentPin[] {
  return pins.filter(
    (p) => p.lat <= b.north && p.lat >= b.south && p.lng <= b.east && p.lng >= b.west
  );
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export interface BhkStat {
  bhk: Bhk;
  count: number;
  medianRent: number;
  medianDeposit: number | null;
}

export function statsByBhk(pins: RentPin[]): BhkStat[] {
  // Single pass over the pins instead of one filter per BHK option — this
  // runs on every map pan, over every pin in view.
  const groups = new Map<Bhk, RentPin[]>();
  for (const p of pins) {
    const group = groups.get(p.bhk);
    if (group) group.push(p);
    else groups.set(p.bhk, [p]);
  }
  return BHK_OPTIONS.flatMap((bhk) => {
    const group = groups.get(bhk);
    if (!group) return [];
    return [
      {
        bhk,
        count: group.length,
        medianRent: median(group.map((p) => p.rent))!,
        medianDeposit: median(
          group.filter((p) => p.deposit != null).map((p) => p.deposit!)
        ),
      },
    ];
  });
}

export function formatINR(n: number): string {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}
