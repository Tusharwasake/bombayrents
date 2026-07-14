"use client";

import { useState } from "react";
import { formatINR, statsByBhk } from "@/lib/stats";
import { Bhk, BHK_COLORS, RentPin } from "@/lib/types";

interface Props {
  pins: RentPin[];
  bhkFilter: Bhk | null;
}

export default function StatsPanel({ pins, bhkFilter }: Props) {
  const [open, setOpen] = useState(true);
  const stats = statsByBhk(pins);

  return (
    <div className="absolute right-3 top-32 z-10 w-60 sm:top-24">
      <button
        onClick={() => setOpen((o) => !o)}
        className="mb-1.5 ml-auto block rounded-xl bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-lg backdrop-blur hover:bg-white"
      >
        {open ? "Hide stats" : "📊 Area stats"}
      </button>

      {open && (
        <div className="rounded-2xl bg-white/95 p-4 shadow-lg backdrop-blur">
          <h3 className="text-sm font-bold text-slate-800">This map area</h3>
          <p className="text-xs text-slate-500">
            {pins.length.toLocaleString("en-IN")} rent{" "}
            {pins.length === 1 ? "pin" : "pins"}
            {bhkFilter ? ` · ${bhkFilter} only` : ""}
          </p>

          {stats.length === 0 ? (
            <p className="mt-3 text-xs text-slate-400">
              No pins in view — zoom out or pan around.
            </p>
          ) : (
            <table className="mt-3 w-full text-xs">
              <thead>
                <tr className="text-left text-slate-400">
                  <th className="pb-1 font-medium">Size</th>
                  <th className="pb-1 text-right font-medium">Median rent</th>
                  <th className="pb-1 text-right font-medium">#</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((s) => (
                  <tr key={s.bhk} className="border-t border-slate-100">
                    <td className="py-1.5">
                      <span className="flex items-center gap-1.5 font-semibold text-slate-700">
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ backgroundColor: BHK_COLORS[s.bhk] }}
                        />
                        {s.bhk}
                      </span>
                    </td>
                    <td className="py-1.5 text-right font-bold text-slate-800">
                      {formatINR(s.medianRent)}
                    </td>
                    <td className="py-1.5 text-right text-slate-400">{s.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {stats.some((s) => s.medianDeposit != null) && (
            <p className="mt-2 border-t border-slate-100 pt-2 text-[11px] text-slate-500">
              Median deposit:{" "}
              {stats
                .filter((s) => s.medianDeposit != null)
                .map((s) => `${s.bhk} ${formatINR(s.medianDeposit!)}`)
                .join(" · ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
