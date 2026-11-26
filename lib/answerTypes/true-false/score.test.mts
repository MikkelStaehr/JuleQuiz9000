import { test } from "node:test";
import assert from "node:assert/strict";
import { byTeam, makeQuestion } from "../testing.ts";
import { scoreTrueFalse } from "./score.ts";

const LOVLIGT = { true: "LOVLIGT", false: "ULOVLIGT" };

test("true-false without wager: correct = 1, wrong = 0, no answer = 0", () => {
  const q = makeQuestion("true-false", false, { labels: LOVLIGT, wagerEnabled: false });
  const r = byTeam(
    scoreTrueFalse(q, [
      { teamId: "right", value: { choice: false }, wager: null },
      { teamId: "wrong", value: { choice: true }, wager: 3 }, // wager ignored when disabled
      { teamId: "none", value: null, wager: null },
    ]),
  );
  assert.deepEqual([r.right.points, r.wrong.points, r.none.points], [1, 0, 0]);
  assert.equal(r.right.detail.correct, true);
});

test("true-false with wager: correct = +wager, wrong = −wager, no answer = 0", () => {
  const q = makeQuestion("true-false", true, { wagerEnabled: true });
  const r = byTeam(
    scoreTrueFalse(q, [
      { teamId: "plus3", value: { choice: true }, wager: 3 },
      { teamId: "minus2", value: { choice: false }, wager: 2 },
      { teamId: "none", value: null, wager: null },
    ]),
  );
  assert.deepEqual([r.plus3.points, r.minus2.points, r.none.points], [3, -2, 0]);
});

test("true-false with wager: missing/invalid wager counts as 1", () => {
  const q = makeQuestion("true-false", true, { wagerEnabled: true });
  const r = byTeam(
    scoreTrueFalse(q, [
      { teamId: "a", value: { choice: true }, wager: null },
      { teamId: "b", value: { choice: false }, wager: 7 },
    ]),
  );
  assert.deepEqual([r.a.points, r.b.points], [1, -1]);
});

test("true-false: non-boolean choice counts as no answer", () => {
  const q = makeQuestion("true-false", true);
  const [r] = scoreTrueFalse(q, [{ teamId: "x", value: { choice: "yes" }, wager: null }]);
  assert.equal(r.points, 0);
  assert.equal(r.detail.choice, null);
});
