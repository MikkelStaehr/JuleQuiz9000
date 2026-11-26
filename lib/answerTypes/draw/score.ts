import { rankByDistance } from "../../ranking.ts";
import type { ClosestJudgment, ManualJudgment, PartsJudgment, Question, ScoreAnswer, ScoreResult } from "../types.ts";

export function drawPath(v: unknown): string | null {
  const p = (v as { path?: unknown } | null)?.path;
  return typeof p === "string" && p ? p : null;
}

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/**
 * Draw rounds are scored from the quizmaster's judgments of each drawing:
 * - closest      – the value read off the drawing; ranked by |read − answer| → pointsByRank. "ugyldig"/no drawing = 0, ranked last.
 * - manual-parts – ✓/✗ per part (e.g. Sang, Kunstner) → pointsCorrect per ✓.
 * - manual       – the quizmaster's 0/1/2 (any value in manualPoints).
 * Base points – the multiplier is applied centrally.
 */
export function scoreDraw(q: Question, answers: ScoreAnswer[]): ScoreResult[] {
  switch (q.scoring) {
    case "closest": {
      const facit = Number(q.answer);
      const read = new Map(
        answers.map((a) => {
          const j = (a.judgment ?? {}) as ClosestJudgment;
          return [a.teamId, drawPath(a.value) && !j.invalid && finite(j.read) ? j.read : null] as const;
        }),
      );
      return rankByDistance(
        answers.map((a) => ({ teamId: a.teamId, distance: read.get(a.teamId) == null ? null : Math.abs(read.get(a.teamId)! - facit) })),
        q.pointsByRank,
        1,
        1e-9,
      ).map((r) => {
        const j = (answers.find((a) => a.teamId === r.teamId)?.judgment ?? {}) as ClosestJudgment;
        return {
          teamId: r.teamId,
          points: r.points,
          rank: r.rank,
          detail: { read: read.get(r.teamId) ?? null, invalid: !!j.invalid, deviation: r.distance },
        };
      });
    }
    case "manual-parts":
      return answers.map((a) => {
        const parts = drawPath(a.value) ? ((a.judgment ?? {}) as PartsJudgment).parts ?? [] : [];
        const ok = q.parts.map((_, i) => parts[i] === true);
        return { teamId: a.teamId, points: ok.filter(Boolean).length * q.pointsCorrect, detail: { parts: ok } };
      });
    case "manual":
    default:
      return answers.map((a) => {
        const p = ((a.judgment ?? {}) as ManualJudgment).points;
        const points = drawPath(a.value) && finite(p) && q.manualPoints.includes(p) ? p : 0;
        return { teamId: a.teamId, points, detail: {} };
      });
  }
}

/** closest: every submitted drawing has a read value or is marked "ugyldig" (then the ranking can be computed). */
export function drawJudgingComplete(q: Question, answers: ScoreAnswer[]): boolean {
  if (q.scoring !== "closest") return true;
  return answers
    .filter((a) => drawPath(a.value))
    .every((a) => {
      const j = (a.judgment ?? {}) as ClosestJudgment;
      return j.invalid === true || finite(j.read);
    });
}
