"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { ZoomImage } from "@/components/ZoomImage";
import type { PlayInputProps } from "../ui";
import { WORLD, type MapView } from "./view";
import { geoValue } from "./score";

const PickMap = dynamic(() => import("./maps").then((m) => m.PickMap), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-cream/50">Indlæser kort…</div>,
});

/** Street View screenshot on top (collapsible, fullscreen zoom) + map filling the rest. Tap to place/move the pin. */
export default function GeoPlayInput({ q, value, onChange, disabled, color }: PlayInputProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [full, setFull] = useState(false);
  const pin = geoValue(value);
  const start = (q.payload.mapStart as MapView | null) ?? WORLD;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {q.mediaUrl && (
        <div className="shrink-0 overflow-hidden rounded-xl ring-1 ring-gold/30">
          {!collapsed && (
            <button className="block w-full bg-black" onClick={() => setFull(true)} aria-label="Åbn billedet i fuld skærm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={q.mediaUrl} alt="Hvor er vi?" className="mx-auto max-h-[28dvh] w-full object-contain" />
            </button>
          )}
          <div className="flex items-center justify-between bg-pine-900/90 px-3 py-1.5 text-xs">
            <button onClick={() => setFull(true)} className="font-semibold text-gold">⤢ Fuld skærm</button>
            <button onClick={() => setCollapsed((c) => !c)} className="text-cream/70">
              {collapsed ? "▾ Vis billede" : "▴ Fold sammen"}
            </button>
          </div>
        </div>
      )}
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl ring-1 ring-gold/30">
        <PickMap start={start} value={pin} onPick={(p) => onChange(p)} disabled={disabled} color={color} />
        {!pin && !disabled && (
          <span className="pointer-events-none absolute left-1/2 top-3 z-[500] -translate-x-1/2 rounded-full bg-pine-950/90 px-4 py-1.5 text-sm font-semibold shadow-lg ring-1 ring-gold/40">
            Tryk på kortet for at sætte jeres nål
          </span>
        )}
      </div>
      {full && q.mediaUrl && <ZoomImage src={q.mediaUrl} alt="Hvor er vi?" onClose={() => setFull(false)} />}
    </div>
  );
}
