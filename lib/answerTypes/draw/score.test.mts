import { test } from "node:test";
import assert from "node:assert/strict";
import { byTeam, makeQuestion } from "../testing.ts";
import { drawJudgingComplete, scoreDraw } from "./score.ts";

const drawing = (team: string) => ({ path: `g/q/${team}.png` });

test("draw/closest: ranked by |read − answer| → 3/2/1, rest 0", () => {
  const q = makeQuestion("draw", 499, { scoring: "closest", unit: "kr." });
  const r = byTeam(
    scoreDraw(q, [
      { teamId: "a", value: drawing("a"), wager: null, judgment: { read: 450 } }, // 49
      { teamId: "b", value: drawing("b"), wager: null, judgment: { read: 500 } }, // 1
      { teamId: "c", value: drawing("c"), wager: null, judgment: { read: 1200 } }, // 701
      { teamId: "d", value: drawing("d"), wager: null, judgment: { read: 300 } }, // 199
    ]),
  );
  assert.deepEqual([r.b.points, r.a.points, r.d.points, r.c.points], [3, 2, 1, 0]);
  assert.equal(r.a.detail.deviation, 49);
  assert.equal(r.a.detail.read, 450);
});

test("draw/closest: equal deviation shares placement, next placement skipped", () => {
  const q = makeQuestion("draw", 100, { scoring: "closest" });
  const r = byTeam(
    scoreDraw(q, [
      { teamId: "a", value: drawing("a"), wager: null, judgment: { read: 90 } },
      { teamId: "b", value: drawing("b"), wager: null, judgment: { read: 110 } },
      { teamId: "c", value: drawing("c"), wager: null, judgment: { read: 130 } },
    ]),
  );
  assert.deepEqual([r.a.rank, r.b.rank, r.c.rank], [1, 1, 3]);
  assert.deepEqual([r.a.points, r.b.points, r.c.points], [3, 3, 1]);
});

test("draw/closest: 'ugyldig', no drawing and no reading = 0, ranked last", () => {
  const q = makeQuestion("draw", 100, { scoring: "closest" });
  const r = byTeam(
    scoreDraw(q, [
      { teamId: "invalid", value: drawing("i"), wager: null, judgment: { read: 100, invalid: true } },
      { teamId: "none", value: null, wager: null },
      { teamId: "ok", value: drawing("o"), wager: null, judgment: { read: 5000 } },
    ]),
  );
  assert.equal(r.ok.rank, 1);
  assert.equal(r.ok.points, 3);
  assert.deepEqual([r.invalid.points, r.invalid.rank], [0, null]);
  assert.deepEqual([r.none.points, r.none.rank], [0, null]);
});

test("draw/closest: judging is complete when every drawing is read or marked invalid", () => {
  const q = makeQuestion("draw", 100, { scoring: "closest" });
  const base = [
    { teamId: "a", value: drawing("a"), wager: null, judgment: { read: 1 } },
    { teamId: "none", value: null, wager: null }, // no drawing → nothing to read
  ];
  assert.equal(drawJudgingComplete(q, [...base, { teamId: "b", value: drawing("b"), wager: null, judgment: null }]), false);
  assert.equal(drawJudgingComplete(q, [...base, { teamId: "b", value: drawing("b"), wager: null, judgment: { invalid: true } }]), true);
});

test("draw/manual-parts: 1 point per ✓ part", () => {
  const q = makeQuestion("draw", "Jingle Bells · Pierpont", { scoring: "manual-parts", parts: ["Sang", "Kunstner"] });
  const r = byTeam(
    scoreDraw(q, [
      { teamId: "both", value: drawing("a"), wager: null, judgment: { parts: [true, true] } },
      { teamId: "one", value: drawing("b"), wager: null, judgment: { parts: [true, false] } },
      { teamId: "unjudged", value: drawing("c"), wager: null, judgment: null },
      { teamId: "none", value: null, wager: null, judgment: { parts: [true, true] } }, // no drawing → 0
    ]),
  );
  assert.deepEqual([r.both.points, r.one.points, r.unjudged.points, r.none.points], [2, 1, 0, 0]);
});

test("draw/manual: quizmaster's 0/1/2, other values ignored", () => {
  const q = makeQuestion("draw", "Et juletræ", { scoring: "manual" });
  const r = byTeam(
    scoreDraw(q, [
      { teamId: "two", value: drawing("a"), wager: null, judgment: { points: 2 } },
      { teamId: "bogus", value: drawing("b"), wager: null, judgment: { points: 9 } },
      { teamId: "unjudged", value: drawing("c"), wager: null },
    ]),
  );
  assert.deepEqual([r.two.points, r.bogus.points, r.unjudged.points], [2, 0, 0]);
});
