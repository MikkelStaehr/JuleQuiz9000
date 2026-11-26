import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreQuestion } from "./scoring.ts";
import { byTeam, makeQuestion } from "./testing.ts";

test("pointMultiplier is applied last, to every type (incl. negative wagers)", () => {
  const tf = byTeam(
    scoreQuestion(makeQuestion("true-false", true, { wagerEnabled: true, pointMultiplier: 2 }), [
      { teamId: "a", value: { choice: true }, wager: 3 },
      { teamId: "b", value: { choice: false }, wager: 2 },
      { teamId: "c", value: null, wager: null },
    ]),
  );
  assert.deepEqual([tf.a.points, tf.b.points, tf.c.points], [6, -4, 0]);

  const draw = byTeam(
    scoreQuestion(makeQuestion("draw", 100, { scoring: "closest", pointMultiplier: 3 }), [
      { teamId: "a", value: { path: "x" }, wager: null, judgment: { read: 100 } },
      { teamId: "b", value: { path: "y" }, wager: null, judgment: { read: 50 } },
    ]),
  );
  assert.deepEqual([draw.a.points, draw.b.points], [9, 6]);

  const geo = scoreQuestion(makeQuestion("geo", { lat: 0, lng: 0, label: "x" }, { pointMultiplier: 2 }), [
    { teamId: "a", value: { lat: 0, lng: 1 }, wager: null },
  ]);
  assert.equal(geo[0].points, 6);
});

test("default multiplier 1 leaves points unchanged", () => {
  const r = scoreQuestion(makeQuestion("true-false", false), [{ teamId: "a", value: { choice: false }, wager: null }]);
  assert.equal(r[0].points, 1);
});
