// /api/submit gateway: rate limiting, captcha gating, validation, and the
// write allow-list. Supabase is mocked; env is controlled per test.
import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Supabase mock -----------------------------------------------------------
const rpcMock = vi.fn();
const insertResult = { data: null as unknown, error: null as unknown };

function tableMock() {
  const target = {
    insert: vi.fn((): unknown => proxy),
    select: vi.fn((): unknown => proxy),
    single: vi.fn(async () => ({ ...insertResult })),
  };
  // Awaiting any point in the chain (e.g. `await from().insert(row)` with no
  // .select()) resolves like a PostgREST query result.
  const proxy: typeof target = new Proxy(target, {
    get(t, prop) {
      if (prop === "then") {
        return (resolve: (v: unknown) => void) => resolve({ ...insertResult });
      }
      return t[prop as keyof typeof t];
    },
  });
  return proxy;
}

const fromMock = vi.fn(() => tableMock());

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ rpc: rpcMock, from: fromMock })),
}));

const { POST } = await import("@/app/api/submit/route");

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
    // Route handlers accept the web Request; NextRequest only adds sugar.
  }) as never;
}

const VALID_PIN = {
  kind: "pin",
  payload: { lat: 19.06, lng: 72.83, rent: 30000, bhk: "1BHK", housing_type: "Society" },
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  delete process.env.TURNSTILE_SECRET_KEY;
  rpcMock.mockResolvedValue({ data: true, error: null }); // rate limit: allowed
  insertResult.data = { id: "new-row" };
  insertResult.error = null;
});

describe("configuration and input guards", () => {
  it("returns 501 when the service key is missing", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const res = await POST(request(VALID_PIN));
    expect(res.status).toBe(501);
  });

  it("rejects malformed JSON with 400", async () => {
    const res = await POST(request("{not json"));
    expect(res.status).toBe(400);
  });

  it("rejects an unknown kind with 400", async () => {
    const res = await POST(request({ kind: "drop_table", payload: {} }));
    expect(res.status).toBe(400);
  });

  it("rejects a missing kind with 400", async () => {
    const res = await POST(request({ payload: {} }));
    expect(res.status).toBe(400);
  });
});

describe("rate limiting", () => {
  it("returns 429 when the limiter says no", async () => {
    rpcMock.mockResolvedValueOnce({ data: false, error: null });
    const res = await POST(request(VALID_PIN));
    expect(res.status).toBe(429);
  });

  it("returns 500 when the limiter itself errors", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    const res = await POST(request(VALID_PIN));
    expect(res.status).toBe(500);
  });

  it("hashes the client IP before passing it to the limiter", async () => {
    await POST(request(VALID_PIN, { "x-forwarded-for": "1.2.3.4, 10.0.0.1" }));
    const args = rpcMock.mock.calls[0][1];
    expect(args.p_action).toBe("pin");
    expect(args.p_ip).toMatch(/^[a-f0-9]{64}$/); // sha256, not the raw IP
    expect(args.p_ip).not.toContain("1.2.3.4");
  });
});

describe("captcha gating", () => {
  it("blocks captcha-protected kinds when a secret is set and no token sent", async () => {
    process.env.TURNSTILE_SECRET_KEY = "secret";
    const res = await POST(request(VALID_PIN));
    expect(res.status).toBe(403);
  });

  it("does not require captcha for ratings/reports", async () => {
    process.env.TURNSTILE_SECRET_KEY = "secret";
    const res = await POST(
      request({ kind: "rating", payload: { pin_id: "abc", rating: 4 } })
    );
    expect(res.status).toBe(200);
  });

  it("skips captcha entirely when not configured", async () => {
    const res = await POST(request(VALID_PIN));
    expect(res.status).toBe(200);
  });
});

describe("email validation", () => {
  const cases = [
    ["listing", { contact_email: "not-an-email" }],
    ["seeker", { contact_email: "a@b" }],
    ["alert", { email: "" }],
    ["alert", { email: "a b@c.com" }],
  ] as const;

  for (const [kind, payload] of cases) {
    it(`rejects bad email for ${kind}: ${JSON.stringify(payload)}`, async () => {
      const res = await POST(request({ kind, payload }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/email/i);
    });
  }

  it("accepts a valid listing email", async () => {
    const res = await POST(
      request({
        kind: "listing",
        payload: { lat: 19, lng: 72.9, rent: 30000, bhk: "1BHK", contact_email: "a@b.co" },
      })
    );
    expect(res.status).toBe(200);
  });

  it("rejects emails longer than 254 chars", async () => {
    const res = await POST(
      request({
        kind: "alert",
        payload: { lat: 19, lng: 72.9, email: "x".repeat(250) + "@b.co" },
      })
    );
    expect(res.status).toBe(400);
  });
});

describe("field allow-list (mass-assignment protection)", () => {
  it("strips fields not on the pin allow-list", async () => {
    await POST(
      request({
        kind: "pin",
        payload: { ...VALID_PIN.payload, hidden: false, report_count: 99, id: "hack" },
      })
    );
    const table = fromMock.mock.results[0].value;
    const inserted = table.insert.mock.calls[0][0];
    expect(inserted).not.toHaveProperty("hidden");
    expect(inserted).not.toHaveProperty("report_count");
    expect(inserted).not.toHaveProperty("id");
    expect(inserted.rent).toBe(30000);
  });

  it("strips active_until/hidden from listings", async () => {
    await POST(
      request({
        kind: "listing",
        payload: {
          lat: 19, lng: 72.9, rent: 30000, bhk: "1BHK",
          contact_email: "a@b.co", hidden: false, active_until: "2099-01-01",
        },
      })
    );
    const table = fromMock.mock.results[0].value;
    const inserted = table.insert.mock.calls[0][0];
    expect(inserted).not.toHaveProperty("hidden");
    expect(inserted).not.toHaveProperty("active_until");
  });
});

describe("to-let photo hotlink protection", () => {
  it("rejects photo URLs outside our storage bucket", async () => {
    const res = await POST(
      request({
        kind: "tolet",
        payload: { lat: 19, lng: 72.9, photo_url: "https://evil.example/x.jpg" },
      })
    );
    expect(res.status).toBe(400);
  });

  it("accepts a photo from our own bucket", async () => {
    const res = await POST(
      request({
        kind: "tolet",
        payload: {
          lat: 19, lng: 72.9,
          photo_url:
            "https://test.supabase.co/storage/v1/object/public/tolet-photos/a.jpg",
        },
      })
    );
    expect(res.status).toBe(200);
  });

  it("accepts a to-let spot with no photo", async () => {
    const res = await POST(request({ kind: "tolet", payload: { lat: 19, lng: 72.9 } }));
    expect(res.status).toBe(200);
  });
});

describe("area alerts", () => {
  it("treats duplicate subscriptions (23505) as success", async () => {
    insertResult.error = { code: "23505", message: "duplicate" };
    const res = await POST(
      request({ kind: "alert", payload: { lat: 19, lng: 72.9, email: "a@b.co" } })
    );
    expect(res.status).toBe(200);
  });

  it("propagates other insert errors", async () => {
    insertResult.error = { code: "23514", message: "check violation" };
    const res = await POST(
      request({ kind: "alert", payload: { lat: 19, lng: 72.9, email: "a@b.co" } })
    );
    expect(res.status).toBe(400);
  });
});
