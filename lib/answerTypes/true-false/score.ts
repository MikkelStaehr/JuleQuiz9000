import type { Question, ScoreAnswer, ScoreResult } from "../types.ts";

export function tfChoice(v: unknown): boolean | null {
  const c = (v as { choice?: unknown } | null)?.choice;
  return typeof c === "boolean" ? c : null;
}

/**
 * Without wager: correct = pointsCorrect (1), wrong = 0.
 * With wager (round.wagerEnabled): correct = +wager, wrong = −wager (wager 1–3, default 1).
 * No answer = 0.
 */
export function scoreTrueFalse(q: Question, answers: ScoreAnswer[]): ScoreResult[] {
  return answers.map((a) => {
    const choice = tfChoice(a.value);
    if (choice === null) return { teamId: a.teamId, points: 0, detail: { choice: null, correct: null, wager: null } };
    const correct = choice === q.answer;
    if (!q.wagerEnabled) return { teamId: a.teamId, points: correct ? q.pointsCorrect : 0, detail: { choice, correct, wager: null } };
    const wager = a.wager && a.wager >= 1 && a.wager <= 3 ? a.wager : 1;
    return { teamId: a.teamId, points: correct ? wager : -wager, detail: { choice, correct, wager } };
  });
}
