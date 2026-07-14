"use client";

import { useEffect, useRef, useState } from "react";

interface Result {
  display_name: string;
  lat: string;
  lon: string;
}

interface Props {
  onGo: (lat: number, lng: number) => void;
  onLocate: () => void;
}

// Nominatim search restricted to the Mumbai Metropolitan Region viewbox
// (same box the map is locked to).
const SEARCH_URL =
  "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&bounded=1&viewbox=72.6,19.5,73.35,18.75&q=";

export default function SearchBar({ onGo, onLocate }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) {
        setResults(null);
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || searching) return;
    setSearching(true);
    try {
      const res = await fetch(SEARCH_URL + encodeURIComponent(query.trim()));
      setResults((await res.json()) as Result[]);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const locate = () => {
    onLocate();
    setResults(null);
    setOpen(false);
  };

  return (
    <div ref={boxRef} className="pointer-events-auto relative w-full max-w-xs">
      <form onSubmit={search}>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="🔍 Search neighbourhood or area…"
          className="w-full rounded-2xl bg-white/95 px-4 py-2.5 text-sm shadow-lg backdrop-blur placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </form>
      {searching && (
        <p className="absolute mt-1 w-full rounded-xl bg-white px-3 py-2 text-xs text-slate-400 shadow-lg">
          Searching…
        </p>
      )}
      {(open || results) && !searching && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl bg-white shadow-lg">
          <button
            onClick={locate}
            className="block w-full border-b border-slate-100 px-3 py-2 text-left text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
          >
            📍 Use my current location
          </button>
          {results?.length === 0 && (
            <p className="px-3 py-2 text-xs text-slate-400">
              Nothing found inside Mumbai / Navi Mumbai.
            </p>
          )}
          {results?.map((r, i) => (
            <button
              key={i}
              onClick={() => {
                onGo(Number(r.lat), Number(r.lon));
                setResults(null);
                setOpen(false);
                setQuery(r.display_name.split(",")[0]);
              }}
              className="block w-full truncate border-b border-slate-100 px-3 py-2 text-left text-xs text-slate-700 last:border-0 hover:bg-slate-50"
            >
              {r.display_name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
