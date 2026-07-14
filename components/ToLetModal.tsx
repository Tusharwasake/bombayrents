"use client";

import { useRef, useState } from "react";
import { NewToLetSpot } from "@/lib/types";
import Turnstile from "./Turnstile";

interface Props {
  location: { lat: number; lng: number };
  onClose: () => void;
  onSubmit: (spot: NewToLetSpot, photo: Blob | null) => Promise<void>;
}

/** Downscale to ≤1000px JPEG so uploads stay small on mobile data. */
async function downscale(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1000 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Could not process photo"))),
      "image/jpeg",
      0.8
    )
  );
}

export default function ToLetModal({ location, onClose, onSubmit }: Props) {
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const blob = await downscale(file);
      setPhoto(blob);
      if (preview) URL.revokeObjectURL(preview);
      setPreview(URL.createObjectURL(blob));
    } catch {
      setError("Could not read that photo — try another one.");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await onSubmit(
        {
          lat: location.lat,
          lng: location.lng,
          spotter_name: name.trim() || null,
          message: message.trim() || null,
        },
        photo
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
        <h2 className="text-lg font-bold">🪧 Spot a To-Let</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          See a To-Let board? Put it on the map — help the next flat-hunter skip
          the broker.
        </p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full overflow-hidden rounded-xl border-2 border-dashed border-amber-400 bg-amber-50 text-sm font-semibold text-amber-700 hover:bg-amber-100"
          >
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Board" className="max-h-52 w-full object-cover" />
            ) : (
              <span className="block py-6">📷 Tap to snap / upload board photo</span>
            )}
          </button>
          <p className="-mt-2 text-[11px] text-slate-400">
            ⓘ Shoot just the board — please avoid faces and number plates 🙏
          </p>

          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            📍 Location set · {location.lat.toFixed(4)}, {location.lng.toFixed(4)}
          </p>

          <label className="block">
            <span className="text-xs font-semibold text-slate-600">
              Your name (optional)
            </span>
            <input
              type="text"
              maxLength={40}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Tushar"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-slate-600">
              Your message (optional)
            </span>
            <input
              type="text"
              maxLength={140}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="e.g. Board says 2BHK, owner's number on it"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
            />
            <span className="mt-1 block text-[11px] text-slate-400">
              → both appear on the Superheroes board & on your spotted pin ✨
            </span>
          </label>

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
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-[2] rounded-xl bg-amber-500 py-2.5 text-sm font-bold text-amber-950 hover:bg-amber-400 disabled:opacity-60"
            >
              {saving ? "Saving…" : "🪧 Put it on the map"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
