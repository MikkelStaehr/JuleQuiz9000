"use server";

import { randomInt } from "node:crypto";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ADMIN_COOKIE, adminToken, checkPassword, requireAdmin } from "@/lib/admin-auth";
import { META } from "@/lib/answerTypes/meta";
import { scoreQuestion } from "@/lib/answerTypes/scoring";
import { drawJudgingComplete } from "@/lib/answerTypes/draw/score";
import type { Question, ScoreAnswer, ScoreResult } from "@/lib/answerTypes/types";
import { findQuestion, getQuiz, invalidateQuizCache, nextQuestion, parseQuiz, type Quiz } from "@/lib/quiz";
import { createMediaUploadUrl, writeQuizContent } from "@/lib/quizStore";
import { getAdminSupabase } from "@/lib/supabase/admin";
import type { AnswerValue, MediaCommand } from "@/lib/types";

type Result<T = unknown> = { ok: true; data?: T } | { ok: false; error: string };

async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    await requireAdmin();
    const data = await fn();
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function must<D, T extends { data: D; error: { message: string } | null }>(res: T): T & { data: NonNullable<T["data"]> } {
  if (res.error) throw new Error(res.error.message);
  return res as T & { data: NonNullable<T["data"]> };
}

// ───────────── auth ─────────────

export async function login(_prev: { error?: string } | null, formData: FormData) {
  const pw = String(formData.get("password") ?? "");
  if (!process.env.ADMIN_PASSWORD) return { error: "ADMIN_PASSWORD er ikke sat på serveren" };
  if (!checkPassword(pw)) {
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    return { error: "Forkert password" };
  }
  (await cookies()).set(ADMIN_COOKIE, adminToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  revalidatePath("/admin");
  return { error: undefined };
}

export async function logout() {
  (await cookies()).delete(ADMIN_COOKIE);
  revalidatePath("/admin");
}

// ───────────── state helpers ─────────────

function questionFields(q: Question, quiz: Quiz) {
  return {
    current_round: q.round,
    current_index: q.index,
    question_key: q.key,
    round_title: q.roundTitle,
    round_size: q.roundSize,
    total_rounds: quiz.totalRounds,
    point_multiplier: q.pointMultiplier,
    answer_type: q.answerType,
  };
}

/** Public part of the question (never the facit). */
function shownFields(q: Question) {
  return {
    question_text: q.text,
    media_type: q.mediaType,
    media_url: q.mediaUrl,
    show_text_on_play: q.showTextOnPlay,
    public_payload: { ...META[q.answerType].publicPayload(q), country: q.country },
  };
}

const CLEARED = {
  question_text: null,
  media_type: "none",
  media_url: null,
  show_text_on_play: false,
  public_payload: {},
  answer_text: null,
  reveal_payload: null,
  reveal_step: 0,
  timer_seconds: null,
  timer_ends_at: null,
  media_command: "stop",
  media_command_at: null,
  media_seek: null,
} as const;

function mediaKind(url: string): "audio" | "video" | "image" {
  if (/\.(mp3|wav|ogg|oga|m4a|aac|flac)(\?|$)/i.test(url)) return "audio";
  if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(url)) return "video";
  return "image";
}

async function current(gameId: string) {
  const { data } = must(
    await getAdminSupabase()
      .from("game_state")
      .select("phase, question_key, reveal_step, reveal_payload")
      .eq("game_id", gameId)
      .single(),
  );
  const quiz = await getQuiz();
  const q = findQuestion(quiz, data.question_key);
  if (!q) throw new Error(`Spørgsmålet "${data.question_key}" findes ikke længere i quizzen – brug "Hop til"`);
  return {
    q,
    quiz,
    phase: data.phase as string,
    step: data.reveal_step as number,
    revealPayload: data.reveal_payload as Record<string, unknown> | null,
  };
}

async function patchState(gameId: string, patch: Record<string, unknown>) {
  must(await getAdminSupabase().from("game_state").update({ ...patch, updated_at: new Date().toISOString() }).eq("game_id", gameId));
}

// ───────────── scoring ─────────────

async function loadScoreAnswers(gameId: string, q: Question): Promise<ScoreAnswer[]> {
  const sb = getAdminSupabase();
  const [{ data: teams }, { data: answers }] = await Promise.all([
    sb.from("teams").select("id").eq("game_id", gameId).not("name", "is", null),
    sb.from("answers").select("team_id, value, wager, judgment").eq("game_id", gameId).eq("question_key", q.key),
  ]);
  const by = new Map((answers ?? []).map((a) => [a.team_id as string, a]));
  return (teams ?? []).map((t) => ({
    teamId: t.id as string,
    value: by.get(t.id)?.value ?? null,
    wager: (by.get(t.id)?.wager as number | null) ?? null,
    judgment: (by.get(t.id)?.judgment as Record<string, unknown> | null) ?? null,
  }));
}

async function computeScores(gameId: string, q: Question): Promise<ScoreResult[]> {
  return scoreQuestion(q, await loadScoreAnswers(gameId, q));
}

/**
 * auto    – at lock / reveal: write computed points, but only over rows that are still 'auto'
 * judge   – after a quizmaster judgment (draw): write over everything except manual overrides
 * approve – quizmaster pressed "Godkend": same as judge, marked 'approved'
 * draw/closest is only written once every drawing has been read or marked "ugyldig".
 */
async function storeScores(gameId: string, q: Question, mode: "auto" | "judge" | "approve") {
  const sb = getAdminSupabase();
  const answers = await loadScoreAnswers(gameId, q);
  if (q.answerType === "draw" && !drawJudgingComplete(q, answers)) {
    if (mode === "approve") throw new Error("Aflæs alle tegninger (eller markér dem ugyldige) før pointene kan godkendes");
    return;
  }
  if (q.answerType === "draw" && mode === "auto" && answers.every((a) => !a.judgment)) return; // nothing judged yet
  const results = scoreQuestion(q, answers);
  const { data: existing } = await sb.from("scores").select("team_id, source").eq("game_id", gameId).eq("question_key", q.key);
  const src = new Map((existing ?? []).map((s) => [s.team_id as string, s.source as string]));
  const now = new Date().toISOString();
  const rows = results
    .filter((r) => (mode === "auto" ? !src.has(r.teamId) || src.get(r.teamId) === "auto" : src.get(r.teamId) !== "manual"))
    .map((r) => ({
      game_id: gameId,
      team_id: r.teamId,
      question_key: q.key,
      round: q.round,
      points: r.points,
      detail: { ...r.detail, rank: r.rank ?? null },
      source: mode === "approve" ? "approved" : "auto",
      updated_at: now,
    }));
  if (rows.length) must(await sb.from("scores").upsert(rows, { onConflict: "team_id,question_key" }));
}

// ───────────── game lifecycle ─────────────

const DEMO_NAMES = ["Nissebanden", "Rensdyrene", "Pebernødderne", "Team Risalamande"];
const NAME = "Den kæmpe store elite jule quiz";

export async function createGame(teamCount: number, demo: boolean): Promise<Result> {
  return run(async () => {
    const sb = getAdminSupabase();
    const quiz = await getQuiz();
    if (!quiz.questions.length) throw new Error("Quizzen har ingen spørgsmål – opret dem under “Rediger quiz”");
    const real = demo ? Math.min(4, Math.max(0, teamCount)) : Math.min(8, Math.max(1, teamCount));
    const total = demo ? 4 + real : real;
    must(await sb.from("games").update({ active: false }).eq("active", true));
    const { data: game } = must(
      await sb.from("games").insert({ name: demo ? `Demo – ${NAME}` : NAME, is_demo: demo }).select("id").single(),
    );
    const codes = new Set<string>();
    while (codes.size < total) codes.add(String(randomInt(1000, 10000)));
    const now = new Date().toISOString();
    must(
      await sb.from("teams").insert(
        [...codes].map((code, i) => ({
          game_id: game.id,
          slot: i + 1,
          join_code: code,
          is_demo: demo && i < 4,
          name: demo && i < 4 ? DEMO_NAMES[i] : null,
          joined_at: demo && i < 4 ? now : null,
        })),
      ),
    );
    must(await sb.from("game_state").insert({ game_id: game.id, phase: "idle", ...CLEARED, ...questionFields(quiz.questions[0], quiz) }));
    revalidatePath("/admin");
  });
}

// ───────────── teams ─────────────

const MORE_DEMO_NAMES = ["Glöggholmerne", "Kravlenisserne", "Team Brunkage", "Julehjerterne"];

/** Add a team slot (max 8) with a fresh 4-digit code – or a simulated demo team. */
export async function addTeam(gameId: string, demo = false): Promise<Result> {
  return run(async () => {
    const sb = getAdminSupabase();
    const { data: teams } = must(await sb.from("teams").select("slot, join_code, name").eq("game_id", gameId));
    if (teams.length >= 8) throw new Error("Der kan højst være 8 hold");
    const used = new Set(teams.map((t) => t.slot as number));
    const slot = [1, 2, 3, 4, 5, 6, 7, 8].find((s) => !used.has(s))!;
    const codes = new Set(teams.map((t) => t.join_code as string));
    let code = "";
    do code = String(randomInt(1000, 10000));
    while (codes.has(code));
    const names = new Set(teams.map((t) => t.name as string | null));
    const name = demo ? ([...DEMO_NAMES, ...MORE_DEMO_NAMES].find((n) => !names.has(n)) ?? `Demohold ${slot}`) : null;
    must(
      await sb.from("teams").insert({
        game_id: gameId,
        slot,
        join_code: code,
        is_demo: demo,
        name,
        joined_at: demo ? new Date().toISOString() : null,
      }),
    );
    revalidatePath("/admin"); // new join code → refresh server-rendered codes
  });
}

/** Remove a team (its answers and points are deleted too). */
export async function removeTeam(gameId: string, teamId: string): Promise<Result> {
  return run(async () => {
    const sb = getAdminSupabase();
    const { data: team } = must(await sb.from("teams").select("game_id").eq("id", teamId).single());
    if (team.game_id !== gameId) throw new Error("Holdet hører ikke til dette spil");
    const { data: drawings } = await sb.from("answers").select("value").eq("team_id", teamId);
    const paths = (drawings ?? []).map((a) => (a.value as { path?: string } | null)?.path).filter((p): p is string => !!p);
    if (paths.length) await sb.storage.from("answers").remove(paths);
    must(await sb.from("teams").delete().eq("id", teamId)); // answers + scores cascade
    await patchState(gameId, {}); // bump → every screen refetches teams (filtered DELETEs aren't sent by Realtime)
    revalidatePath("/admin");
  });
}

export async function endGame(gameId: string): Promise<Result> {
  return run(async () => {
    must(await getAdminSupabase().from("games").update({ active: false }).eq("id", gameId));
    revalidatePath("/admin");
  });
}

// ───────────── phases ─────────────

export async function showQuestion(gameId: string): Promise<Result> {
  return run(async () => {
    const { q } = await current(gameId);
    await patchState(gameId, { ...CLEARED, ...shownFields(q), phase: "question" });
  });
}

export async function startTimer(gameId: string): Promise<Result> {
  return run(async () => {
    const { q, phase } = await current(gameId);
    if (phase === "idle") await patchState(gameId, { ...CLEARED, ...shownFields(q), phase: "question" });
    must(await getAdminSupabase().rpc("start_timer", { p_game: gameId, p_seconds: q.timerSeconds }));
  });
}

/** Lock (manually or when the timer hits 0) → points are computed automatically. */
export async function lockNow(gameId: string): Promise<Result> {
  return run(async () => {
    const { q } = await current(gameId);
    must(await getAdminSupabase().rpc("lock_now", { p_game: gameId }));
    await storeScores(gameId, q, "auto");
  });
}

export async function reveal(gameId: string): Promise<Result> {
  return run(async () => {
    const { q, phase } = await current(gameId);
    if (phase === "countdown" || phase === "question") must(await getAdminSupabase().rpc("lock_now", { p_game: gameId }));
    const revealMedia = q.revealMediaUrl && mediaKind(q.revealMediaUrl) !== "image" ? q.revealMediaUrl : null;
    await patchState(gameId, {
      ...shownFields(q),
      ...(revealMedia ? { media_url: revealMedia, media_type: mediaKind(revealMedia) } : {}),
      phase: "reveal",
      reveal_step: 1,
      answer_text: META[q.answerType].answerText(q),
      reveal_payload: {
        ...META[q.answerType].revealPayload(q),
        source: q.source,
        explanation: q.explanation,
        ...(q.answerType === "draw" ? { drawCount: await countDrawings(gameId, q.key) } : {}),
      },
      media_command: "stop",
      media_seek: null,
    });
    // late answers (grace period) are included; approved/manual points are kept
    await storeScores(gameId, q, "auto");
  });
}

async function countDrawings(gameId: string, key: string) {
  const { data } = await getAdminSupabase().from("answers").select("value").eq("game_id", gameId).eq("question_key", key);
  return (data ?? []).filter((a) => typeof (a.value as { path?: unknown } | null)?.path === "string").length;
}

/** Stepwise reveal (e.g. geo: pins → facit → lines → ranking). */
/**
 * Next reveal step. `fromStep` (auto sequence): only advance if we are still on that step,
 * so two open admin tabs can't skip steps.
 */
export async function advanceReveal(gameId: string, fromStep?: number): Promise<Result> {
  return run(async () => {
    const { q, step, phase, revealPayload } = await current(gameId);
    if (phase !== "reveal") return;
    if (fromStep !== undefined && step !== fromStep) return;
    const max = META[q.answerType].revealSteps(revealPayload);
    if (step >= max) return;
    must(
      await getAdminSupabase()
        .from("game_state")
        .update({ reveal_step: step + 1, updated_at: new Date().toISOString() })
        .eq("game_id", gameId)
        .eq("reveal_step", step),
    );
  });
}

/** Scoreboard. `afterRevealOf` (auto sequence): only if that question's reveal is still on screen. */
export async function showScoreboard(gameId: string, afterRevealOf?: string): Promise<Result> {
  return run(async () => {
    if (afterRevealOf) {
      const { data } = must(await getAdminSupabase().from("game_state").select("phase, question_key").eq("game_id", gameId).single());
      if (data.phase !== "reveal" || data.question_key !== afterRevealOf) return;
    }
    await patchState(gameId, { phase: "scoreboard", media_command: "stop" });
  });
}

export async function next(gameId: string): Promise<Result> {
  return run(async () => {
    const { q, quiz } = await current(gameId).catch(async () => ({ q: null, quiz: await getQuiz() }));
    const n = q ? nextQuestion(quiz, q.key) : quiz.questions[0];
    if (!n) return patchState(gameId, { ...CLEARED, phase: "finished" });
    await patchState(gameId, { ...CLEARED, ...questionFields(n, quiz), phase: "idle" });
  });
}

export async function gotoQuestion(gameId: string, key: string): Promise<Result> {
  return run(async () => {
    const quiz = await getQuiz();
    const q = findQuestion(quiz, key);
    if (!q) throw new Error("Ukendt spørgsmål");
    await patchState(gameId, { ...CLEARED, ...questionFields(q, quiz), phase: "idle" });
  });
}

/** play (optionally from `seek` seconds; 0 = restart) · pause · stop – on the big screen only. */
export async function mediaCommand(gameId: string, cmd: MediaCommand, seek: number | null = null): Promise<Result> {
  return run(async () => {
    const s = seek === null || !Number.isFinite(seek) ? null : Math.max(0, Math.min(3600, seek));
    await patchState(gameId, { media_command: cmd, media_command_at: new Date().toISOString(), media_seek: s });
  });
}

// ───────────── points ─────────────

/** Quizmaster override for one team on one question. */
export async function setScore(gameId: string, teamId: string, qKey: string, points: number): Promise<Result> {
  return run(async () => {
    const q = findQuestion(await getQuiz(), qKey);
    if (!q) throw new Error("Ugyldigt spørgsmål");
    if (!Number.isInteger(points) || Math.abs(points) > 50) throw new Error("Point skal være et heltal mellem −50 og 50");
    const sb = getAdminSupabase();
    const { data: prev } = await sb.from("scores").select("detail").eq("team_id", teamId).eq("question_key", qKey).maybeSingle();
    must(
      await sb.from("scores").upsert(
        {
          game_id: gameId,
          team_id: teamId,
          question_key: qKey,
          round: q.round,
          points,
          detail: prev?.detail ?? null,
          source: "manual",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "team_id,question_key" },
      ),
    );
  });
}

/** "Beregn point": proposal for the current question (nothing is written). */
export async function proposeScores(gameId: string): Promise<Result<ScoreResult[]>> {
  return run(async () => {
    const { q } = await current(gameId);
    return computeScores(gameId, q);
  });
}

/** "Godkend": write the proposal (keeps manual overrides, incl. text judgments). */
export async function approveScores(gameId: string): Promise<Result> {
  return run(async () => {
    const { q } = await current(gameId);
    await storeScores(gameId, q, "approve");
  });
}

/**
 * Draw rounds: the quizmaster's judgment of one team's drawing – merged into answers.judgment:
 * closest {read, invalid} · manual-parts {parts: [true,false,…]} · manual {points}. Points are recomputed.
 */
export async function judgeAnswer(gameId: string, teamId: string, judgment: Record<string, unknown>): Promise<Result> {
  return run(async () => {
    const { q } = await current(gameId);
    if (q.answerType !== "draw") throw new Error("Kun for tegne-spørgsmål");
    const clean: Record<string, unknown> = {};
    if ("read" in judgment) clean.read = typeof judgment.read === "number" && Number.isFinite(judgment.read) ? judgment.read : null;
    if ("invalid" in judgment) clean.invalid = judgment.invalid === true;
    if ("parts" in judgment && Array.isArray(judgment.parts))
      clean.parts = q.parts.map((_, i) => ((judgment.parts as unknown[])[i] === true ? true : (judgment.parts as unknown[])[i] === false ? false : null));
    if ("points" in judgment) {
      if (!q.manualPoints.includes(judgment.points as number)) throw new Error("Ugyldige point");
      clean.points = judgment.points;
    }
    const sb = getAdminSupabase();
    const { data: row } = must(
      await sb.from("answers").select("judgment").eq("game_id", gameId).eq("question_key", q.key).eq("team_id", teamId).single(),
    );
    must(
      await sb
        .from("answers")
        .update({ judgment: { ...((row.judgment as Record<string, unknown> | null) ?? {}), ...clean } })
        .eq("game_id", gameId)
        .eq("question_key", q.key)
        .eq("team_id", teamId),
    );
    await storeScores(gameId, q, "judge");
  });
}

// ───────────── answers ─────────────

/** Live answer values for the current question (quizmaster only – clients can't read values before reveal). */
export async function getLiveAnswers(gameId: string): Promise<Result<AnswerValue[]>> {
  return run(async () => {
    const { q } = await current(gameId);
    const { data } = must(
      await getAdminSupabase()
        .from("answers")
        .select("team_id, value, wager, judgment, submitted_at")
        .eq("game_id", gameId)
        .eq("question_key", q.key),
    );
    return data as AnswerValue[];
  });
}

/** Delete all answers + computed points for the current question (e.g. to re-run it). */
export async function clearAnswers(gameId: string): Promise<Result> {
  return run(async () => {
    const { q } = await current(gameId);
    const sb = getAdminSupabase();
    const { data: old } = await sb.from("answers").select("value").eq("game_id", gameId).eq("question_key", q.key);
    const paths = (old ?? []).map((a) => (a.value as { path?: string } | null)?.path).filter((p): p is string => !!p);
    if (paths.length) await sb.storage.from("answers").remove(paths);
    must(await sb.from("answers").delete().eq("game_id", gameId).eq("question_key", q.key));
    must(await sb.from("scores").delete().eq("game_id", gameId).eq("question_key", q.key).neq("source", "manual"));
    await patchState(gameId, {}); // bump → clients refetch
  });
}

/** Demo mode: answer on behalf of a simulated team (only while the question is open). */
export async function demoSubmit(
  gameId: string,
  teamId: string,
  value: unknown,
  wager: number | null,
  pngDataUrl: string | null = null,
): Promise<Result> {
  return run(async () => {
    const sb = getAdminSupabase();
    const { data: team } = must(await sb.from("teams").select("is_demo, game_id").eq("id", teamId).single());
    if (!team.is_demo || team.game_id !== gameId) throw new Error("Kun demo-hold");
    const { data: gs } = must(await sb.from("game_state").select("phase, question_key").eq("game_id", gameId).single());
    if (gs.phase !== "countdown" && gs.phase !== "locked") throw new Error("Spørgsmålet er ikke åbent");
    if (pngDataUrl) {
      const m = /^data:image\/png;base64,(.+)$/.exec(pngDataUrl);
      if (!m) throw new Error("Ugyldigt billede");
      const bytes = Buffer.from(m[1], "base64");
      if (bytes.length > 1_500_000) throw new Error("Billedet er for stort");
      const path = `${gameId}/${gs.question_key}/${teamId}.png`;
      must(await sb.storage.from("answers").upload(path, bytes, { contentType: "image/png", upsert: true }));
      value = { path };
    }
    must(
      await sb.from("answers").upsert(
        { game_id: gameId, team_id: teamId, question_key: gs.question_key, value, wager, submitted_at: new Date().toISOString() },
        { onConflict: "team_id,question_key" },
      ),
    );
  });
}

// ───────────── quiz editor ─────────────

/** Validate with the same rules as the game, then save (with backup). Returns the number of questions. */
export async function saveQuiz(content: unknown): Promise<Result<number>> {
  return run(async () => {
    const questions = parseQuiz(content);
    if (questions.length === 0) throw new Error("Quizzen skal have mindst ét spørgsmål");
    await writeQuizContent(content);
    invalidateQuizCache();
    revalidatePath("/admin");
    return questions.length;
  });
}

/** Signed upload URL for a question image/audio/video (uploaded directly from the browser). */
export async function createMediaUpload(fileName: string): Promise<Result<{ bucket: string; path: string; token: string; publicUrl: string }>> {
  return run(async () => createMediaUploadUrl(String(fileName).slice(0, 120)));
}
