export type Bhk = "1RK" | "1BHK" | "2BHK" | "3BHK" | "4BHK+";

export type HousingType = "Society" | "Standalone building" | "Chawl" | "Gaothan/Village";

export type PinFurnishing = "Furnished" | "Unfurnished";
export type TenantType = "Family" | "Bachelor";
export type PetsPolicy = "Yes" | "No" | "Not sure";

export interface RentPin {
  id: string;
  lat: number;
  lng: number;
  rent: number;
  deposit: number | null;
  bhk: Bhk;
  housing_type: HousingType;
  furnishing: PinFurnishing | null;
  maintenance_included: boolean | null;
  gated: boolean | null;
  tenant_type: TenantType | null;
  pets: PetsPolicy | null;
  parking_count: number | null;
  sqft: number | null;
  society: string | null;
  note: string | null;
  rating_sum: number;
  rating_count: number;
  report_count: number;
  created_at: string;
}

export type NewRentPin = Omit<
  RentPin,
  "id" | "created_at" | "rating_sum" | "rating_count" | "report_count"
>;

export const BHK_OPTIONS: Bhk[] = ["1RK", "1BHK", "2BHK", "3BHK", "4BHK+"];

export const HOUSING_OPTIONS: HousingType[] = [
  "Society",
  "Standalone building",
  "Chawl",
  "Gaothan/Village",
];

export type Furnishing = "Unfurnished" | "Semi-furnished" | "Fully furnished";

export const FURNISHING_OPTIONS: Furnishing[] = [
  "Unfurnished",
  "Semi-furnished",
  "Fully furnished",
];

export interface NewListing {
  lat: number;
  lng: number;
  rent: number;
  deposit: number | null;
  bhk: Bhk;
  furnishing: Furnishing;
  whole_flat: boolean;
  veg_only: boolean;
  smoking_ok: boolean;
  parking: boolean;
  contact_email: string;
  contact_phone: string | null;
}

export interface NewSeeker {
  lat: number;
  lng: number;
  budget_max: number;
  bhk: Bhk;
  room_ok: boolean;
  veg: boolean;
  smoker: boolean;
  contact_email: string;
  contact_phone: string | null;
}

export interface MatchPreviewItem {
  lat: number;
  lng: number;
  rent: number;
  bhk: string;
  furnishing: string;
  whole_flat: boolean;
}

export interface PinComment {
  id: string;
  body: string;
  created_at: string;
}

export interface RatingSummary {
  avg: number | null;
  count: number;
}

export interface ToLetSpot {
  id: string;
  lat: number;
  lng: number;
  photo_url: string | null;
  spotter_name: string | null;
  message: string | null;
  created_at: string;
}

export interface NewToLetSpot {
  lat: number;
  lng: number;
  spotter_name: string | null;
  message: string | null;
}

export const BHK_COLORS: Record<Bhk, string> = {
  "1RK": "#64748b",
  "1BHK": "#0ea5e9",
  "2BHK": "#10b981",
  "3BHK": "#f59e0b",
  "4BHK+": "#ec4899",
};

/** "30K", "1.2L" — the compact rupee format used on map pin labels. */
export function inrShort(n: number): string {
  if (n >= 100000) {
    const l = n / 100000;
    return (l >= 10 ? Math.round(l) : Math.round(l * 10) / 10) + "L";
  }
  if (n >= 1000) return Math.round(n / 1000) + "K";
  return String(n);
}

export function daysAgo(iso: string): string {
  const d = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
  if (d === 0) return "today";
  if (d < 30) return `${d}d ago`;
  if (d < 365) return `${Math.floor(d / 30)}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}
