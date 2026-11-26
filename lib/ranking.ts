// Pure scoring helpers (no imports) – shared by server actions, display and admin.
// Unit tests: lib/ranking.test.ts (`npm test`).

export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_KM = 6371.0088; // mean Earth radius (IUGG)

/** Great-circle distance in km (haversine). */
export function haversineKm(a: LatLng, b: LatLng): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "123,4 km" (1 decimal, Danish formatting). */
export function formatKm(km: number): string {
  return `${km.toLocaleString("da-DK", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
}

export interface RankEntry {
  teamId: string;
  /** Distance to the facit; null = no answer. */
  distance: number | null;
}

export interface Ranked extends RankEntry {
  /** 1-based placement (competition ranking: 1, 1, 3 …); null when no answer. */
  rank: number | null;
  points: number;
}

/**
 * Rank by distance ascending. Entries whose distances are equal after rounding to
 * `tieResolution` share the placement and the points; the next placement is skipped
 * (1, 1, 3). Teams without an answer get 0 points and are ranked last.
 * Points = basePoints[rank-1] × multiplier.
 */
export function rankByDistance(
  entries: RankEntry[],
  basePoints: number[] = [3, 2, 1],
  multiplier = 1,
  tieResolution = 0.001, // km → ties are decided at whole metres
): Ranked[] {
  const key = (d: number) => Math.round(d / tieResolution);
  const answered = entries
    .filter((e): e is RankEntry & { distance: number } => e.distance !== null && Number.isFinite(e.distance))
    .sort((a, b) => a.distance - b.distance);
  const missing = entries.filter((e) => e.distance === null || !Number.isFinite(e.distance));

  const out: Ranked[] = [];
  answered.forEach((e, i) => {
    const prev = out[i - 1];
    const rank = prev && key(prev.distance!) === key(e.distance) ? prev.rank! : i + 1;
    out.push({ ...e, rank, points: (basePoints[rank - 1] ?? 0) * multiplier });
  });
  for (const e of missing) out.push({ ...e, distance: null, rank: null, points: 0 });
  return out;
}
