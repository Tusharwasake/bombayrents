"use client";

import { useMemo } from "react";
import { daysAgo, ToLetSpot } from "@/lib/types";

interface Props {
  spots: ToLetSpot[];
  onClose: () => void;
}

const MEDALS = ["🥇", "🥈", "🥉"];

export default function SuperheroesModal({ spots, onClose }: Props) {
  const heroes = useMemo(() => {
    const byName = new Map<
      string,
      { count: number; latest: ToLetSpot }
    >();
    for (const s of spots) {
      if (!s.spotter_name) continue;
      const entry = byName.get(s.spotter_name);
      if (!entry) byName.set(s.spotter_name, { count: 1, latest: s });
      else {
        entry.count += 1;
        if (s.created_at > entry.latest.created_at) entry.latest = s;
      }
    }
    return [...byName.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
  }, [spots]);

  const anonymous = spots.filter((s) => !s.spotter_name).length;

  return (
    <div
      className="absolute inset-0 z-30 flex items-end justify-center bg-slate-900/40 p-4 backdrop-blur-[2px] sm:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold">🦸 Superheroes</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              People who spotted To-Let boards so you skip the broker.{" "}
              {spots.length.toLocaleString("en-IN")} boards on the map so far.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-lg leading-none text-slate-400 hover:bg-slate-100"
          >
            ×
          </button>
        </div>

        <div className="mt-4 space-y-2">
          {heroes.length === 0 && (
            <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
              No named spotters yet — spot a To-Let board and claim the 🥇!
            </p>
          )}
          {heroes.map((h, i) => (
            <div key={h.name} className="flex items-start gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
              <span className="w-7 text-center text-lg">{MEDALS[i] ?? `${i + 1}.`}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-800">{h.name}</p>
                {h.latest.message && (
                  <p className="truncate text-xs italic text-slate-500">
                    “{h.latest.message}”
                  </p>
                )}
                <p className="text-[10px] text-slate-400">
                  last spot {daysAgo(h.latest.created_at)}
                </p>
              </div>
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">
                {h.count} {h.count === 1 ? "board" : "boards"}
              </span>
            </div>
          ))}
          {anonymous > 0 && (
            <p className="pt-1 text-center text-[11px] text-slate-400">
              + {anonymous} anonymous {anonymous === 1 ? "spot" : "spots"} 🤫
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
