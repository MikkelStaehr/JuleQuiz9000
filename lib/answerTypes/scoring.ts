// Central scoring: picks the type's score.ts and applies the round's pointMultiplier. Pure.
import { scoreDraw } from "./draw/score.ts";
import { scoreGeo } from "./geo/score.ts";
import { scoreTrueFalse } from "./true-false/score.ts";
import type { AnswerTypeId, Question, ScoreAnswer, ScoreFn, ScoreResult } from "./types.ts";

export const SCORERS: Record<AnswerTypeId, ScoreFn> = {
  draw: scoreDraw,
  geo: scoreGeo,
  "true-false": scoreTrueFalse,
};

/** Score all teams (pass every joined team; value null = no answer). Points × pointMultiplier. */
export function scoreQuestion(q: Question, answers: ScoreAnswer[]): ScoreResult[] {
  const m = q.pointMultiplier || 1;
  return SCORERS[q.answerType](q, answers).map((r) => ({ ...r, points: r.points * m }));
}
