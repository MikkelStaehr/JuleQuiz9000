import { test } from "node:test";
import assert from "node:assert/strict";
import { byTeam, makeQuestion } from "../testing.ts";
import { scoreGeo } from "./score.ts";

const RIBE = { lat: 55.3277, lng: 8.76, label: "Ribe, Danmark" };
const q = makeQuestion("geo", RIBE);

test("geo: haversine distance in km (1 decimal) in detail", () => {
  const [r] = scoreGeo(q, [{ teamId: "a", value: { lat: 55.6761, lng: 12.5683 }, wager: null }]); // Copenhagen
  const km = r.detail.distanceKm as number;
  assert.ok(km > 240 && km < 250, String(km)); // Ribe–København ≈ 245 km
  assert.equal(km, Math.round(km * 10) / 10);
});

test("geo: closest 3/2/1; tie at the same metre shares placement", () => {
  const r = byTeam(
    scoreGeo(q, [
      { teamId: "a", value: { lat: 55.3277, lng: 8.77 }, wager: null }, // ~0.63 km east
      { teamId: "b", value: { lat: 55.3277, lng: 8.75 }, wager: null }, // ~0.63 km west (same distance)
      { teamId: "c", value: { lat: 56.0, lng: 9.0 }, wager: null },
      { teamId: "d", value: { lat: 48.85, lng: 2.35 }, wager: null },
    ]),
  );
  assert.deepEqual([r.a.rank, r.b.rank, r.c.rank, r.d.rank], [1, 1, 3, 4]);
  assert.deepEqual([r.a.points, r.b.points, r.c.points, r.d.points], [3, 3, 1, 0]);
});

test("geo: no pin / invalid coordinates → last with 0", () => {
  const r = byTeam(
    scoreGeo(q, [
      { teamId: "none", value: null, wager: null },
      { teamId: "bad", value: { lat: 123, lng: 0 }, wager: null },
      { teamId: "far", value: { lat: -33.86, lng: 151.2 }, wager: null },
    ]),
  );
  assert.equal(r.far.rank, 1);
  assert.equal(r.none.rank, null);
  assert.equal(r.bad.points, 0);
});
