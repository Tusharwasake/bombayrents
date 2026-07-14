import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  MatchPreviewItem,
  NewListing,
  NewRentPin,
  NewSeeker,
  NewToLetSpot,
  PinComment,
  RatingSummary,
  RentPin,
  ToLetSpot,
} from "./types";
import { generateSeedPins } from "./seed";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null;

/** True when a real Supabase backend is configured; false = local demo mode. */
export const isLive = supabase !== null;

const LOCAL_KEY = "bombayrent_local_pins";

const PIN_COLS =
  "id, lat, lng, rent, deposit, bhk, housing_type, furnishing, maintenance_included, gated, tenant_type, pets, parking_count, sqft, society, note, rating_sum, rating_count, report_count, created_at";

function readLocal<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    return JSON.parse(window.localStorage.getItem(key) ?? "") as T;
  } catch {
    return fallback;
  }
}

function writeLocal(key: string, value: unknown) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

function readLocalPins(): RentPin[] {
  return readLocal<RentPin[]>(LOCAL_KEY, []);
}

// ~100m grid, so a pin never identifies an exact address.
function roundCoord(v: number): number {
  return Math.round(v * 1000) / 1000;
}

// --- Write gateway -----------------------------------------------------------
// Live-mode writes go through /api/submit, which rate-limits per IP and
// (when configured) verifies Turnstile. The anon key is read-only.

let captchaToken: string | null = null;
let captchaReset: (() => void) | null = null;

/** Called by the Turnstile widget; the next form submit sends it along. */
export function setCaptchaToken(token: string | null) {
  captchaToken = token;
}

/** The widget registers how to mint a fresh token after a failed submit. */
export function registerCaptchaReset(fn: (() => void) | null) {
  captchaReset = fn;
}

async function submit<T>(kind: string, payload: unknown): Promise<T> {
  const res = await fetch("/api/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, payload, captchaToken }),
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    // Turnstile tokens are single-use; get a fresh one so a retry can pass.
    captchaToken = null;
    captchaReset?.();
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return body;
}

// PostgREST caps every response at 1,000 rows regardless of .limit(), so big
// tables must be paged or the map silently truncates.
const PAGE = 1000;

export async function fetchPins(): Promise<RentPin[]> {
  if (supabase) {
    const all: RentPin[] = [];
    for (let from = 0; from < 10000; from += PAGE) {
      const { data, error } = await supabase
        .from("rent_pins")
        .select(PIN_COLS)
        .eq("hidden", false)
        .order("created_at", { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(`Failed to load pins: ${error.message}`);
      all.push(...(data as unknown as RentPin[]));
      if (data.length < PAGE) break;
    }
    return all;
  }
  return [...generateSeedPins(), ...readLocalPins()];
}

export async function addPin(input: NewRentPin): Promise<RentPin> {
  const row = {
    ...input,
    lat: roundCoord(input.lat),
    lng: roundCoord(input.lng),
  };
  if (supabase) {
    return submit<RentPin>("pin", row);
  }
  const pin: RentPin = {
    ...row,
    id: crypto.randomUUID(),
    rating_sum: 0,
    rating_count: 0,
    report_count: 0,
    created_at: new Date().toISOString(),
  };
  writeLocal(LOCAL_KEY, [...readLocalPins(), pin]);
  return pin;
}

// --- Listings & seekers -----------------------------------------------------
// Live mode: write-only inserts (RLS blocks reads, so contact emails can never
// be pulled through the anon API). Demo mode: localStorage.

const LOCAL_LISTINGS_KEY = "bombayrent_local_listings";

type LocalListing = NewListing & { id: string; created_at: string };

function readLocalListings(): LocalListing[] {
  return readLocal<LocalListing[]>(LOCAL_LISTINGS_KEY, []);
}

export async function addListing(input: NewListing): Promise<void> {
  const row = {
    ...input,
    lat: roundCoord(input.lat),
    lng: roundCoord(input.lng),
  };
  if (supabase) {
    await submit("listing", row);
    return;
  }
  writeLocal(LOCAL_LISTINGS_KEY, [
    ...readLocalListings(),
    { ...row, id: crypto.randomUUID(), created_at: new Date().toISOString() },
  ]);
}

export async function addSeeker(input: NewSeeker): Promise<void> {
  const row = {
    ...input,
    lat: roundCoord(input.lat),
    lng: roundCoord(input.lng),
  };
  if (supabase) {
    await submit("seeker", row);
  }
  // Demo mode: nothing to persist server-side; the preview below still works.
}

const KM = 111.32; // rough degrees→km at Mumbai's latitude

function localListingToPreview(l: LocalListing): MatchPreviewItem {
  return {
    lat: l.lat,
    lng: l.lng,
    rent: l.rent,
    bhk: l.bhk,
    furnishing: l.furnishing,
    whole_flat: l.whole_flat,
  };
}

export async function matchPreview(
  seeker: Pick<NewSeeker, "lat" | "lng" | "budget_max" | "bhk" | "room_ok">
): Promise<MatchPreviewItem[]> {
  if (supabase) {
    const { data, error } = await supabase.rpc("match_preview", {
      p_lat: seeker.lat,
      p_lng: seeker.lng,
      p_budget: seeker.budget_max,
      p_bhk: seeker.bhk,
      p_room_ok: seeker.room_ok,
    });
    if (error) throw new Error(`Match preview failed: ${error.message}`);
    return (data ?? []) as MatchPreviewItem[];
  }
  return readLocalListings()
    .filter((l) => {
      const dLat = (l.lat - seeker.lat) * KM;
      const dLng = (l.lng - seeker.lng) * KM * Math.cos((seeker.lat * Math.PI) / 180);
      const withinRadius = Math.hypot(dLat, dLng) <= 2.5;
      const bhkOk = l.bhk === seeker.bhk || (seeker.room_ok && !l.whole_flat);
      return withinRadius && l.rent <= seeker.budget_max && bhkOk;
    })
    .map(localListingToPreview);
}

/** All currently active listings, anonymized — the "Available flats" layer. */
export async function availableFlats(): Promise<MatchPreviewItem[]> {
  if (supabase) {
    const { data, error } = await supabase.rpc("available_flats");
    if (error) throw new Error(`Failed to load available flats: ${error.message}`);
    return (data ?? []) as MatchPreviewItem[];
  }
  return readLocalListings().map(localListingToPreview);
}

export async function reportPin(pinId: string): Promise<void> {
  if (!supabase || pinId.startsWith("seed-")) return; // no-op in demo mode
  await submit("report_pin", { pin_id: pinId });
}

// --- Ratings & comments -----------------------------------------------------
// Demo mode keeps them per-browser in localStorage so the UI is fully usable.

const LOCAL_SOCIAL_KEY = "bombayrent_local_social";

type LocalSocial = Record<string, { ratings: number[]; comments: PinComment[] }>;

function readLocalSocial(): LocalSocial {
  return readLocal<LocalSocial>(LOCAL_SOCIAL_KEY, {});
}

export interface PinSocial {
  rating: RatingSummary;
  comments: PinComment[];
}

export async function fetchPinSocial(pinId: string): Promise<PinSocial> {
  if (supabase && !pinId.startsWith("seed-")) {
    const [ratings, comments] = await Promise.all([
      supabase.from("pin_ratings").select("rating").eq("pin_id", pinId),
      supabase
        .from("pin_comments")
        .select("id, body, created_at")
        .eq("pin_id", pinId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    if (ratings.error) throw new Error(ratings.error.message);
    if (comments.error) throw new Error(comments.error.message);
    const values = (ratings.data ?? []).map((r) => r.rating as number);
    return {
      rating: {
        count: values.length,
        avg: values.length
          ? values.reduce((a, b) => a + b, 0) / values.length
          : null,
      },
      comments: (comments.data ?? []) as PinComment[],
    };
  }
  const entry = readLocalSocial()[pinId] ?? { ratings: [], comments: [] };
  return {
    rating: {
      count: entry.ratings.length,
      avg: entry.ratings.length
        ? entry.ratings.reduce((a, b) => a + b, 0) / entry.ratings.length
        : null,
    },
    comments: [...entry.comments].reverse(),
  };
}

export async function ratePin(pinId: string, rating: number): Promise<void> {
  if (supabase && !pinId.startsWith("seed-")) {
    await submit("rating", { pin_id: pinId, rating });
    return;
  }
  const social = readLocalSocial();
  const entry = social[pinId] ?? { ratings: [], comments: [] };
  entry.ratings.push(rating);
  social[pinId] = entry;
  writeLocal(LOCAL_SOCIAL_KEY, social);
}

export async function addPinComment(pinId: string, body: string): Promise<PinComment> {
  if (supabase && !pinId.startsWith("seed-")) {
    return submit<PinComment>("comment", { pin_id: pinId, body });
  }
  const comment: PinComment = {
    id: crypto.randomUUID(),
    body,
    created_at: new Date().toISOString(),
  };
  const social = readLocalSocial();
  const entry = social[pinId] ?? { ratings: [], comments: [] };
  entry.comments.push(comment);
  social[pinId] = entry;
  writeLocal(LOCAL_SOCIAL_KEY, social);
  return comment;
}

// --- Area alerts ("be the first to know when a flat opens here") ------------

export async function addAreaAlert(
  lat: number,
  lng: number,
  email: string
): Promise<void> {
  if (supabase) {
    // "Already subscribed here" is treated as success server-side.
    await submit("alert", { lat: roundCoord(lat), lng: roundCoord(lng), email });
  }
  // Demo mode: accept silently — there is no mailer to notify anyway.
}

// --- To-Let spotting ---------------------------------------------------------

const LOCAL_TOLETS_KEY = "bombayrent_local_tolets";

function readLocalToLets(): ToLetSpot[] {
  return readLocal<ToLetSpot[]>(LOCAL_TOLETS_KEY, []);
}

export async function fetchToLets(): Promise<ToLetSpot[]> {
  if (supabase) {
    const all: ToLetSpot[] = [];
    for (let from = 0; from < 3000; from += PAGE) {
      const { data, error } = await supabase
        .from("tolet_spots")
        .select("id, lat, lng, photo_url, spotter_name, message, created_at")
        .eq("hidden", false)
        .order("created_at", { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(`Failed to load To-Let spots: ${error.message}`);
      all.push(...(data as ToLetSpot[]));
      if (data.length < PAGE) break;
    }
    return all;
  }
  return readLocalToLets();
}

/**
 * Adds a spotted To-Let board. `photo` is an already-downscaled JPEG blob
 * (live mode uploads it to storage; demo mode stores a data URL locally).
 */
export async function addToLet(
  input: NewToLetSpot,
  photo: Blob | null
): Promise<ToLetSpot> {
  const base = {
    ...input,
    lat: roundCoord(input.lat),
    lng: roundCoord(input.lng),
  };
  if (supabase) {
    let photo_url: string | null = null;
    if (photo) {
      const path = `${crypto.randomUUID()}.jpg`;
      const { error } = await supabase.storage
        .from("tolet-photos")
        .upload(path, photo, { contentType: "image/jpeg" });
      if (error) throw new Error(`Photo upload failed: ${error.message}`);
      photo_url = supabase.storage.from("tolet-photos").getPublicUrl(path).data.publicUrl;
    }
    return submit<ToLetSpot>("tolet", { ...base, photo_url });
  }
  const photo_url = photo ? await blobToDataUrl(photo) : null;
  const spot: ToLetSpot = {
    ...base,
    id: crypto.randomUUID(),
    photo_url,
    created_at: new Date().toISOString(),
  };
  writeLocal(LOCAL_TOLETS_KEY, [...readLocalToLets(), spot]);
  return spot;
}

export async function reportToLet(spotId: string): Promise<void> {
  if (!supabase) return;
  await submit("report_tolet", { spot_id: spotId });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
