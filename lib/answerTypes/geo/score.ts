import { haversineKm, rankByDistance } from "../../ranking.ts";
import type { GeoValue, Question, ScoreAnswer, ScoreResult } from "../types.ts";

export function geoValue(v: unknown): GeoValue | null {
  const x = v as { lat?: unknown; lng?: unknown } | null;
  return x && typeof x.lat === "number" && typeof x.lng === "number" && Math.abs(x.lat) <= 90 && Math.abs(x.lng) <= 180
    ? { lat: x.lat, lng: x.lng }
    : null;
}

/** Haversine distance (km) to the facit; pointsByRank for the closest; ties = same metre. */
export function scoreGeo(q: Question, answers: ScoreAnswer[]): ScoreResult[] {
  const facit = q.answer as GeoValue;
  const pins = new Map(answers.map((a) => [a.teamId, geoValue(a.value)]));
  const ranked = rankByDistance(
    answers.map((a) => {
      const p = pins.get(a.teamId);
      return { teamId: a.teamId, distance: p ? haversineKm(p, facit) : null };
    }),
    q.pointsByRank,
    1,
    0.001,
  );
  return ranked.map((r) => ({
    teamId: r.teamId,
    points: r.points,
    rank: r.rank,
    detail: { pin: pins.get(r.teamId) ?? null, distanceKm: r.distance === null ? null : Math.round(r.distance * 10) / 10 },
  }));
}
