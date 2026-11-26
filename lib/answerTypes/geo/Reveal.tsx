"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef } from "react";
import { formatKm, haversineKm, rankByDistance } from "@/lib/ranking";
import { chime } from "@/lib/sound";
import { signed, teamColor } from "@/lib/types";
import type { RevealProps } from "../ui";
import type { GeoValue } from "../types";
import { geoValue } from "./score";
import { WORLD, type MapView } from "./view";

const ResultMap = dynamic(() => import("./maps").then((m) => m.ResultMap), { ssr: false });

/**
 * Stepwise: 1 team pins · 2 facit pin drops in with label · 3 lines to the facit with km (map fits all) · 4 ranking beside the map.
 */
export default function GeoReveal({ q, reveal, step, teams, answers, scoreFor, totals }: RevealProps) {
  const facit = reveal.answer as GeoValue & { label: string };
  const byTeam = new Map(answers.map((a) => [a.team_id, geoValue(a.value)]));
  const pins = teams.flatMap((t) => {
    const p = byTeam.get(t.id);
    return p
      ? [{ id: t.id, name: t.name ?? "", color: teamColor(t.slot), lat: p.lat, lng: p.lng, distanceKm: haversineKm(p, facit) }]
      : [];
  });
  const ranked = rankByDistance(
    teams.map((t) => ({ teamId: t.id, distance: pins.find((p) => p.id === t.id)?.distanceKm ?? null })),
    [],
    1,
    0.001,
  );

  const chimed = useRef(false);
  useEffect(() => {
    if (step >= 2 && !chimed.current) {
      chimed.current = true;
      const id = setTimeout(chime, 600);
      return () => clearTimeout(id);
    }
  }, [step]);

  return (
    <div className="flex min-h-0 w-full flex-1 gap-[1.5vw]">
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-[1.2vmin] ring-1 ring-gold/30">
        <ResultMap
          start={(q.payload.mapStart as MapView | null) ?? WORLD}
          pins={pins}
          facit={step >= 2 ? facit : null}
          showLines={step >= 3}
        />
        {step >= 2 && (
          <div className="fun-drop-in absolute bottom-[3vh] left-1/2 z-[500] -translate-x-1/2 whitespace-nowrap rounded-[1.6vmin] bg-gold px-[4vmin] py-[1.2vmin] text-[min(4.5vw,6.5vh)] font-black text-ink shadow-[0_0_6vmin_rgba(217,185,122,0.6)]">
            📍 {facit.label}
          </div>
        )}
      </div>
      {step >= 4 && (
        <ol className="animate-fade-up flex w-[28vw] shrink-0 flex-col gap-[1vh] overflow-hidden">
          {ranked.map((r) => {
            const t = teams.find((x) => x.id === r.teamId)!;
            const s = scoreFor(r.teamId);
            return (
              <li key={r.teamId} className="flex items-center gap-[0.8vw] rounded-[1vh] bg-pine-900/85 px-[1vw] py-[1vh] ring-1 ring-gold/15">
                <span className="tabular w-[2vw] text-[1.8vw] font-bold text-gold">{r.rank ?? "–"}</span>
                <span className="h-[1.1vw] w-[1.1vw] shrink-0 rounded-full" style={{ background: teamColor(t.slot) }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[1.5vw] font-semibold">{t.name}</span>
                  <span className="tabular block text-[1.1vw] text-cream/60">{r.distance === null ? "ingen nål" : formatKm(r.distance)}</span>
                </span>
                <span className="tabular text-right">
                  <span className="block text-[1.7vw] font-bold text-gold">{s ? signed(s.points) : ""}</span>
                  <span className="block text-[1vw] text-cream/40">{totals.get(r.teamId) ?? 0} p</span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
