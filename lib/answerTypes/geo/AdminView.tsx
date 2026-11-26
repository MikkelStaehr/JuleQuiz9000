"use client";

import dynamic from "next/dynamic";
import { formatKm, haversineKm } from "@/lib/ranking";
import { teamColor } from "@/lib/types";
import type { GeoValue } from "../types";
import type { AdminViewProps } from "../ui";
import { geoValue } from "./score";
import { WORLD, type MapView } from "./view";

const ResultMap = dynamic(() => import("./maps").then((m) => m.ResultMap), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-xs text-cream/50">Indlæser kort…</div>,
});

/** Quizmaster only: mini map with the facit and every team's current pin (live). */
export default function GeoAdminView({ q, teams, answers }: AdminViewProps) {
  const facit = q.answer as GeoValue & { label: string };
  const pins = teams.flatMap((t) => {
    const p = geoValue(answers.find((a) => a.team_id === t.id)?.value);
    return p ? [{ id: t.id, name: t.name ?? "", color: teamColor(t.slot), lat: p.lat, lng: p.lng, distanceKm: haversineKm(p, facit) }] : [];
  });
  return (
    <div className="space-y-2">
      <div className="h-64 overflow-hidden rounded-xl ring-1 ring-gold/20">
        <ResultMap
          start={(q.extra.mapStart as MapView | undefined) ?? WORLD}
          pins={pins}
          facit={facit}
          showLines
          big={false}
          interactive
        />
      </div>
      <ul className="grid grid-cols-2 gap-x-4 text-xs">
        {[...pins]
          .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0))
          .map((p) => (
            <li key={p.id} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
              <span className="flex-1 truncate">{p.name}</span>
              <span className="tabular text-cream/60">{formatKm(p.distanceKm ?? 0)}</span>
            </li>
          ))}
      </ul>
    </div>
  );
}
