import "server-only";
import { readQuizContent } from "./quizStore";
import { DEFAULT_LABELS, META } from "./answerTypes/meta";
import {
  ANSWER_TYPES,
  DRAW_SCORINGS,
  type AnswerTypeId,
  type DrawScoring,
  type MediaType,
  type Question,
  type TrueFalseLabels,
} from "./answerTypes/types";

/**
 * /data/quiz.json
 * { rounds: [{ number, title, answerType, pointMultiplier?, defaultTimerSeconds?, pointsByRank?, pointsCorrect?,
 *              scoring? (draw), unit?, parts?, manualPoints?, labels? (true-false), wagerEnabled?, questions: [...] }] }
 * question: { key, text, mediaType, mediaUrl, timerSeconds?, answer, showTextOnPlay?, revealMediaUrl?, source?, ...type-specific }
 * unit / parts may also be set per question (overrides the round).
 */
const COMMON = new Set(["key", "text", "mediaType", "mediaUrl", "timerSeconds", "answer", "showTextOnPlay", "revealMediaUrl", "unit", "parts", "source"]);

/** An uploaded/linked media file: absolute http(s) URL or a site path like /media/x.jpg */
export const isMediaUrl = (u: string) => /^(https?:\/\/\S+|\/\S+)$/.test(u.trim());

const isStrList = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === "string");
const isNumList = (v: unknown): v is number[] => Array.isArray(v) && v.every((n) => typeof n === "number" && Number.isFinite(n));

/** Validate + resolve quiz content (throws a readable message on the first problem). */
export function parseQuiz(input: unknown): Question[] {
  const root = input as { rounds?: unknown };
  if (!root || !Array.isArray(root.rounds)) throw new Error("quiz.json: mangler rounds[]");
  const keys = new Set<string>();
  const out: Question[] = [];

  root.rounds.forEach((r: Record<string, unknown>, ri: number) => {
    const where = `quiz.json rounds[${ri}]`;
    const fail = (m: string) => new Error(`${where}: ${m}`);
    if (!Number.isInteger(r.number)) throw fail("number");
    if (typeof r.title !== "string") throw fail("title");
    const type = r.answerType as AnswerTypeId;
    if (!ANSWER_TYPES.includes(type)) throw fail(`answerType skal være én af ${ANSWER_TYPES.join(", ")}`);
    const meta = META[type];

    const mult = (r.pointMultiplier as number | undefined) ?? 1;
    if (!Number.isInteger(mult) || mult < 1 || mult > 5) throw fail("pointMultiplier skal være 1–5");
    const pointsByRank = r.pointsByRank ?? meta.defaults.pointsByRank;
    if (!isNumList(pointsByRank)) throw fail("pointsByRank skal være en liste af tal");
    const pointsCorrect = (r.pointsCorrect as number | undefined) ?? meta.defaults.pointsCorrect;
    if (!Number.isFinite(pointsCorrect)) throw fail("pointsCorrect");
    const manualPoints = r.manualPoints ?? [0, 1, 2];
    if (!isNumList(manualPoints)) throw fail("manualPoints");
    const scoring = (r.scoring as DrawScoring | undefined) ?? null;
    if (type === "draw" && !DRAW_SCORINGS.includes(scoring as DrawScoring)) throw fail(`scoring skal være ${DRAW_SCORINGS.join(" | ")}`);
    const labels = (r.labels as TrueFalseLabels | undefined) ?? DEFAULT_LABELS;
    if (typeof labels.true !== "string" || typeof labels.false !== "string") throw fail("labels skal være { true, false }");
    const defTimer = (r.defaultTimerSeconds as number | undefined) ?? meta.defaults.timerSeconds;

    const qs = r.questions as Record<string, unknown>[];
    if (!Array.isArray(qs) || qs.length === 0) throw fail("questions[] mangler");

    qs.forEach((q, qi) => {
      const w = `${where}.questions[${qi}]`;
      const qfail = (m: string) => new Error(`${w}: ${m}`);
      if (typeof q.key !== "string" || !/^[A-Za-z0-9_-]{1,40}$/.test(q.key)) throw qfail("key (bogstaver/tal/-/_, maks 40)");
      if (keys.has(q.key)) throw qfail(`dublet key "${q.key}"`);
      keys.add(q.key);
      if (typeof q.text !== "string" || !q.text) throw qfail("text");
      const mediaType = (q.mediaType as MediaType | undefined) ?? "none";
      if (!["none", "image", "audio", "video"].includes(mediaType)) throw qfail("mediaType");
      if (mediaType !== "none" && typeof q.mediaUrl !== "string") throw qfail("mediaUrl mangler");
      for (const f of ["mediaUrl", "revealMediaUrl"] as const)
        if (typeof q[f] === "string" && q[f] && !isMediaUrl(q[f] as string))
          throw qfail(`“${q[f]}” er ikke en adresse til et medie (https://… eller /media/…). Kilder skrives i feltet “Kilde”.`);
      const timer = (q.timerSeconds as number | undefined) ?? defTimer;
      if (!Number.isInteger(timer) || timer < 5) throw qfail("timerSeconds");
      const parts = q.parts ?? r.parts ?? [];
      if (!isStrList(parts)) throw qfail("parts skal være en liste af tekster");

      const question: Question = {
        key: q.key,
        round: r.number as number,
        roundTitle: r.title as string,
        index: qi + 1,
        roundSize: qs.length,
        text: q.text,
        mediaType,
        mediaUrl: (q.mediaUrl as string | null) ?? null,
        timerSeconds: timer,
        answerType: type,
        answer: q.answer,
        showTextOnPlay: q.showTextOnPlay === true,
        revealMediaUrl: (q.revealMediaUrl as string | null | undefined) ?? null,
        source: typeof q.source === "string" && q.source.trim() ? q.source.trim().slice(0, 200) : null,
        extra: Object.fromEntries(Object.entries(q).filter(([k]) => !COMMON.has(k))),
        scoring: type === "draw" ? scoring : null,
        unit: String(q.unit ?? r.unit ?? ""),
        parts,
        labels,
        wagerEnabled: r.wagerEnabled === true,
        pointMultiplier: mult,
        pointsByRank,
        pointsCorrect,
        manualPoints,
      };
      try {
        meta.validate(question);
      } catch (e) {
        throw qfail((e as Error).message);
      }
      out.push(question);
    });
  });
  return out.sort((a, b) => a.round - b.round || a.index - b.index);
}

export interface Quiz {
  questions: Question[];
  totalRounds: number;
}

const CACHE_MS = 15_000;
let cache: { at: number; quiz: Quiz } | null = null;

/** The current quiz from Storage (validated). Cached for 15 s per server instance; saveQuiz() clears it. */
export async function getQuiz(): Promise<Quiz> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.quiz;
  const questions = parseQuiz(await readQuizContent());
  const quiz = { questions, totalRounds: new Set(questions.map((q) => q.round)).size };
  cache = { at: Date.now(), quiz };
  return quiz;
}

export function invalidateQuizCache() {
  cache = null;
}

export const findQuestion = (quiz: Quiz, key: string) => quiz.questions.find((q) => q.key === key) ?? null;

export function nextQuestion(quiz: Quiz, key: string) {
  const i = quiz.questions.findIndex((q) => q.key === key);
  return i >= 0 && i + 1 < quiz.questions.length ? quiz.questions[i + 1] : null;
}
