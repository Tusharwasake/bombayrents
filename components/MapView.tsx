"use client";

import { useEffect, useRef } from "react";
import maplibregl, { GeoJSONSource, Map as MLMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Bounds } from "@/lib/stats";
import { BHK_COLORS, inrShort, MatchPreviewItem, RentPin, ToLetSpot } from "@/lib/types";
import type { City, PickPurpose } from "./App";

// Mumbai Metropolitan Region: Vasai-Virar → Kalyan-Dombivli → Panvel → Uran.
// The map cannot be panned or zoomed outside this box.
const MMR_BOUNDS: [[number, number], [number, number]] = [
  [72.6, 18.75], // southwest (lng, lat)
  [73.35, 19.5], // northeast (lng, lat)
];

const CITY_VIEWS: Record<City, { center: [number, number]; zoom: number }> = {
  mumbai: { center: [72.8777, 19.076], zoom: 11 },
  "navi-mumbai": { center: [73.02, 19.06], zoom: 11.6 },
};

interface Props {
  pins: RentPin[];
  city: City;
  picking: PickPurpose | null;
  showTransit: boolean;
  matchPreview: MatchPreviewItem[] | null;
  toLets: ToLetSpot[];
  focus: { lat: number; lng: number; at: number } | null;
  locate: number | null;
  onLocateError: (message: string) => void;
  onMapClick: (lat: number, lng: number) => void;
  onPickHere: (purpose: PickPurpose, lat: number, lng: number) => void;
  onSelectPin: (pinId: string) => void;
  onSelectToLet: (spotId: string) => void;
  onBoundsChange: (b: Bounds) => void;
}

function toGeoJSON(pins: RentPin[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: pins.map((p) => {
      const stars =
        p.rating_count > 0
          ? ` ★${(p.rating_sum / p.rating_count).toFixed(1)}`
          : "";
      return {
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
        properties: {
          id: p.id,
          bhk: p.bhk,
          lbl: `${p.bhk} · ${inrShort(p.rent)}${stars}`,
          reports:
            p.report_count > 0
              ? `⚠ ${p.report_count} ${p.report_count === 1 ? "report" : "reports"}`
              : "",
        },
      };
    }),
  };
}

function toLetsToGeoJSON(spots: ToLetSpot[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: spots.map((s) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [s.lng, s.lat] },
      properties: { id: s.id },
    })),
  };
}

function matchesToGeoJSON(items: MatchPreviewItem[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: items.map((m) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [m.lng, m.lat] },
      properties: {
        rent: m.rent,
        bhk: m.bhk,
        furnishing: m.furnishing,
        whole_flat: m.whole_flat,
      },
    })),
  };
}

const inr = (n: number) => "₹" + n.toLocaleString("en-IN");

function matchPopupHTML(props: {
  rent: number;
  bhk: string;
  furnishing: string;
  whole_flat: boolean;
}): string {
  return `
    <div style="padding:12px 14px;font-family:inherit;min-width:180px">
      <div style="font-size:11px;font-weight:700;color:#ea580c;margin-bottom:4px">${props.whole_flat ? "FLAT" : "ROOM"} AVAILABLE</div>
      <div style="font-size:18px;font-weight:800;color:#0f172a">${inr(props.rent)}<span style="font-size:12px;font-weight:500;color:#64748b">/month</span></div>
      <div style="font-size:12px;color:#475569;margin-top:2px">${props.bhk} · ${props.furnishing}</div>
      <div style="font-size:11px;color:#94a3b8;margin-top:6px">Drop a seeker pin to get the owner's contact by email.</div>
    </div>`;
}

export default function MapView({
  pins,
  city,
  picking,
  showTransit,
  matchPreview,
  toLets,
  focus,
  locate,
  onLocateError,
  onMapClick,
  onPickHere,
  onSelectPin,
  onSelectToLet,
  onBoundsChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const geolocateRef = useRef<maplibregl.GeolocateControl | null>(null);
  const loadedRef = useRef(false);
  const pickingRef = useRef(picking);
  const onLocateErrorRef = useRef(onLocateError);
  const onMapClickRef = useRef(onMapClick);
  const onPickHereRef = useRef(onPickHere);
  const onSelectPinRef = useRef(onSelectPin);
  const onSelectToLetRef = useRef(onSelectToLet);
  const onBoundsChangeRef = useRef(onBoundsChange);
  pickingRef.current = picking;
  onLocateErrorRef.current = onLocateError;
  onMapClickRef.current = onMapClick;
  onPickHereRef.current = onPickHere;
  onSelectPinRef.current = onSelectPin;
  onSelectToLetRef.current = onSelectToLet;
  onBoundsChangeRef.current = onBoundsChange;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      // OpenFreeMap: free unlimited vector tiles, no API key.
      // (Google Maps — what bengaluru.rent uses — starts billing past ~10k
      // loads/month; OSM's own raster tiles disallow production traffic.)
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: CITY_VIEWS.mumbai.center,
      zoom: CITY_VIEWS.mumbai.zoom,
      maxBounds: MMR_BOUNDS,
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    const geolocate = new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      showAccuracyCircle: true,
    });
    geolocate.on("outofmaxbounds", () => {
      onLocateErrorRef.current(
        "You're outside Mumbai / Navi Mumbai right now — the map stays within the region."
      );
    });
    geolocate.on("error", (e: GeolocationPositionError) => {
      onLocateErrorRef.current(
        e.code === e.PERMISSION_DENIED
          ? "Location permission denied — allow it in your browser to use this."
          : "Couldn't get your location — try again."
      );
    });
    map.addControl(geolocate, "bottom-right");
    geolocateRef.current = geolocate;

    map.on("load", () => {
      // (Transit sources/layers are added lazily on first toggle — see
      // syncTransit — so the ~76KB of GeoJSON isn't fetched on every load.)

      // --- Rent pins ---
      map.addSource("pins", {
        type: "geojson",
        data: toGeoJSON([]),
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 45,
      });

      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "pins",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": [
            "step",
            ["get", "point_count"],
            "#34d399",
            10,
            "#10b981",
            30,
            "#059669",
          ],
          "circle-radius": ["step", ["get", "point_count"], 16, 10, 22, 30, 28],
          "circle-stroke-width": 3,
          "circle-stroke-color": "rgba(255,255,255,0.7)",
        },
      });

      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "pins",
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": ["Noto Sans Bold"],
          "text-size": 13,
        },
        paint: { "text-color": "#ffffff" },
      });

      map.addLayer({
        id: "pin",
        type: "circle",
        source: "pins",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": [
            "match",
            ["get", "bhk"],
            "1RK",
            BHK_COLORS["1RK"],
            "1BHK",
            BHK_COLORS["1BHK"],
            "2BHK",
            BHK_COLORS["2BHK"],
            "3BHK",
            BHK_COLORS["3BHK"],
            "4BHK+",
            BHK_COLORS["4BHK+"],
            "#64748b",
          ],
          "circle-radius": 8,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });

      // Price tag above every unclustered dot ("2BHK · 30K ★4.2"). Always on;
      // collision detection hides labels automatically where it gets crowded.
      map.addLayer({
        id: "pin-label",
        type: "symbol",
        source: "pins",
        filter: ["!", ["has", "point_count"]],
        layout: {
          "text-field": ["get", "lbl"],
          "text-font": ["Noto Sans Bold"],
          "text-size": 11,
          "text-anchor": "bottom",
          "text-offset": [0, -0.9],
          "text-optional": true,
        },
        paint: {
          "text-color": "#0f172a",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.6,
        },
      });

      // Red "⚠ n reports" badge under flagged pins.
      map.addLayer({
        id: "pin-report",
        type: "symbol",
        source: "pins",
        filter: [
          "all",
          ["!", ["has", "point_count"]],
          ["!=", ["get", "reports"], ""],
        ],
        layout: {
          "text-field": ["get", "reports"],
          "text-font": ["Noto Sans Bold"],
          "text-size": 10,
          "text-anchor": "top",
          "text-offset": [0, 0.9],
          "text-optional": true,
        },
        paint: {
          "text-color": "#dc2626",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.4,
        },
      });

      // --- Spotted To-Let boards (amber) ---
      map.addSource("tolets", { type: "geojson", data: toLetsToGeoJSON([]) });
      map.addLayer({
        id: "tolet-dot",
        type: "circle",
        source: "tolets",
        paint: {
          "circle-radius": 7,
          "circle-color": "#f59e0b",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#78350f",
        },
      });
      map.addLayer({
        id: "tolet-label",
        type: "symbol",
        source: "tolets",
        minzoom: 12,
        layout: {
          "text-field": "To-Let",
          "text-font": ["Noto Sans Bold"],
          "text-size": 10,
          "text-anchor": "top",
          "text-offset": [0, 0.8],
          "text-optional": true,
        },
        paint: {
          "text-color": "#92400e",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.4,
        },
      });

      // --- Available flats / instant matches (orange rings above everything) ---
      map.addSource("match-preview", { type: "geojson", data: matchesToGeoJSON([]) });
      map.addLayer({
        id: "match-dot",
        type: "circle",
        source: "match-preview",
        paint: {
          "circle-radius": 9,
          "circle-color": "#fb923c",
          "circle-opacity": 0.9,
          "circle-stroke-width": 3,
          "circle-stroke-color": "#7c2d12",
        },
      });

      loadedRef.current = true;
      (map.getSource("pins") as GeoJSONSource).setData(toGeoJSON(pinsRef.current));
      (map.getSource("tolets") as GeoJSONSource).setData(
        toLetsToGeoJSON(toLetsRef.current)
      );
      syncTransit(map, showTransitRef.current);
      if (matchPreviewRef.current) {
        (map.getSource("match-preview") as GeoJSONSource).setData(
          matchesToGeoJSON(matchPreviewRef.current)
        );
      }

      emitBounds(map);
    });

    const emitBounds = (m: MLMap) => {
      const b = m.getBounds();
      onBoundsChangeRef.current({
        north: b.getNorth(),
        south: b.getSouth(),
        east: b.getEast(),
        west: b.getWest(),
      });
    };
    map.on("moveend", () => emitBounds(map));

    map.on("click", (e) => {
      if (pickingRef.current) {
        onMapClickRef.current(e.lngLat.lat, e.lngLat.lng);
        return;
      }
      // Layers don't exist until the load handler runs; querying them earlier throws.
      if (!loadedRef.current) return;
      const features = map.queryRenderedFeatures(e.point, {
        layers: ["clusters", "pin", "match-dot", "tolet-dot"],
      });
      const feature = features[0];

      // Clicked empty map → "Add something here" menu.
      if (!feature) {
        const { lat, lng } = e.lngLat;
        const el = document.createElement("div");
        el.style.cssText =
          "display:flex;flex-direction:column;gap:6px;padding:10px 12px;min-width:210px";
        const title = document.createElement("div");
        title.textContent = "Add something here";
        title.style.cssText = "font-weight:700;font-size:13px;color:#0f172a;margin-bottom:2px";
        el.appendChild(title);
        const mk = (label: string, bg: string, purpose: PickPurpose) => {
          const btn = document.createElement("button");
          btn.textContent = label;
          btn.style.cssText = `background:${bg};color:#fff;border:none;border-radius:10px;padding:8px 12px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;text-align:left`;
          btn.addEventListener("click", () => {
            popup.remove();
            onPickHereRef.current(purpose, lat, lng);
          });
          return btn;
        };
        el.appendChild(mk("💰 What rent are you paying?", "#059669", "rent"));
        el.appendChild(mk("🏠 List my flat here", "#0369a1", "list"));
        el.appendChild(mk("🔍 I'm looking for a flat here", "#c2410c", "seek"));
        el.appendChild(mk("🪧 Spotted a To-Let board", "#b45309", "tolet"));
        const popup = new maplibregl.Popup({ closeButton: false, maxWidth: "280px" })
          .setLngLat([lng, lat])
          .setDOMContent(el)
          .addTo(map);
        return;
      }

      if (feature.properties?.cluster) {
        const source = map.getSource("pins") as GeoJSONSource;
        source
          .getClusterExpansionZoom(feature.properties.cluster_id)
          .then((zoom) =>
            map.easeTo({
              center: (feature.geometry as GeoJSON.Point).coordinates as [number, number],
              zoom,
            })
          );
        return;
      }

      const coords = (feature.geometry as GeoJSON.Point).coordinates as [number, number];

      if (feature.layer.id === "match-dot") {
        new maplibregl.Popup({ closeButton: true, maxWidth: "280px" })
          .setLngLat(coords)
          .setHTML(matchPopupHTML(feature.properties as Parameters<typeof matchPopupHTML>[0]))
          .addTo(map);
        return;
      }

      if (feature.layer.id === "tolet-dot") {
        onSelectToLetRef.current(feature.properties!.id as string);
        return;
      }

      onSelectPinRef.current(feature.properties!.id as string);
    });

    ["clusters", "pin", "match-dot", "tolet-dot"].forEach((layer) => {
      map.on("mouseenter", layer, () => {
        if (!pickingRef.current) map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", layer, () => {
        map.getCanvas().style.cursor = "";
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
      loadedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep latest values available to the load handler, and push updates once loaded.
  const pinsRef = useRef(pins);
  pinsRef.current = pins;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    (map.getSource("pins") as GeoJSONSource).setData(toGeoJSON(pins));
  }, [pins]);

  const toLetsRef = useRef(toLets);
  toLetsRef.current = toLets;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    (map.getSource("tolets") as GeoJSONSource).setData(toLetsToGeoJSON(toLets));
  }, [toLets]);

  const showTransitRef = useRef(showTransit);
  showTransitRef.current = showTransit;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    syncTransit(map, showTransit);
  }, [showTransit]);

  const matchPreviewRef = useRef(matchPreview);
  matchPreviewRef.current = matchPreview;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    (map.getSource("match-preview") as GeoJSONSource).setData(
      matchesToGeoJSON(matchPreview ?? [])
    );
  }, [matchPreview]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const view = CITY_VIEWS[city];
    map.flyTo({ center: view.center, zoom: view.zoom, duration: 1200 });
  }, [city]);

  // Search result → fly there. `at` timestamp makes repeat searches re-fly.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus) return;
    map.flyTo({ center: [focus.lng, focus.lat], zoom: 14.5, duration: 1200 });
  }, [focus]);

  // "My current location" → trigger the geolocate control (blue dot + fly-to).
  useEffect(() => {
    if (locate) geolocateRef.current?.trigger();
  }, [locate]);

  useEffect(() => {
    containerRef.current?.classList.toggle("crosshair-cursor", picking !== null);
  }, [picking]);

  return <div ref={containerRef} className="h-full w-full" />;
}

function syncTransit(map: MLMap, show: boolean) {
  if (show && !map.getSource("transit-lines")) addTransitLayers(map);
  const visibility = show ? "visible" : "none";
  ["transit-suburban", "transit-metro", "station-dot", "station-label"].forEach(
    (layer) => {
      if (map.getLayer(layer)) map.setLayoutProperty(layer, "visibility", visibility);
    }
  );
}

// Local trains + metro overlay. Added on first toggle only, so the GeoJSON
// isn't downloaded by users who never open it. Inserted beneath "clusters"
// to keep rent pins drawn on top.
function addTransitLayers(map: MLMap) {
  map.addSource("transit-lines", {
    type: "geojson",
    data: "/data/transit-lines.geojson",
  });
  map.addSource("stations", { type: "geojson", data: "/data/stations.geojson" });

  const beforeId = map.getLayer("clusters") ? "clusters" : undefined;

  map.addLayer(
    {
      id: "transit-suburban",
      type: "line",
      source: "transit-lines",
      filter: ["!=", ["get", "group"], "metro"],
      layout: { visibility: "none", "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": ["get", "color"],
        "line-width": 3,
        "line-opacity": 0.8,
      },
    },
    beforeId
  );
  map.addLayer(
    {
      id: "transit-metro",
      type: "line",
      source: "transit-lines",
      filter: ["==", ["get", "group"], "metro"],
      layout: { visibility: "none", "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": ["get", "color"],
        "line-width": 2.5,
        "line-opacity": 0.8,
        "line-dasharray": [2, 1.5],
      },
    },
    beforeId
  );
  map.addLayer(
    {
      id: "station-dot",
      type: "circle",
      source: "stations",
      minzoom: 10.5,
      layout: { visibility: "none" },
      paint: {
        "circle-radius": 3.5,
        "circle-color": "#ffffff",
        "circle-stroke-width": 1.5,
        "circle-stroke-color": "#334155",
      },
    },
    beforeId
  );
  map.addLayer(
    {
      id: "station-label",
      type: "symbol",
      source: "stations",
      minzoom: 12,
      layout: {
        visibility: "none",
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Regular"],
        "text-size": 10,
        "text-offset": [0, 1],
        "text-anchor": "top",
      },
      paint: {
        "text-color": "#334155",
        "text-halo-color": "#ffffff",
        "text-halo-width": 1.2,
      },
    },
    beforeId
  );
}
