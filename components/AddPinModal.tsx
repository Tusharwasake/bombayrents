"use client";

import { useState } from "react";
import {
  Bhk,
  BHK_OPTIONS,
  HOUSING_OPTIONS,
  HousingType,
  NewRentPin,
  PetsPolicy,
  PinFurnishing,
  TenantType,
} from "@/lib/types";
import Turnstile from "./Turnstile";

interface Props {
  location: { lat: number; lng: number };
  onClose: () => void;
  onSubmit: (pin: NewRentPin, alertEmail: string | null) => Promise<void>;
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
          ? "bg-emerald-600 text-white"
          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      }`}
    >
      {children}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="text-xs font-semibold text-slate-600">{label}</span>
      <div className="mt-1.5 flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

export default function AddPinModal({ location, onClose, onSubmit }: Props) {
  const [rent, setRent] = useState("");
  const [deposit, setDeposit] = useState("");
  const [bhk, setBhk] = useState<Bhk>("1BHK");
  const [housing, setHousing] = useState<HousingType>("Society");
  const [furnishing, setFurnishing] = useState<PinFurnishing | null>(null);
  const [maintenance, setMaintenance] = useState<boolean | null>(null);
  const [gated, setGated] = useState<boolean | null>(null);
  const [tenant, setTenant] = useState<TenantType | null>(null);
  const [pets, setPets] = useState<PetsPolicy | null>(null);
  const [parking, setParking] = useState("");
  const [sqft, setSqft] = useState("");
  const [society, setSociety] = useState("");
  const [note, setNote] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = <T,>(setter: (v: T | null) => void, current: T | null, value: T) =>
    setter(current === value ? null : value);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const rentNum = Number(rent);
    const depositNum = deposit ? Number(deposit) : null;
    const parkingNum = parking ? Number(parking) : null;
    const sqftNum = sqft ? Number(sqft) : null;
    if (!Number.isFinite(rentNum) || rentNum < 1000 || rentNum > 2000000) {
      setError("Enter a monthly rent between ₹1,000 and ₹20,00,000.");
      return;
    }
    if (depositNum !== null && (!Number.isFinite(depositNum) || depositNum < 0)) {
      setError("Deposit must be a positive number.");
      return;
    }
    if (parkingNum !== null && (!Number.isInteger(parkingNum) || parkingNum < 0 || parkingNum > 20)) {
      setError("Parking must be a whole number between 0 and 20.");
      return;
    }
    if (sqftNum !== null && (sqftNum < 50 || sqftNum > 20000)) {
      setError("Square footage must be between 50 and 20,000.");
      return;
    }
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setError("That email doesn't look right.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSubmit(
        {
          lat: location.lat,
          lng: location.lng,
          rent: rentNum,
          deposit: depositNum,
          bhk,
          housing_type: housing,
          furnishing,
          maintenance_included: maintenance,
          gated,
          tenant_type: tenant,
          pets,
          parking_count: parkingNum,
          sqft: sqftNum,
          society: society.trim() || null,
          note: note.trim() || null,
        },
        email.trim() || null
      );
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
        <h2 className="text-lg font-bold">What do you pay here?</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          100% anonymous — location is rounded to ~100m. Only rent, size and BHK
          are required; everything else makes your pin more useful.
        </p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
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
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
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
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </label>
          </div>

          <Field label="Size *">
            {BHK_OPTIONS.map((option) => (
              <Chip key={option} active={bhk === option} onClick={() => setBhk(option)}>
                {option}
              </Chip>
            ))}
          </Field>

          <Field label="Housing type *">
            {HOUSING_OPTIONS.map((option) => (
              <Chip
                key={option}
                active={housing === option}
                onClick={() => setHousing(option)}
              >
                {option}
              </Chip>
            ))}
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Furnishing">
              <Chip
                active={furnishing === "Furnished"}
                onClick={() => toggle(setFurnishing, furnishing, "Furnished")}
              >
                🛋 Furnished
              </Chip>
              <Chip
                active={furnishing === "Unfurnished"}
                onClick={() => toggle(setFurnishing, furnishing, "Unfurnished")}
              >
                📦 Unfurnished
              </Chip>
            </Field>
            <Field label="Maintenance in rent?">
              <Chip
                active={maintenance === true}
                onClick={() => toggle(setMaintenance, maintenance, true)}
              >
                ✓ Included
              </Chip>
              <Chip
                active={maintenance === false}
                onClick={() => toggle(setMaintenance, maintenance, false)}
              >
                ✗ Extra
              </Chip>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Gated society?">
              <Chip active={gated === true} onClick={() => toggle(setGated, gated, true)}>
                🏘 Gated
              </Chip>
              <Chip active={gated === false} onClick={() => toggle(setGated, gated, false)}>
                🚪 Not gated
              </Chip>
            </Field>
            <Field label="Who lives here?">
              <Chip
                active={tenant === "Family"}
                onClick={() => toggle(setTenant, tenant, "Family")}
              >
                👨‍👩‍👧 Family
              </Chip>
              <Chip
                active={tenant === "Bachelor"}
                onClick={() => toggle(setTenant, tenant, "Bachelor")}
              >
                🎓 Bachelor
              </Chip>
            </Field>
          </div>

          <Field label="Pets allowed?">
            {(["Yes", "No", "Not sure"] as PetsPolicy[]).map((p) => (
              <Chip key={p} active={pets === p} onClick={() => toggle(setPets, pets, p)}>
                {p === "Yes" ? "🐕 Yes" : p === "No" ? "🚫 No" : "🤷 Not sure"}
              </Chip>
            ))}
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-semibold text-slate-600">
                🚗 Parking (cars)
              </span>
              <input
                type="number"
                min={0}
                max={20}
                value={parking}
                onChange={(e) => setParking(e.target.value)}
                placeholder="0 = none"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-600">
                Square footage
              </span>
              <input
                type="number"
                value={sqft}
                onChange={(e) => setSqft(e.target.value)}
                placeholder="850"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-semibold text-slate-600">
              Society / building name
            </span>
            <input
              type="text"
              maxLength={80}
              value={society}
              onChange={(e) => setSociety(e.target.value)}
              placeholder="e.g. Sobha Heights"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-slate-600">
              One-liner on the stay
            </span>
            <input
              type="text"
              maxLength={140}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Great locality, noisy at night"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-slate-600">Your email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@gmail.com"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            />
            <span className="mt-1 block text-[11px] text-slate-400">
              Never shown publicly — we&apos;ll only mail you when a flat opens up
              within 1&nbsp;km.
            </span>
          </label>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
              {error}
            </p>
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
              className="flex-[2] rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Drop my pin"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
