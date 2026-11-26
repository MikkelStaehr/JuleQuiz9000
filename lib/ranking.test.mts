// Run: npm test   (Node's built-in test runner + native TypeScript type stripping)
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatKm, haversineKm, rankByDistance } from "./ranking.ts";

const COPENHAGEN = { lat: 55.6761, lng: 12.5683 };
const AARHUS = { lat: 56.1629, lng: 10.2039 };
const PARIS = { lat: 48.8566, lng: 2.3522 };
const SYDNEY = { lat: -33.8688, lng: 151.2093 };

test("haversine: zero distance", () => {
  assert.equal(haversineKm(COPENHAGEN, COPENHAGEN), 0);
});

test("haversine: known city distances (±0.5 %)", () => {
  const near = (actual: number, expected: number) =>
    assert.ok(Math.abs(actual - expected) / expected < 0.005, `${actual} ≈ ${expected}`);
  near(haversineKm(COPENHAGEN, AARHUS), 157.2);
  near(haversineKm(COPENHAGEN, PARIS), 1028.3);
  near(haversineKm(PARIS, SYDNEY), 16960);
});

test("haversine: symmetric and handles the antimeridian", () => {
  assert.equal(haversineKm(PARIS, SYDNEY).toFixed(6), haversineKm(SYDNEY, PARIS).toFixed(6));
  // 1° of longitude across ±180 on the equator ≈ 111.2 km, not ~40 000 km
  const d = haversineKm({ lat: 0, lng: 179.5 }, { lat: 0, lng: -179.5 });
  assert.ok(Math.abs(d - 111.2) < 0.5, String(d));
});

test("formatKm: one decimal, Danish formatting", () => {
  assert.equal(formatKm(1234.56), "1.234,6 km");
  assert.equal(formatKm(0.04), "0,0 km");
});

test("ranking: 3/2/1 points, rest 0, sorted ascending", () => {
  const r = rankByDistance([
    { teamId: "d", distance: 400 },
    { teamId: "a", distance: 10 },
    { teamId: "c", distance: 300 },
    { teamId: "b", distance: 20 },
  ]);
  assert.deepEqual(
    r.map((x) => [x.teamId, x.rank, x.points]),
    [["a", 1, 3], ["b", 2, 2], ["c", 3, 1], ["d", 4, 0]],
  );
});

test("ranking: tie (same metre) shares placement + points, next placement is skipped", () => {
  const r = rankByDistance([
    { teamId: "a", distance: 12.3451 }, // 12 345.1 m → 12 345 m
    { teamId: "b", distance: 12.3449 }, // 12 344.9 m → 12 345 m (tie)
    { teamId: "c", distance: 50 },
    { teamId: "d", distance: 60 },
  ]);
  const by = Object.fromEntries(r.map((x) => [x.teamId, x]));
  assert.equal(by.a.rank, 1);
  assert.equal(by.b.rank, 1);
  assert.equal(by.a.points, 3);
  assert.equal(by.b.points, 3);
  assert.equal(by.c.rank, 3); // placement 2 skipped
  assert.equal(by.c.points, 1);
  assert.equal(by.d.rank, 4);
  assert.equal(by.d.points, 0);
});

test("ranking: distances differing by more than a metre are not a tie", () => {
  const r = rankByDistance([
    { teamId: "a", distance: 12.345 },
    { teamId: "b", distance: 12.347 },
  ]);
  assert.deepEqual(r.map((x) => x.rank), [1, 2]);
});

test("ranking: teams without an answer get 0 and are ranked last", () => {
  const r = rankByDistance([
    { teamId: "none", distance: null },
    { teamId: "far", distance: 9999 },
  ]);
  assert.deepEqual(
    r.map((x) => [x.teamId, x.rank, x.points]),
    [["far", 1, 3], ["none", null, 0]],
  );
});

test("ranking: multiplier applies to all placements", () => {
  const r = rankByDistance(
    [
      { teamId: "a", distance: 1 },
      { teamId: "b", distance: 1 },
      { teamId: "c", distance: 2 },
    ],
    [3, 2, 1],
    2,
  );
  assert.deepEqual(r.map((x) => x.points), [6, 6, 2]);
});
