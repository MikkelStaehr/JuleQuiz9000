// Test helper: build a resolved Question with sensible defaults.
import { DEFAULT_LABELS, META } from "./meta.ts";
import type { AnswerTypeId, Question } from "./types.ts";

export function makeQuestion(answerType: AnswerTypeId, answer: unknown, over: Partial<Question> = {}): Question {
  const d = META[answerType].defaults;
  return {
    key: "q",
    round: 1,
    roundTitle: "Test",
    index: 1,
    roundSize: 1,
    text: "?",
    mediaType: "none",
    mediaUrl: null,
    timerSeconds: d.timerSeconds,
    answerType,
    answer,
    showTextOnPlay: false,
    revealMediaUrl: null,
    source: null,
    country: null,
    extra: {},
    scoring: answerType === "draw" ? "manual" : null,
    unit: "",
    parts: [],
    labels: DEFAULT_LABELS,
    wagerEnabled: false,
    pointMultiplier: 1,
    pointsByRank: d.pointsByRank,
    pointsCorrect: d.pointsCorrect,
    manualPoints: [0, 1, 2],
    ...over,
  };
}

export const byTeam = <T extends { teamId: string }>(rows: T[]) => Object.fromEntries(rows.map((r) => [r.teamId, r]));
