// Per-type metadata shared by server (quiz loader, actions) and client (play/display/admin). Pure.
import type { AnswerTypeId, Question, TrueFalseLabels } from "./types.ts";

export interface TypeMeta {
  label: string;
  defaults: { timerSeconds: number; pointsByRank: number[]; pointsCorrect: number };
  /** Number of reveal steps the quizmaster clicks through (≥ 1). */
  revealSteps(revealPayload: Record<string, unknown> | null): number;
  /** Throws a message if the quiz.json question (with its round settings resolved) is invalid. */
  validate(q: Question): void;
  /** Public, type-specific fields stored in game_state when the question is shown (never the facit). */
  publicPayload(q: Question): Record<string, unknown>;
  /** Facit etc., stored in game_state at reveal. */
  revealPayload(q: Question): Record<string, unknown>;
  /** Human-readable facit. */
  answerText(q: Question): string;
}

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function formatNumber(n: number, unit?: string | null): string {
  const s = n.toLocaleString("da-DK", { maximumFractionDigits: 2 });
  return unit ? `${s} ${unit}` : s;
}

export const DEFAULT_LABELS: TrueFalseLabels = { true: "SANDT", false: "FALSK" };

/** Reveal steps for draw: facit → one drawing at a time (zoom) → grid (→ ranking for closest). */
export function drawRevealSteps(r: Record<string, unknown> | null) {
  const count = num(r?.drawCount) ? (r!.drawCount as number) : 0;
  return count + 2 + (r?.scoring === "closest" ? 1 : 0);
}

export const META: Record<AnswerTypeId, TypeMeta> = {
  draw: {
    label: "Tegning",
    defaults: { timerSeconds: 60, pointsByRank: [3, 2, 1], pointsCorrect: 1 },
    revealSteps: drawRevealSteps,
    validate(q) {
      if (!q.scoring) throw new Error('draw-runder skal have scoring: "closest" | "manual-parts" | "manual"');
      if (q.scoring === "closest" && !num(q.answer)) throw new Error("closest: answer skal være et tal");
      if (q.scoring !== "closest" && typeof q.answer !== "string") throw new Error("answer skal være en tekst (facit)");
      if (q.scoring === "manual-parts" && q.parts.length === 0) throw new Error('manual-parts kræver parts, fx ["Sang","Kunstner"]');
    },
    publicPayload: (q) => ({ scoring: q.scoring, unit: q.unit, parts: q.parts }),
    // drawCount is filled in by the server at reveal (number of submitted drawings)
    revealPayload: (q) => ({ answer: q.answer, scoring: q.scoring, unit: q.unit, parts: q.parts }),
    answerText: (q) => (q.scoring === "closest" ? formatNumber(q.answer as number, q.unit) : String(q.answer)),
  },

  geo: {
    label: "Kort",
    defaults: { timerSeconds: 60, pointsByRank: [3, 2, 1], pointsCorrect: 0 },
    revealSteps: () => 4, // 1 team pins · 2 facit pin · 3 lines + km (fit all) · 4 ranking
    validate(q) {
      const a = q.answer as { lat?: unknown; lng?: unknown; label?: unknown } | null;
      if (!a || !num(a.lat) || !num(a.lng) || typeof a.label !== "string") throw new Error("answer skal være { lat, lng, label }");
      if (Math.abs(a.lat) > 90 || Math.abs(a.lng) > 180) throw new Error("ugyldige koordinater");
      if (!q.mediaUrl) throw new Error("mediaUrl (Street View-screenshot) mangler");
      const m = q.extra.mapStart as { lat?: unknown; lng?: unknown; zoom?: unknown } | undefined;
      if (m && (!num(m.lat) || !num(m.lng) || !num(m.zoom))) throw new Error("mapStart skal være { lat, lng, zoom }");
    },
    publicPayload: (q) => ({ mapStart: q.extra.mapStart ?? null }),
    revealPayload: (q) => ({ answer: q.answer }),
    answerText: (q) => (q.answer as { label: string }).label,
  },

  "true-false": {
    label: "Sandt / falsk",
    defaults: { timerSeconds: 15, pointsByRank: [], pointsCorrect: 1 },
    revealSteps: (r) => (r?.revealMediaUrl ? 3 : 2), // 1 flip all choices · 2 facit + points · (3 revealMediaUrl)
    validate(q) {
      if (typeof q.answer !== "boolean") throw new Error("answer skal være true eller false");
      if (!q.labels.true || !q.labels.false) throw new Error("labels skal være { true, false }");
    },
    publicPayload: (q) => ({ labels: q.labels, wagerEnabled: q.wagerEnabled }),
    revealPayload: (q) => ({ answer: q.answer, labels: q.labels, revealMediaUrl: q.revealMediaUrl }),
    answerText: (q) => (q.answer ? q.labels.true : q.labels.false),
  },
};
