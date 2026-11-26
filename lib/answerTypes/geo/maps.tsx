"use client";

// Leaflet maps (client-only – always import this module via next/dynamic with ssr: false).
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useMemo } from "react";
import { MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { formatKm } from "@/lib/ranking";

import type { MapView } from "./view";

const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>-bidragydere';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function pinIcon(color: string, opts: { label?: string; anim?: string; size?: number; facit?: boolean } = {}) {
  const s = opts.size ?? 36;
  const h = Math.round(s * 1.35);
  const svg = opts.facit
    ? `<svg viewBox="0 0 36 48" width="${s}" height="${h}"><path d="M18 47C18 47 33 28 33 17A15 15 0 0 0 3 17C3 28 18 47 18 47Z" fill="#d9b97a" stroke="#04110b" stroke-width="2.5"/><path d="M18 8l2.6 5.6 6 .6-4.5 4 1.3 6-5.4-3.1-5.4 3.1 1.3-6-4.5-4 6-.6z" fill="#04110b"/></svg>`
    : `<svg viewBox="0 0 36 48" width="${s}" height="${h}"><path d="M18 47C18 47 33 28 33 17A15 15 0 0 0 3 17C3 28 18 47 18 47Z" fill="${color}" stroke="#04110b" stroke-width="2.5"/><circle cx="18" cy="17" r="6" fill="#04110b" opacity=".75"/></svg>`;
  const label = opts.label
    ? `<span class="geo-pin-label${opts.facit ? " geo-pin-label--facit" : ""}" style="--c:${color}">${esc(opts.label)}</span>`
    : "";
  return L.divIcon({
    className: "geo-pin",
    html: `<div class="geo-pin-inner ${opts.anim ?? ""}">${svg}${label}</div>`,
    iconSize: [s, h],
    iconAnchor: [s / 2, h],
  });
}

function chipIcon(text: string, color: string) {
  return L.divIcon({
    className: "geo-pin",
    html: `<span class="geo-km" style="--c:${color}">${esc(text)}</span>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

/** Keeps Leaflet's size in sync with its (flex) container. */
function AutoResize() {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);
    return () => ro.disconnect();
  }, [map]);
  return null;
}

// ───────────────────────── team input ─────────────────────────

function ClickToPin({ onPick, disabled }: { onPick: (p: { lat: number; lng: number }) => void; disabled: boolean }) {
  useMapEvents({
    click(e) {
      if (disabled) return;
      const w = e.latlng.wrap();
      onPick({ lat: w.lat, lng: w.lng });
    },
  });
  return null;
}

export function PickMap({
  start,
  value,
  onPick,
  disabled,
  color,
}: {
  start: MapView;
  value: { lat: number; lng: number } | null;
  onPick: (p: { lat: number; lng: number }) => void;
  disabled: boolean;
  color: string;
}) {
  const icon = useMemo(() => pinIcon(color, { anim: "geo-pop" }), [color]);
  return (
    <MapContainer
      center={[start.lat, start.lng]}
      zoom={start.zoom}
      worldCopyJump
      className="h-full w-full"
      attributionControl
    >
      <TileLayer url={TILE_URL} attribution={ATTRIBUTION} maxZoom={19} />
      <AutoResize />
      <ClickToPin onPick={onPick} disabled={disabled} />
      {value && (
        <Marker
          position={[value.lat, value.lng]}
          icon={icon}
          draggable={!disabled}
          eventHandlers={{
            dragend: (e) => {
              const w = (e.target as L.Marker).getLatLng().wrap();
              onPick({ lat: w.lat, lng: w.lng });
            },
          }}
        />
      )}
    </MapContainer>
  );
}

// ───────────────────────── quiz editor (quizmaster) ─────────────────────────

function ViewReporter({ onView }: { onView: (v: MapView) => void }) {
  useMapEvents({
    moveend(e) {
      const m = e.target as L.Map;
      const c = m.getCenter().wrap();
      onView({ lat: Math.round(c.lat * 1e4) / 1e4, lng: Math.round(c.lng * 1e4) / 1e4, zoom: m.getZoom() });
    },
  });
  return null;
}

/** Click to set the facit; reports the current view so it can be saved as mapStart. */
export function EditorMap({
  start,
  facit,
  onPick,
  onView,
}: {
  start: MapView;
  facit: { lat: number; lng: number; label?: string } | null;
  onPick: (p: { lat: number; lng: number }) => void;
  onView: (v: MapView) => void;
}) {
  const icon = useMemo(() => pinIcon("#d9b97a", { facit: true, size: 30, label: facit?.label || undefined }), [facit?.label]);
  return (
    <MapContainer center={[start.lat, start.lng]} zoom={start.zoom} worldCopyJump className="h-full w-full">
      <TileLayer url={TILE_URL} attribution={ATTRIBUTION} maxZoom={19} />
      <AutoResize />
      <ClickToPin onPick={onPick} disabled={false} />
      <ViewReporter onView={onView} />
      {facit && (
        <Marker
          position={[facit.lat, facit.lng]}
          icon={icon}
          draggable
          eventHandlers={{
            dragend: (e) => {
              const w = (e.target as L.Marker).getLatLng().wrap();
              onPick({ lat: w.lat, lng: w.lng });
            },
          }}
        />
      )}
    </MapContainer>
  );
}

// ───────────────────────── results (display + admin) ─────────────────────────

export interface ResultPin {
  id: string;
  name: string;
  color: string;
  lat: number;
  lng: number;
  distanceKm: number | null;
}

function FitTo({ points, fallback, padding, fitKey }: { points: [number, number][]; fallback: MapView; padding: number; fitKey: string }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) {
      map.flyTo([fallback.lat, fallback.lng], fallback.zoom, { duration: 1 });
    } else if (points.length === 1) {
      map.flyTo(points[0], Math.max(map.getZoom(), 8), { duration: 1.2 });
    } else {
      map.flyToBounds(L.latLngBounds(points), { padding: [padding, padding], maxZoom: 13, duration: 1.3 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);
  return null;
}

export function ResultMap({
  start,
  pins,
  facit,
  showLines,
  big = true,
  interactive = false,
}: {
  start: MapView;
  pins: ResultPin[];
  facit: { lat: number; lng: number; label: string } | null;
  showLines: boolean;
  big?: boolean;
  interactive?: boolean;
}) {
  const pts: [number, number][] = pins.map((p) => [p.lat, p.lng]);
  if (facit) pts.push([facit.lat, facit.lng]);
  const fitKey = `${pins.map((p) => `${p.id}:${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join("|")}|${facit ? "f" : ""}`;
  const size = big ? 40 : 26;
  return (
    <MapContainer
      center={[start.lat, start.lng]}
      zoom={start.zoom}
      worldCopyJump
      zoomControl={interactive}
      dragging={interactive}
      scrollWheelZoom={interactive}
      doubleClickZoom={interactive}
      touchZoom={interactive}
      className={`h-full w-full ${big ? "geo-big" : "geo-small"}`}
    >
      <TileLayer url={TILE_URL} attribution={ATTRIBUTION} maxZoom={19} />
      <AutoResize />
      <FitTo points={pts} fallback={start} padding={big ? 90 : 30} fitKey={fitKey} />
      {showLines &&
        facit &&
        pins.map((p) => (
          <Polyline
            key={`l-${p.id}`}
            positions={[
              [p.lat, p.lng],
              [facit.lat, facit.lng],
            ]}
            pathOptions={{ color: p.color, weight: big ? 4 : 2.5, dashArray: "10 8", opacity: 0.9, className: "geo-line" }}
          />
        ))}
      {showLines &&
        facit &&
        pins.map((p) =>
          p.distanceKm === null ? null : (
            <Marker
              key={`d-${p.id}`}
              position={[(p.lat + facit.lat) / 2, (p.lng + facit.lng) / 2]}
              icon={chipIcon(formatKm(p.distanceKm), p.color)}
              interactive={false}
            />
          ),
        )}
      {pins.map((p, i) => (
        <Marker
          key={p.id}
          position={[p.lat, p.lng]}
          icon={pinIcon(p.color, { label: p.name, anim: big ? `geo-pop geo-delay-${Math.min(i, 7)}` : "", size })}
          interactive={false}
        />
      ))}
      {facit && (
        <Marker
          position={[facit.lat, facit.lng]}
          icon={pinIcon("#d9b97a", { label: facit.label, anim: big ? "geo-drop" : "", size: size + 8, facit: true })}
          zIndexOffset={1000}
          interactive={false}
        />
      )}
    </MapContainer>
  );
}
