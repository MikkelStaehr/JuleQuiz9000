import "server-only";
import raw from "@/data/quiz.json";
import { questionKey, type QuizQuestion, type RoundConfig, type Scoring } from "./types";

/**
 * /data/quiz.json is either a flat array of questions (legacy) or
 * { rounds: RoundConfig[], questions: Question[] }.
 * Round settings (scoring, pointMultiplier, closestPoints) apply to all questions in the round;
 * a question may override them.
 */
function load(input: unknown): QuizQuestion[] {
  const obj = Array.isArray(input) ? { rounds: [], questions: input } : (input as { rounds?: unknown; questions?: unknown });
  if (!obj || !Array.isArray(obj.questions)) throw new Error("quiz.json: mangler questions[]");
  const rounds = new Map<number, RoundConfig>();
  for (const r of (obj.rounds as RoundConfig[] | undefined) ?? []) {
    if (!Number.isInteger(r.round)) throw new Error("quiz.json rounds: round mangler");
    if (r.scoring && !["manual", "closest"].includes(r.scoring)) throw new Error(`quiz.json runde ${r.round}: scoring`);
    if (r.pointMultiplier !== undefined && !(Number.isInteger(r.pointMultiplier) && r.pointMultiplier >= 1 && r.pointMultiplier <= 5))
      throw new Error(`quiz.json runde ${r.round}: pointMultiplier skal være 1–5`);
    rounds.set(r.round, r);
  }

  const seen = new Set<string>();
  const out = obj.questions.map((q, i): QuizQuestion => {
    const e = (msg: string) => new Error(`quiz.json questions[${i}]: ${msg}`);
    if (typeof q !== "object" || q === null) throw e("ikke et objekt");
    const x = q as Record<string, unknown>;
    if (!Number.isInteger(x.round) || (x.round as number) < 1) throw e("round");
    if (!Number.isInteger(x.index) || (x.index as number) < 1) throw e("index");
    if (typeof x.text !== "string" || !x.text) throw e("text");
    if (typeof x.answer !== "string") throw e("answer");
    if (!["none", "image", "audio", "video"].includes(x.mediaType as string)) throw e("mediaType");
    if (x.mediaType !== "none" && typeof x.mediaUrl !== "string") throw e("mediaUrl mangler");
    if (!Number.isInteger(x.timerSeconds) || (x.timerSeconds as number) < 5) throw e("timerSeconds");
    if (x.answerType !== undefined && x.answerType !== "draw") throw e('answerType skal være "draw"');
    const key = questionKey(x.round as number, x.index as number);
    if (seen.has(key)) throw e(`dublet ${key}`);
    seen.add(key);

    const hasScale = typeof x.scaleMin === "number" && typeof x.scaleMax === "number";
    if (hasScale && (x.scaleMin as number) >= (x.scaleMax as number)) throw e("scaleMin skal være < scaleMax");
    const bg = (x.canvasBackground as string | undefined) ?? (hasScale ? "scale" : "blank");
    if (!["blank", "scale"].includes(bg)) throw e("canvasBackground");
    if (bg === "scale" && !hasScale) throw e('canvasBackground "scale" kræver scaleMin/scaleMax');
    if (x.answerValue !== undefined && x.answerValue !== null && typeof x.answerValue !== "number") throw e("answerValue");

    const r = rounds.get(x.round as number);
    const scoring = ((x.scoring as Scoring | undefined) ?? r?.scoring ?? "manual") as Scoring;
    const pointMultiplier = (x.pointMultiplier as number | undefined) ?? r?.pointMultiplier ?? 1;
    if (scoring === "closest" && typeof x.answerValue !== "number")
      console.warn(`quiz.json ${key}: scoring "closest" uden answerValue – point gives manuelt`);

    return {
      round: x.round as number,
      roundTitle: String(x.roundTitle ?? r?.title ?? `Runde ${x.round}`),
      index: x.index as number,
      text: x.text as string,
      mediaType: x.mediaType as QuizQuestion["mediaType"],
      mediaUrl: (x.mediaUrl as string | null) ?? null,
      answer: x.answer as string,
      timerSeconds: x.timerSeconds as number,
      answerType: "draw",
      canvasBackground: bg as QuizQuestion["canvasBackground"],
      scaleMin: hasScale ? (x.scaleMin as number) : null,
      scaleMax: hasScale ? (x.scaleMax as number) : null,
      unit: typeof x.unit === "string" ? x.unit : null,
      answerValue: typeof x.answerValue === "number" ? x.answerValue : null,
      scoring,
      pointMultiplier,
      closestPoints: (x.closestPoints as number[] | undefined) ?? r?.closestPoints ?? [3, 2, 1],
    };
  });
  return out.sort((a, b) => a.round - b.round || a.index - b.index);
}

export const QUIZ: QuizQuestion[] = load(raw);
export const TOTAL_ROUNDS = Math.max(...QUIZ.map((q) => q.round));

export function roundSize(round: number) {
  return QUIZ.filter((q) => q.round === round).length;
}

export function findQuestion(round: number, index: number) {
  return QUIZ.find((q) => q.round === round && q.index === index) ?? null;
}

export function nextQuestion(round: number, index: number) {
  const i = QUIZ.findIndex((q) => q.round === round && q.index === index);
  return i >= 0 && i + 1 < QUIZ.length ? QUIZ[i + 1] : null;
}

/**
 * "closest" scoring: rank teams by distance to the facit; ties share a rank
 * (competition ranking). Base points from closestPoints, × multiplier.
 */
export function closestScores(
  q: QuizQuestion,
  teamIds: string[],
  values: Map<string, number | null>,
): { teamId: string; points: number }[] {
  if (q.answerValue === null) return [];
  const dist = teamIds
    .map((id) => ({ id, d: values.get(id) ?? null }))
    .map(({ id, d }) => ({ id, d: d === null ? null : Math.abs(d - q.answerValue!) }));
  const ranked = dist.filter((x) => x.d !== null).sort((a, b) => a.d! - b.d!);
  const pts = new Map<string, number>();
  for (const x of ranked) {
    const rank = ranked.findIndex((y) => Math.abs(y.d! - x.d!) < 1e-9); // first index with same distance
    pts.set(x.id, (q.closestPoints[rank] ?? 0) * q.pointMultiplier);
  }
  return teamIds.map((id) => ({ teamId: id, points: pts.get(id) ?? 0 }));
}
