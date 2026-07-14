"use client";

import { useState } from "react";
import {
  Bhk,
  BHK_OPTIONS,
  Furnishing,
  FURNISHING_OPTIONS,
  NewListing,
} from "@/lib/types";
import Turnstile from "./Turnstile";

interface Props {
  location: { lat: number; lng: number };
  onClose: () => void;
  onSubmit: (listing: NewListing) => Promise<void>;
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
          ? "bg-sky-700 text-white"
          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      }`}
    >
      {children}
    </button>
  );
}

export default function ListFlatModal({ location, onClose, onSubmit }: Props) {
  const [rent, setRent] = useState("");
  const [deposit, setDeposit] = useState("");
  const [bhk, setBhk] = useState<Bhk>("1BHK");
  const [furnishing, setFurnishing] = useState<Furnishing>("Semi-furnished");
  const [wholeFlat, setWholeFlat] = useState(true);
  const [vegOnly, setVegOnly] = useState(false);
  const [smokingOk, setSmokingOk] = useState(true);
  const [parking, setParking] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const rentNum = Number(rent);
    if (!Number.isFinite(rentNum) || rentNum < 1000 || rentNum > 2000000) {
      setError("Enter a monthly rent between ₹1,000 and ₹20,00,000.");
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setError("Enter a valid email — matched seekers reach you there.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSubmit({
        lat: location.lat,
        lng: location.lng,
        rent: rentNum,
        deposit: deposit ? Number(deposit) : null,
        bhk,
        furnishing,
        whole_flat: wholeFlat,
        veg_only: vegOnly,
        smoking_ok: smokingOk,
        parking,
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
        <h2 className="text-lg font-bold">List your flat — free, no broker</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Your contact is <b>never shown on the map</b>. It&apos;s emailed only to
          seekers whose budget, size and location match.
        </p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="flex gap-1.5">
            <Chip active={wholeFlat} onClick={() => setWholeFlat(true)}>
              Whole flat
            </Chip>
            <Chip active={!wholeFlat} onClick={() => setWholeFlat(false)}>
              Room in shared flat
            </Chip>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-semibold text-slate-600">
                Monthly rent (₹) *
              </span>
              <input
                type="number"
                required
                autoFocus
                value={rent}
                onChange={(e) => setRent(e.target.value)}
                placeholder="35000"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-600 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-600">
                Deposit (₹)
              </span>
              <input
                type="number"
                value={deposit}
                onChange={(e) => setDeposit(e.target.value)}
                placeholder="150000"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-600 focus:outline-none"
              />
            </label>
          </div>

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

          <div>
            <span className="text-xs font-semibold text-slate-600">Furnishing</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {FURNISHING_OPTIONS.map((o) => (
                <Chip key={o} active={furnishing === o} onClick={() => setFurnishing(o)}>
                  {o}
                </Chip>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <Chip active={parking} onClick={() => setParking(!parking)}>
              🚗 Parking
            </Chip>
            <Chip active={vegOnly} onClick={() => setVegOnly(!vegOnly)}>
              🥬 Veg only
            </Chip>
            <Chip active={!smokingOk} onClick={() => setSmokingOk(!smokingOk)}>
              🚭 No smoking
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
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-600 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-600">Phone</span>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="98XXXXXXXX"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-600 focus:outline-none"
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
              className="flex-[2] rounded-xl bg-sky-700 py-2.5 text-sm font-semibold text-white hover:bg-sky-600 disabled:opacity-60"
            >
              {saving ? "Saving…" : "List my flat"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
