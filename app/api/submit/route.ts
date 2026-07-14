import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Single write gateway for everything the browser used to insert directly.
// Enforces a per-IP rate limit (consume_rate_limit RPC) and, when Turnstile
// keys are configured, a captcha on the four big forms. The anon key has no
// insert rights anymore (schema v4), so this route is the only write path.

const PIN_COLS =
  "id, lat, lng, rent, deposit, bhk, housing_type, furnishing, maintenance_included, gated, tenant_type, pets, parking_count, sqft, society, note, rating_sum, rating_count, report_count, created_at";

interface KindConfig {
  max: number; // writes allowed per IP…
  window: number; // …per this many minutes
  captcha?: boolean;
}

const KINDS: Record<string, KindConfig> = {
  pin: { max: 5, window: 60, captcha: true },
  listing: { max: 3, window: 60, captcha: true },
  seeker: { max: 3, window: 60, captcha: true },
  tolet: { max: 5, window: 60, captcha: true },
  rating: { max: 30, window: 60 },
  comment: { max: 10, window: 60 },
  alert: { max: 5, window: 60 },
  report_pin: { max: 10, window: 60 },
  report_tolet: { max: 10, window: 60 },
};

function pick<T extends object>(obj: T, keys: string[]): Record<string, unknown> {
  const rec = obj as Record<string, unknown>;
  return Object.fromEntries(keys.filter((k) => k in rec).map((k) => [k, rec[k]]));
}

// The DB has no email-format constraint; stop garbage here so the matcher and
// alert sender never choke on it.
function validEmail(v: unknown): boolean {
  return typeof v === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) && v.length <= 254;
}

async function captchaOk(token: unknown, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // captcha not configured — rate limit still applies
  if (typeof token !== "string" || !token) return false;
  try {
    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ secret, response: token, remoteip: ip }),
      }
    );
    const data = (await res.json()) as { success?: boolean };
    return !!data.success;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json(
      { error: "Server not configured: SUPABASE_SERVICE_ROLE_KEY is required." },
      { status: 501 }
    );
  }

  let body: { kind?: string; payload?: unknown; captchaToken?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const kind = body.kind ?? "";
  const config = KINDS[kind];
  const payload = (body.payload ?? {}) as Record<string, unknown>;
  if (!config || typeof payload !== "object") {
    return NextResponse.json({ error: "Unknown request." }, { status: 400 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const ipHash = createHash("sha256")
    .update(ip + (process.env.CRON_SECRET ?? "bombayrent"))
    .digest("hex");

  if (config.captcha && !(await captchaOk(body.captchaToken, ip))) {
    return NextResponse.json(
      { error: "Captcha failed — refresh and try again." },
      { status: 403 }
    );
  }

  const supabase = createClient(url, serviceKey);

  const { data: allowed, error: rlError } = await supabase.rpc(
    "consume_rate_limit",
    { p_ip: ipHash, p_action: kind, p_max: config.max, p_window_minutes: config.window }
  );
  if (rlError) {
    return NextResponse.json(
      { error: `Rate limiter unavailable: ${rlError.message}` },
      { status: 500 }
    );
  }
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many submissions from your connection — try again later." },
      { status: 429 }
    );
  }

  switch (kind) {
    case "pin": {
      const row = pick(payload, [
        "lat", "lng", "rent", "deposit", "bhk", "housing_type", "furnishing",
        "maintenance_included", "gated", "tenant_type", "pets", "parking_count",
        "sqft", "society", "note",
      ]);
      const { data, error } = await supabase
        .from("rent_pins").insert(row).select(PIN_COLS).single();
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json(data);
    }
    case "listing": {
      const row = pick(payload, [
        "lat", "lng", "rent", "deposit", "bhk", "furnishing", "whole_flat",
        "veg_only", "smoking_ok", "parking", "contact_email", "contact_phone",
      ]);
      if (!validEmail(row.contact_email))
        return NextResponse.json({ error: "Invalid email." }, { status: 400 });
      const { error } = await supabase.from("listings").insert(row);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }
    case "seeker": {
      const row = pick(payload, [
        "lat", "lng", "budget_max", "bhk", "room_ok", "veg", "smoker",
        "contact_email", "contact_phone",
      ]);
      if (!validEmail(row.contact_email))
        return NextResponse.json({ error: "Invalid email." }, { status: 400 });
      const { error } = await supabase.from("seekers").insert(row);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }
    case "tolet": {
      const row = pick(payload, ["lat", "lng", "photo_url", "spotter_name", "message"]);
      // Only photos from our own bucket — no hotlinking arbitrary URLs.
      const prefix = `${url}/storage/v1/object/public/tolet-photos/`;
      if (row.photo_url != null &&
          (typeof row.photo_url !== "string" || !row.photo_url.startsWith(prefix))) {
        return NextResponse.json({ error: "Invalid photo." }, { status: 400 });
      }
      const { data, error } = await supabase
        .from("tolet_spots").insert(row)
        .select("id, lat, lng, photo_url, spotter_name, message, created_at")
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json(data);
    }
    case "rating": {
      const row = pick(payload, ["pin_id", "rating"]);
      const { error } = await supabase.from("pin_ratings").insert(row);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }
    case "comment": {
      const row = pick(payload, ["pin_id", "body"]);
      const { data, error } = await supabase
        .from("pin_comments").insert(row)
        .select("id, body, created_at").single();
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json(data);
    }
    case "alert": {
      const row = pick(payload, ["lat", "lng", "email"]);
      if (!validEmail(row.email))
        return NextResponse.json({ error: "Invalid email." }, { status: 400 });
      const { error } = await supabase.from("area_alerts").insert(row);
      // 23505 = already subscribed at this spot; success for the user.
      if (error && error.code !== "23505")
        return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }
    case "report_pin": {
      const { error } = await supabase.rpc("report_pin", pick(payload, ["pin_id"]));
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }
    case "report_tolet": {
      const { error } = await supabase.rpc("report_tolet", pick(payload, ["spot_id"]));
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }
    default:
      return NextResponse.json({ error: "Unknown request." }, { status: 400 });
  }
}
