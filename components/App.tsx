"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addAreaAlert,
  addListing,
  addPin,
  addSeeker,
  addToLet,
  availableFlats,
  fetchPins,
  fetchToLets,
  isLive,
  matchPreview as fetchMatchPreview,
  reportPin,
  reportToLet,
} from "@/lib/data";
import { Bounds, pinsInBounds } from "@/lib/stats";
import {
  Bhk,
  BHK_COLORS,
  BHK_OPTIONS,
  MatchPreviewItem,
  NewListing,
  NewRentPin,
  NewSeeker,
  NewToLetSpot,
  RentPin,
  ToLetSpot,
} from "@/lib/types";
import SearchBar from "./SearchBar";
import StatsPanel from "./StatsPanel";

const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-slate-500">
      Loading map…
    </div>
  ),
});

// Modals and detail cards only appear after a user interaction, so they're
// code-split out of the initial bundle and fetched on first open.
const AddPinModal = dynamic(() => import("./AddPinModal"));
const FindFlatModal = dynamic(() => import("./FindFlatModal"));
const ListFlatModal = dynamic(() => import("./ListFlatModal"));
const ToLetModal = dynamic(() => import("./ToLetModal"));
const SuperheroesModal = dynamic(() => import("./SuperheroesModal"));
const PinCard = dynamic(() => import("./PinCard"));
const ToLetCard = dynamic(() => import("./ToLetCard"));

export type City = "mumbai" | "navi-mumbai";
export type PickPurpose = "rent" | "list" | "seek" | "tolet";

const PICK_BANNERS: Record<PickPurpose, string> = {
  rent: "Tap the map at your building's location",
  list: "Tap the map where your flat is",
  seek: "Tap the map where you want to live",
  tolet: "Tap the map where you saw the To-Let board",
};

const TRANSIT_LEGEND: [string, string][] = [
  ["#0284c7", "Western"],
  ["#dc2626", "Central"],
  ["#16a34a", "Harbour"],
  ["#9333ea", "Trans-Harbour"],
  ["#f97316", "Metro (dashed)"],
];

export default function App() {
  const [pins, setPins] = useState<RentPin[]>([]);
  const [toLets, setToLets] = useState<ToLetSpot[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [bhkFilter, setBhkFilter] = useState<Bhk | null>(null);
  const [city, setCity] = useState<City>("mumbai");
  const [picking, setPicking] = useState<PickPurpose | null>(null);
  const [picked, setPicked] = useState<{
    purpose: PickPurpose;
    lat: number;
    lng: number;
  } | null>(null);
  const [showTransit, setShowTransit] = useState(false);
  const [matches, setMatches] = useState<MatchPreviewItem[] | null>(null);
  const [availableMode, setAvailableMode] = useState(false);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [selectedToLetId, setSelectedToLetId] = useState<string | null>(null);
  const [showSuperheroes, setShowSuperheroes] = useState(false);
  const [focus, setFocus] = useState<{ lat: number; lng: number; at: number } | null>(
    null
  );
  const [locate, setLocate] = useState<number | null>(null);

  useEffect(() => {
    fetchPins()
      .then(setPins)
      .catch((e) => setLoadError(e.message));
    fetchToLets()
      .then(setToLets)
      .catch(() => {}); // To-Let layer is best-effort
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  const visiblePins = useMemo(
    () => (bhkFilter ? pins.filter((p) => p.bhk === bhkFilter) : pins),
    [pins, bhkFilter]
  );

  const statsPins = useMemo(
    () => (bounds ? pinsInBounds(visiblePins, bounds) : visiblePins),
    [visiblePins, bounds]
  );

  const selectedPin = useMemo(
    () => pins.find((p) => p.id === selectedPinId) ?? null,
    [pins, selectedPinId]
  );
  const selectedToLet = useMemo(
    () => toLets.find((t) => t.id === selectedToLetId) ?? null,
    [toLets, selectedToLetId]
  );

  const handleMapClick = useCallback(
    (lat: number, lng: number) => {
      if (picking) setPicked({ purpose: picking, lat, lng });
    },
    [picking]
  );

  const closeModal = () => {
    setPicked(null);
    setPicking(null);
  };

  const handleAddPin = async (input: NewRentPin, alertEmail: string | null) => {
    const pin = await addPin(input);
    setPins((prev) => [...prev, pin]);
    if (alertEmail) {
      // Their optional email doubles as a 1-km "flat opened here" alert.
      addAreaAlert(pin.lat, pin.lng, alertEmail).catch(() => {});
    }
    closeModal();
    setToast(
      isLive
        ? "Thanks! Your rent pin is on the map."
        : "Pin saved locally (demo mode — connect Supabase to go live)."
    );
  };

  const handleAddListing = async (input: NewListing) => {
    await addListing(input);
    closeModal();
    setToast(
      "Your flat is listed! Matching seekers will get your contact by email. It's never shown on the map."
    );
  };

  const handleAddSeeker = async (input: NewSeeker) => {
    await addSeeker(input);
    let found: MatchPreviewItem[] = [];
    try {
      found = await fetchMatchPreview(input);
    } catch {
      // preview is best-effort; registration already succeeded
    }
    closeModal();
    setMatches(found);
    setAvailableMode(false);
    setToast(
      found.length > 0
        ? `${found.length} matching ${found.length === 1 ? "flat" : "flats"} right now — shown in orange. You'll be emailed as new ones appear.`
        : "No matches yet — you'll get an email as soon as a matching flat is listed."
    );
  };

  const handleAddToLet = async (spot: NewToLetSpot, photo: Blob | null) => {
    const created = await addToLet(spot, photo);
    setToLets((prev) => [created, ...prev]);
    closeModal();
    setToast("🪧 On the map! You just saved someone a broker fee. Superhero ✨");
  };

  // One report per browser per item — stops a single person from hiding a pin
  // solo by flagging it three times.
  const alreadyReported = (id: string) =>
    !!window.localStorage.getItem(`bombayrent_reported_${id}`);
  const markReported = (id: string) =>
    window.localStorage.setItem(`bombayrent_reported_${id}`, "1");

  const handleReport = async (pinId: string) => {
    setSelectedPinId(null);
    if (pinId.startsWith("seed-")) {
      setToast("Demo pin — flagging works on real pins once Supabase is live.");
      return;
    }
    if (alreadyReported(pinId)) {
      setToast("You've already flagged this pin — others' flags will hide it.");
      return;
    }
    try {
      await reportPin(pinId);
      markReported(pinId);
      // Reflect the flag on the map immediately; 3 reports hides the pin.
      setPins((prev) =>
        prev
          .map((p) =>
            p.id === pinId ? { ...p, report_count: p.report_count + 1 } : p
          )
          .filter((p) => p.report_count < 3)
      );
      setToast("Reported. Pins are hidden automatically after 3 reports.");
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Report failed.");
    }
  };

  const handleRated = useCallback((pinId: string, stars: number) => {
    setPins((prev) =>
      prev.map((p) =>
        p.id === pinId
          ? {
              ...p,
              rating_sum: p.rating_sum + stars,
              rating_count: p.rating_count + 1,
            }
          : p
      )
    );
  }, []);

  const handleReportToLet = async (spotId: string) => {
    setSelectedToLetId(null);
    if (alreadyReported(spotId)) {
      setToast("You've already flagged this spot — others' flags will hide it.");
      return;
    }
    try {
      await reportToLet(spotId);
      markReported(spotId);
      setToast("Reported. Spots are hidden automatically after 3 reports.");
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Report failed.");
    }
  };

  const handleToggleAvailable = async () => {
    if (availableMode) {
      setMatches(null);
      setAvailableMode(false);
      return;
    }
    try {
      const flats = await availableFlats();
      setMatches(flats);
      setAvailableMode(true);
      setSelectedPinId(null);
      setToast(
        flats.length > 0
          ? `${flats.length} ${flats.length === 1 ? "flat is" : "flats are"} available right now — shown in orange.`
          : "No flats listed right now — be the first: List my flat."
      );
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Could not load available flats.");
    }
  };

  return (
    <div className="relative h-dvh w-full overflow-hidden">
      <MapView
        pins={visiblePins}
        city={city}
        picking={picking}
        showTransit={showTransit}
        matchPreview={matches}
        toLets={toLets}
        focus={focus}
        locate={locate}
        onLocateError={setToast}
        onMapClick={handleMapClick}
        onPickHere={(purpose, lat, lng) => setPicked({ purpose, lat, lng })}
        onSelectPin={(id) => {
          setSelectedToLetId(null);
          setSelectedPinId(id);
        }}
        onSelectToLet={(id) => {
          setSelectedPinId(null);
          setSelectedToLetId(id);
        }}
        onBoundsChange={setBounds}
      />

      {/* Header */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-wrap items-start justify-between gap-2 p-3">
        <div className="pointer-events-auto rounded-2xl bg-white/95 px-4 py-2.5 shadow-lg backdrop-blur">
          <h1 className="text-lg font-bold leading-tight">
            Bombay<span className="text-emerald-600">Rents</span>
          </h1>
          <p className="text-xs text-slate-500">
            Real rents, no brokers · {pins.length.toLocaleString("en-IN")} pins
            {!isLive && (
              <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-700">
                demo data
              </span>
            )}
          </p>
        </div>

        <div className="hidden flex-1 justify-center pt-1 md:flex">
          <SearchBar
            onGo={(lat, lng) => setFocus({ lat, lng, at: Date.now() })}
            onLocate={() => setLocate(Date.now())}
          />
        </div>

        <div className="pointer-events-auto flex flex-col items-end gap-2">
          {picking ? (
            <button
              onClick={() => setPicking(null)}
              className="rounded-2xl bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white shadow-lg"
            >
              ✕ Cancel
            </button>
          ) : (
            <div className="flex flex-wrap justify-end gap-1.5">
              <button
                onClick={() => setPicking("rent")}
                className="rounded-2xl bg-emerald-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:bg-emerald-500"
              >
                📍 Add my rent
              </button>
              <button
                onClick={() => setPicking("list")}
                className="rounded-2xl bg-sky-700 px-3.5 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:bg-sky-600"
              >
                🏠 List my flat
              </button>
              <button
                onClick={() => setPicking("seek")}
                className="rounded-2xl bg-orange-700 px-3.5 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:bg-orange-600"
              >
                🔍 Find a flat
              </button>
              <button
                onClick={() => setPicking("tolet")}
                className="rounded-2xl bg-amber-500 px-3.5 py-2.5 text-sm font-bold text-amber-950 shadow-lg transition hover:bg-amber-400"
              >
                🪧 Spot a To-Let
              </button>
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-1.5">
            <button
              onClick={handleToggleAvailable}
              className={`rounded-xl px-3 py-2 text-xs font-semibold shadow-lg backdrop-blur transition ${
                availableMode
                  ? "bg-orange-700 text-white"
                  : "bg-white/95 text-slate-600 hover:bg-white"
              }`}
            >
              🏠 Avlb flats
            </button>
            <button
              onClick={() => setShowSuperheroes(true)}
              className="rounded-xl bg-white/95 px-3 py-2 text-xs font-semibold text-slate-600 shadow-lg backdrop-blur transition hover:bg-white"
            >
              🦸 Superheroes
            </button>
            <button
              onClick={() => setShowTransit((s) => !s)}
              className={`rounded-xl px-3 py-2 text-xs font-semibold shadow-lg backdrop-blur transition ${
                showTransit
                  ? "bg-slate-800 text-white"
                  : "bg-white/95 text-slate-600 hover:bg-white"
              }`}
            >
              🚆 Trains & Metro
            </button>
            <div className="flex overflow-hidden rounded-xl bg-white/95 text-xs font-medium shadow-lg backdrop-blur">
              {(
                [
                  ["mumbai", "Mumbai"],
                  ["navi-mumbai", "Navi Mumbai"],
                ] as [City, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setCity(key)}
                  className={`px-3 py-2 transition ${
                    city === key
                      ? "bg-slate-800 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex w-full justify-center md:hidden">
          <SearchBar
            onGo={(lat, lng) => setFocus({ lat, lng, at: Date.now() })}
            onLocate={() => setLocate(Date.now())}
          />
        </div>
      </header>

      {/* Picking banner */}
      {picking && !picked && (
        <div className="absolute inset-x-0 top-24 z-10 flex justify-center px-4">
          <div className="animate-pulse rounded-full bg-slate-900/90 px-4 py-2 text-sm font-medium text-white shadow-lg">
            {PICK_BANNERS[picking]}
          </div>
        </div>
      )}

      {/* Transit legend */}
      {showTransit && (
        <div className="absolute left-3 top-20 z-10 rounded-xl bg-white/95 px-3 py-2 shadow-lg backdrop-blur">
          {TRANSIT_LEGEND.map(([color, label]) => (
            <div key={label} className="flex items-center gap-2 py-0.5 text-[11px] font-medium text-slate-700">
              <span className="h-1 w-5 rounded" style={{ backgroundColor: color }} />
              {label}
            </div>
          ))}
        </div>
      )}

      {/* BHK filter chips */}
      <div className="absolute bottom-3 left-3 z-10 flex max-w-[70%] flex-wrap gap-1.5">
        {BHK_OPTIONS.map((bhk) => (
          <button
            key={bhk}
            onClick={() => setBhkFilter((f) => (f === bhk ? null : bhk))}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold shadow-md backdrop-blur transition ${
              bhkFilter === bhk
                ? "bg-slate-900 text-white"
                : "bg-white/95 text-slate-700 hover:bg-white"
            } ${bhkFilter && bhkFilter !== bhk ? "opacity-50" : ""}`}
          >
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: BHK_COLORS[bhk] }}
            />
            {bhk}
          </button>
        ))}
        {matches && (
          <button
            onClick={() => {
              setMatches(null);
              setAvailableMode(false);
            }}
            className="rounded-full bg-orange-700 px-3 py-1.5 text-xs font-semibold text-white shadow-md"
          >
            ✕ {availableMode ? `Hide ${matches.length} available` : `Clear ${matches.length} matches`}
          </button>
        )}
      </div>

      <StatsPanel pins={statsPins} bhkFilter={bhkFilter} />

      {selectedPin && (
        <PinCard
          pin={selectedPin}
          onClose={() => setSelectedPinId(null)}
          onReport={handleReport}
          onRated={handleRated}
          onSeeAvailable={() => {
            setSelectedPinId(null);
            if (!availableMode) handleToggleAvailable();
          }}
        />
      )}
      {selectedToLet && (
        <ToLetCard
          spot={selectedToLet}
          onClose={() => setSelectedToLetId(null)}
          onReport={handleReportToLet}
        />
      )}

      {picked?.purpose === "rent" && (
        <AddPinModal location={picked} onClose={closeModal} onSubmit={handleAddPin} />
      )}
      {picked?.purpose === "list" && (
        <ListFlatModal location={picked} onClose={closeModal} onSubmit={handleAddListing} />
      )}
      {picked?.purpose === "seek" && (
        <FindFlatModal
          location={picked}
          pins={pins}
          onClose={closeModal}
          onSubmit={handleAddSeeker}
        />
      )}
      {picked?.purpose === "tolet" && (
        <ToLetModal location={picked} onClose={closeModal} onSubmit={handleAddToLet} />
      )}
      {showSuperheroes && (
        <SuperheroesModal spots={toLets} onClose={() => setShowSuperheroes(false)} />
      )}

      {toast && (
        <div className="absolute inset-x-0 bottom-24 z-20 flex justify-center px-4">
          <div className="max-w-md rounded-xl bg-slate-900/95 px-4 py-2.5 text-sm text-white shadow-xl">
            {toast}
          </div>
        </div>
      )}

      {loadError && (
        <div className="absolute inset-x-0 bottom-24 z-20 flex justify-center px-4">
          <div className="rounded-xl bg-red-600 px-4 py-2.5 text-sm text-white shadow-xl">
            {loadError}
            {isLive && (
              <span className="block text-xs opacity-80">
                Did you run supabase/schema.sql in the Supabase SQL Editor?
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
