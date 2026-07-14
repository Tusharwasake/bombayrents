"use client";

import { daysAgo, ToLetSpot } from "@/lib/types";

interface Props {
  spot: ToLetSpot;
  onClose: () => void;
  onReport: (spotId: string) => void;
}

export default function ToLetCard({ spot, onClose, onReport }: Props) {
  return (
    <div className="absolute inset-x-0 bottom-0 z-20 max-h-[72vh] overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:inset-x-auto sm:bottom-auto sm:right-3 sm:top-20 sm:w-[340px] sm:rounded-2xl">
      <div className="sticky top-0 flex items-start justify-between gap-2 border-b border-slate-100 bg-white p-4 pb-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-600">
            🪧 Spotted To-Let board
          </p>
          <p className="text-xs text-slate-400">Spotted {daysAgo(spot.created_at)}</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onReport(spot.id)}
            title="Flag as wrong or spam"
            className="rounded-lg px-2 py-1 text-sm text-slate-400 hover:bg-slate-100"
          >
            🚩
          </button>
          <button
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-lg leading-none text-slate-400 hover:bg-slate-100"
          >
            ×
          </button>
        </div>
      </div>

      <div className="space-y-3 p-4">
        {spot.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={spot.photo_url}
            alt="To-Let board"
            className="w-full rounded-xl object-cover"
          />
        ) : (
          <p className="rounded-xl bg-slate-50 px-3 py-6 text-center text-xs text-slate-400">
            No photo — go take a look at the board yourself!
          </p>
        )}

        {spot.message && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            “{spot.message}”
          </p>
        )}

        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500">
            {spot.spotter_name ? (
              <>
                Spotted by <span className="font-semibold">🦸 {spot.spotter_name}</span>
              </>
            ) : (
              "Spotted by an anonymous superhero"
            )}
          </span>
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${spot.lat},${spot.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-emerald-700 hover:underline"
          >
            Get directions 📍
          </a>
        </div>

        <p className="text-[11px] leading-snug text-slate-400">
          Call the number on the board directly — no broker involved. If the
          board is gone, flag this pin so we can take it down.
        </p>
      </div>
    </div>
  );
}
