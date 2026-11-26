// Shared types for the answer-type registry. Pure (no React) – importable from tests (node --test).

export type AnswerTypeId = "draw" | "geo" | "true-false";
export const ANSWER_TYPES: AnswerTypeId[] = ["draw", "geo", "true-false"];

/** How "draw" rounds are scored (set on the round). */
export type DrawScoring = "closest" | "manual-parts" | "manual";
export const DRAW_SCORINGS: DrawScoring[] = ["closest", "manual-parts", "manual"];

export type MediaType = "none" | "image" | "audio" | "video";

export interface TrueFalseLabels {
  true: string;
  false: string;
}

/** A fully resolved question (round settings merged in). Server-side only – contains the facit. */
export interface Question {
  key: string;
  round: number;
  roundTitle: string;
  /** 1-based position in the round */
  index: number;
  roundSize: number;
  text: string;
  mediaType: MediaType;
  mediaUrl: string | null;
  timerSeconds: number;
  answerType: AnswerTypeId;
  /** draw/closest: number · draw/manual*: text shown as facit · geo: {lat,lng,label} · true-false: boolean */
  answer: unknown;
  showTextOnPlay: boolean;
  revealMediaUrl: string | null;
  /** Optional source for the facit (e.g. "Danmarks Statistik, 2025") – shown at reveal. */
  source: string | null;
  /** Optional country the question is about (ISO alpha-2, e.g. "SG") – shown with its flag. */
  country: string | null;
  /** Other quiz.json fields (mapStart …) */
  extra: Record<string, unknown>;
  // ── round settings ──
  scoring: DrawScoring | null;
  unit: string;
  parts: string[];
  labels: TrueFalseLabels;
  wagerEnabled: boolean;
  pointMultiplier: number;
  pointsByRank: number[];
  pointsCorrect: number;
  /** draw/manual: the point buttons the quizmaster can give (default 0/1/2) */
  manualPoints: number[];
}

/**
 * One team's answer as seen by a score function. value = null → no answer.
 * judgment = what the quizmaster decided about it (draw rounds): { read, invalid } · { parts } · { points }.
 */
export interface ScoreAnswer {
  teamId: string;
  value: unknown | null;
  wager: number | null;
  judgment?: Record<string, unknown> | null;
}

export interface ScoreResult {
  teamId: string;
  points: number;
  /** Placement for rank-based scoring (1, 1, 3 …); null = no (valid) answer. */
  rank?: number | null;
  detail: Record<string, unknown>;
}

export type ScoreFn = (question: Question, answers: ScoreAnswer[]) => ScoreResult[];

/** What the server publishes in game_state when a question is shown (no facit). */
export interface PublicQuestion {
  key: string;
  answerType: AnswerTypeId;
  text: string;
  mediaType: MediaType;
  mediaUrl: string | null;
  showTextOnPlay: boolean;
  /** Type-specific public fields */
  payload: Record<string, unknown>;
}

// ── value / judgment shapes ──
export interface DrawValue { path: string }
export interface GeoValue { lat: number; lng: number }
export interface TrueFalseValue { choice: boolean }
export interface ClosestJudgment { read?: number | null; invalid?: boolean }
export interface PartsJudgment { parts?: (boolean | null)[] }
export interface ManualJudgment { points?: number }
