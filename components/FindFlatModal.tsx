"use client";

import { useMemo, useState } from "react";
import { Bhk, BHK_OPTIONS, inrShort, NewSeeker, RentPin } from "@/lib/types";
import Turnstile from "./Turnstile";

interface Props {
  location: { lat: number; lng: number };
  pins: RentPin[];
  onClose: () => void;
  onSubmit: (seeker: NewSeeker) => Promise<void>;
}

const KM = 111.32;

/** "1BHK ₹15K (67 pins) · 2BHK ₹30K (70 pins)" for pins within 2 km. */
function medianHint(pins: RentPin[], lat: number, lng: number): string | null {
  const nearby = pins.filter((p) => {
    const dLat = (p.lat - lat) * KM;
    const dLng = (p.lng - lng) * KM * Math.cos((lat * Math.PI) / 180);
    return Math.hypot(dLat, dLng) <= 2;
  });
  const byBhk = new Map<Bhk, number[]>();
  for (const p of nearby) {
    const arr = byBhk.get(p.bhk) ?? [];
    arr.push(p.rent);
    byBhk.set(p.bhk, arr);
  }
  const parts = [...byBhk.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 3)
    .sort((a, b) => BHK_OPTIONS.indexOf(a[0]) - BHK_OPTIONS.indexOf(b[0]))
    .map(([bhk, rents]) => {
      rents.sort((a, b) => a - b);
      const median = rents[Math.floor(rents.length / 2)];
      return `${bhk} ₹${inrShort(median)} (${rents.length} ${rents.length === 1 ? "pin" : "pins"})`;
    });
  return parts.length > 0 ? parts.join(" · ") : null;
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
        active
          ? "bg-orange-700 text-white"
          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      }`}
    >
      {children}
    </button>
  );
}

export default function FindFlatModal({ location, pins, onClose, onSubmit }: Props) {
  const [budget, setBudget] = useState("");
  const hint = useMemo(
    () => medianHint(pins, location.lat, location.lng),
    [pins, location.lat, location.lng]
  );
  const [bhk, setBhk] = useState<Bhk>("1BHK");
  const [roomOk, setRoomOk] = useState(false);
  const [veg, setVeg] = useState(false);
  const [smoker, setSmoker] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const budgetNum = Number(budget);
    if (!Number.isFinite(budgetNum) || budgetNum < 1000 || budgetNum > 2000000) {
      setError("Enter a max budget between ₹1,000 and ₹20,00,000.");
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setError("Enter a valid email — that's where your matches arrive.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSubmit({
        lat: location.lat,
        lng: location.lng,
        budget_max: budgetNum,
        bhk,
        room_ok: roomOk,
        veg,
        smoker,
        contact_email: email.trim(),
        contact_phone: phone.trim() || null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSaving(false);
    }
  };

  return (
    <div
      className="absolute inset-0 z-30 flex items-end justify-center bg-slate-900/40 p-4 backdrop-blur-[2px] sm:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold">Find a flat near this spot</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          You&apos;ll instantly see matching flats within 2.5&nbsp;km, and get owner
          contacts by email as new ones appear. Your pin expires after 30 days.
        </p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">
              Max budget (₹/month) *
            </span>
            <input
              type="number"
              required
              autoFocus
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="40000"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-orange-600 focus:outline-none"
            />
            {hint && (
              <span className="mt-1 block text-[11px] text-slate-400">
                Median rent in 2km radius: {hint}
              </span>
            )}
          </label>

          <div>
            <span className="text-xs font-semibold text-slate-600">Size</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {BHK_OPTIONS.map((o) => (
                <Chip key={o} active={bhk === o} onClick={() => setBhk(o)}>
                  {o}
                </Chip>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <Chip active={roomOk} onClick={() => setRoomOk(!roomOk)}>
              🛏️ Open to shared rooms
            </Chip>
            <Chip active={veg} onClick={() => setVeg(!veg)}>
              🥬 Vegetarian
            </Chip>
            <Chip active={smoker} onClick={() => setSmoker(!smoker)}>
              🚬 Smoker
            </Chip>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-semibold text-slate-600">Email *</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-orange-600 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-600">Phone</span>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="98XXXXXXXX"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-orange-600 focus:outline-none"
              />
            </label>
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>
          )}

          <Turnstile />

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl bg-slate-100 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-200"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-[2] rounded-xl bg-orange-700 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
            >
              {saving ? "Searching…" : "Show my matches"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
