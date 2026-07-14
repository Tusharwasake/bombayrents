// /api/match cron endpoint: auth, config guards, match emails with retry
// semantics, area alerts, and housekeeping.
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
  matches: { data: [] as unknown[], error: null as { message: string } | null },
  alerts: { data: [] as unknown[], error: null as { message: string } | null },
};
let inserts: Record<string, unknown[]> = {};
let updates: Record<string, unknown[]> = {};

const rpcMock = vi.fn(async (name: string) => {
  if (name === "find_new_matches") return state.matches;
  if (name === "find_new_area_alerts") return state.alerts;
  return { data: null, error: { message: `unknown rpc ${name}` } };
});

const fromMock = vi.fn((table: string) => ({
  insert: vi.fn(async (row: unknown) => {
    (inserts[table] ??= []).push(row);
    return { error: null };
  }),
  update: vi.fn((row: unknown) => ({
    eq: vi.fn(async () => {
      (updates[table] ??= []).push(row);
      return { error: null };
    }),
  })),
  delete: vi.fn(() => ({ lt: vi.fn(async () => ({ error: null })) })),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ rpc: rpcMock, from: fromMock })),
}));

const { GET } = await import("@/app/api/match/route");

function request(headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/match", { headers }) as never;
}

const MATCH_ROW = {
  seeker_id: "s1",
  listing_id: "l1",
  seeker_email: "seeker@example.com",
  seeker_phone: null,
  listing_email: "owner@example.com",
  listing_phone: "+919812345678",
  listing_rent: 30000,
  listing_bhk: "1BHK",
  listing_furnishing: "Semi-furnished",
  listing_whole_flat: true,
  listing_lat: 19.06,
  listing_lng: 72.83,
};

const ALERT_ROW = {
  alert_id: "a1",
  email: "watcher@example.com",
  listing_rent: 25000,
  listing_bhk: "1BHK",
  listing_furnishing: "Unfurnished",
  listing_whole_flat: true,
  listing_lat: 19.1,
  listing_lng: 72.85,
};

function stubResend(status = 200) {
  const fetchMock = vi.fn(async () => new Response("{}", { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  for (const k of [
    "CRON_SECRET", "RESEND_API_KEY", "SMS_ENABLED",
    "AWS_REGION", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY",
  ]) {
    delete process.env[k];
  }
  state.matches = { data: [], error: null };
  state.alerts = { data: [], error: null };
  inserts = {};
  updates = {};
});

describe("auth", () => {
  it("returns 401 when CRON_SECRET is set and the header is wrong or missing", async () => {
    process.env.CRON_SECRET = "topsecret";
    expect((await GET(request())).status).toBe(401);
    expect((await GET(request({ authorization: "Bearer wrong" }))).status).toBe(401);
  });

  it("passes with the right bearer token", async () => {
    process.env.CRON_SECRET = "topsecret";
    expect(
      (await GET(request({ authorization: "Bearer topsecret" }))).status
    ).toBe(200);
  });

  it("allows unauthenticated calls only when no secret is configured", async () => {
    expect((await GET(request())).status).toBe(200);
  });
});

describe("configuration", () => {
  it("returns 501 without the service role key", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect((await GET(request())).status).toBe(501);
  });

  it("returns 500 when the matcher RPC fails", async () => {
    state.matches = { data: [], error: { message: "no such function" } };
    expect((await GET(request())).status).toBe(500);
  });

  it("surfaces a missing area-alerts RPC without failing the run", async () => {
    state.alerts = { data: [], error: { message: "find_new_area_alerts missing" } };
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect((await res.json()).alertsError).toMatch(/missing/);
  });
});

describe("match flow", () => {
  it("reports zero pairs on an empty run", async () => {
    const body = await (await GET(request())).json();
    expect(body.pairs).toBe(0);
    expect(body.emailed).toBe(0);
  });

  it("records the pair even when email is unconfigured (skipped, not failed)", async () => {
    state.matches = { data: [MATCH_ROW], error: null };
    const body = await (await GET(request())).json();
    expect(body.pairs).toBe(1);
    expect(body.emailed).toBe(0);
    expect(body.emailsSkipped).toBe(true);
    expect(inserts["matches"]).toEqual([{ seeker_id: "s1", listing_id: "l1" }]);
  });

  it("emails both sides via Resend and counts them", async () => {
    process.env.RESEND_API_KEY = "re_test";
    const fetchMock = stubResend();
    state.matches = { data: [MATCH_ROW], error: null };

    const body = await (await GET(request())).json();
    expect(body.emailed).toBe(2);
    expect(body.emailsSkipped).toBe(false);

    const payloads = fetchMock.mock.calls.map((c) =>
      JSON.parse((c[1] as RequestInit).body as string)
    );
    const recipients = payloads.map((p) => p.to[0]);
    expect(recipients).toContain("seeker@example.com");
    expect(recipients).toContain("owner@example.com");

    // The seeker's email must contain the owner's contact — that IS the product.
    const seekerEmail = payloads.find((p) => p.to[0] === "seeker@example.com")!;
    expect(seekerEmail.html).toContain("owner@example.com");
    expect(seekerEmail.html).toContain("+919812345678");
  });

  it("does NOT record the match when the seeker email fails, so it retries", async () => {
    process.env.RESEND_API_KEY = "re_test";
    stubResend(500); // Resend rejects everything
    state.matches = { data: [MATCH_ROW], error: null };

    const body = await (await GET(request())).json();
    expect(body.failed).toBe(1);
    expect(inserts["matches"]).toBeUndefined();
  });
});

describe("area alerts", () => {
  it("emails the subscriber and marks the alert delivered", async () => {
    process.env.RESEND_API_KEY = "re_test";
    const fetchMock = stubResend();
    state.alerts = { data: [ALERT_ROW], error: null };

    const body = await (await GET(request())).json();
    expect(body.alerts).toBe(1);
    expect(body.alertsEmailed).toBe(1);
    expect(updates["area_alerts"]).toHaveLength(1);

    const recipients = fetchMock.mock.calls.map(
      (c) => JSON.parse((c[1] as RequestInit).body as string).to[0]
    );
    expect(recipients).toContain("watcher@example.com");
  });

  it("keeps the alert pending when email is unconfigured", async () => {
    state.alerts = { data: [ALERT_ROW], error: null };
    const body = await (await GET(request())).json();
    expect(body.alertsEmailed).toBe(0);
    expect(updates["area_alerts"]).toBeUndefined(); // notified_at untouched
  });
});
