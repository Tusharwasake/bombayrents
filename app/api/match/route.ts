import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendEmail, sendSms } from "@/lib/notify";

// Daily matcher: pairs seekers with listings within 2.5km that fit budget/BHK/
// preferences, emails both sides each other's contact (the ONLY place contacts
// are ever shared), and records the pair so it's never re-sent. Also delivers
// the "be the first to know" area alerts: one email per subscription when a
// new listing appears within 1km of it.
//
// Trigger: Vercel cron (see vercel.json) or `curl -H "Authorization: Bearer
// $CRON_SECRET" https://<site>/api/match`.

interface MatchRow {
  seeker_id: string;
  listing_id: string;
  seeker_email: string;
  seeker_phone: string | null;
  listing_email: string;
  listing_phone: string | null;
  listing_rent: number;
  listing_bhk: string;
  listing_furnishing: string;
  listing_whole_flat: boolean;
  listing_lat: number;
  listing_lng: number;
}

interface AlertRow {
  alert_id: string;
  email: string;
  listing_rent: number;
  listing_bhk: string;
  listing_furnishing: string;
  listing_whole_flat: boolean;
  listing_lat: number;
  listing_lng: number;
}

const inr = (n: number) => "₹" + n.toLocaleString("en-IN");

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY not configured" },
      { status: 501 }
    );
  }

  const supabase = createClient(url, serviceKey);

  // --- Seeker ↔ listing matches ---
  const { data, error } = await supabase.rpc("find_new_matches");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as MatchRow[];
  let emailed = 0;
  let failed = 0;
  let smsSent = 0;

  for (const m of rows) {
    const flatDesc = `${m.listing_bhk} ${m.listing_whole_flat ? "flat" : "room"} · ${m.listing_furnishing} · ${inr(m.listing_rent)}/month`;
    const mapLink = `https://www.openstreetmap.org/?mlat=${m.listing_lat}&mlon=${m.listing_lng}#map=16/${m.listing_lat}/${m.listing_lng}`;

    const seekerResult = await sendEmail(
      m.seeker_email,
      `🏠 Match found: ${flatDesc}`,
      `<p>A flat matching your BombayRent search is available:</p>
       <p><b>${flatDesc}</b><br>Approximate location: <a href="${mapLink}">map</a></p>
       <p>Owner contact: <b>${m.listing_email}</b>${m.listing_phone ? ` · <b>${m.listing_phone}</b>` : ""}</p>
       <p>No broker, no fee. Mention BombayRent when you call.</p>`
    );
    // The seeker email carries the contact — if it failed, don't record the
    // match, so the next run retries it.
    if (seekerResult === "failed") {
      failed++;
      continue;
    }

    // Owner email is best-effort: the seeker already has the owner's contact.
    const ownerResult = await sendEmail(
      m.listing_email,
      `🔎 A flat-hunter matches your listing (${flatDesc})`,
      `<p>Someone searching near your flat matches your listing:</p>
       <p>Seeker contact: <b>${m.seeker_email}</b>${m.seeker_phone ? ` · <b>${m.seeker_phone}</b>` : ""}</p>
       <p>No broker, no fee — you can reach out directly.</p>`
    );
    if (seekerResult === "sent") emailed++;
    if (ownerResult === "sent") emailed++;

    // SMS both sides too (best-effort; needs SMS_ENABLED=true + AWS creds).
    const seekerSms = await sendSms(
      m.seeker_phone,
      `BombayRent match: ${flatDesc}. Owner: ${m.listing_email}${m.listing_phone ? ` / ${m.listing_phone}` : ""}. No broker, no fee.`
    );
    const ownerSms = await sendSms(
      m.listing_phone,
      `BombayRent: a flat-hunter matches your listing (${flatDesc}). Seeker: ${m.seeker_email}${m.seeker_phone ? ` / ${m.seeker_phone}` : ""}.`
    );
    if (seekerSms === "sent") smsSent++;
    if (ownerSms === "sent") smsSent++;

    await supabase
      .from("matches")
      .insert({ seeker_id: m.seeker_id, listing_id: m.listing_id });
  }

  // --- 1-km area alerts ("be the first to know when a flat opens here") ---
  const alerts = await supabase.rpc("find_new_area_alerts");
  const alertRows = (alerts.data ?? []) as AlertRow[];
  let alertsEmailed = 0;

  for (const a of alertRows) {
    const flatDesc = `${a.listing_bhk} ${a.listing_whole_flat ? "flat" : "room"} · ${a.listing_furnishing} · ${inr(a.listing_rent)}/month`;
    const mapLink = `https://www.openstreetmap.org/?mlat=${a.listing_lat}&mlon=${a.listing_lng}#map=16/${a.listing_lat}/${a.listing_lng}`;

    const result = await sendEmail(
      a.email,
      `🔔 A flat just opened up near your spot: ${flatDesc}`,
      `<p>You asked BombayRent to tell you the moment a place lists within
       1&nbsp;km of a spot you saved — it just happened:</p>
       <p><b>${flatDesc}</b><br>Approximate location: <a href="${mapLink}">map</a></p>
       <p>Drop a seeker pin there on the map and the owner's contact lands in
       your inbox. No broker, no fee.</p>
       <p style="color:#64748b;font-size:12px">This was your one alert email for
       this spot — you won't hear from us again unless you subscribe anew.</p>`
    );
    // Mark delivered only on real success; "skipped" (no key yet) stays
    // pending so it goes out once emails are configured.
    if (result === "sent") {
      await supabase
        .from("area_alerts")
        .update({ notified_at: new Date().toISOString() })
        .eq("id", a.alert_id);
      alertsEmailed++;
    }
  }

  // Housekeeping: rate-limit log only needs the last hour; keep a day for
  // debugging and drop the rest.
  await supabase
    .from("write_log")
    .delete()
    .lt("created_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString());

  const emailConfigured = !!(
    (process.env.AWS_REGION && process.env.AWS_ACCESS_KEY_ID) ||
    process.env.RESEND_API_KEY
  );

  return NextResponse.json({
    pairs: rows.length,
    emailed,
    failed,
    smsSent,
    alerts: alertRows.length,
    alertsEmailed,
    // Non-null when find_new_area_alerts is missing (schema v3.2 not applied)
    alertsError: alerts.error?.message ?? null,
    emailsSkipped: !emailConfigured,
    smsEnabled: process.env.SMS_ENABLED === "true",
  });
}
