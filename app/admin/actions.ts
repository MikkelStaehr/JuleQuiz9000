"use server";

import { randomInt } from "node:crypto";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ADMIN_COOKIE, adminToken, checkPassword, requireAdmin } from "@/lib/admin-auth";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { QUIZ, TOTAL_ROUNDS, closestScores, findQuestion, nextQuestion, roundSize } from "@/lib/quiz";
import { answerPath, questionKey, type MediaCommand, type QuizQuestion } from "@/lib/types";

type Result = { ok: true } | { ok: false; error: string };

async function run(fn: () => Promise<void>): Promise<Result> {
  try {
    await requireAdmin();
    await fn();
    return { ok: true };
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

// ───────────── helpers ─────────────

function questionFields(q: QuizQuestion) {
  return {
    current_round: q.round,
    current_index: q.index,
    round_title: q.roundTitle,
    round_size: roundSize(q.round),
    total_rounds: TOTAL_ROUNDS,
    // round-level settings are public (display announces "DOBBELT POINT" at round start)
    scoring: q.scoring,
    point_multiplier: q.pointMultiplier,
  };
}

function shownFields(q: QuizQuestion) {
  return {
    question_text: q.text,
    media_type: q.mediaType,
    media_url: q.mediaUrl,
    canvas_background: q.canvasBackground,
    scale_min: q.scaleMin,
    scale_max: q.scaleMax,
    scale_unit: q.unit,
  };
}

const CLEARED = {
  question_text: null,
  media_type: "none",
  media_url: null,
  answer_text: null,
  answer_value: null,
  canvas_background: "blank",
  scale_min: null,
  scale_max: null,
  scale_unit: null,
  timer_seconds: null,
  timer_ends_at: null,
  media_command: "stop",
  media_command_at: null,
} as const;

async function currentQuestion(gameId: string) {
  const sb = getAdminSupabase();
  const { data } = must(
    await sb.from("game_state").select("phase, current_round, current_index").eq("game_id", gameId).single(),
  );
  const q = findQuestion(data.current_round, data.current_index);
  if (!q) throw new Error("Spørgsmålet findes ikke i quiz.json");
  return { q, phase: data.phase as string };
}

async function patchState(gameId: string, patch: Record<string, unknown>) {
  must(
    await getAdminSupabase()
      .from("game_state")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("game_id", gameId),
  );
}

function uniqueCodes(n: number) {
  const codes = new Set<string>();
  while (codes.size < n) codes.add(String(randomInt(1000, 10000)));
  return [...codes];
}

const DEMO_NAMES = ["Nissebanden", "Rensdyrene", "Pebernødderne", "Team Risalamande"];

// ───────────── game lifecycle ─────────────

export async function createGame(teamCount: number, demo: boolean): Promise<Result> {
  return run(async () => {
    const sb = getAdminSupabase();
    const realTeams = demo ? Math.min(4, Math.max(0, teamCount)) : Math.min(8, Math.max(1, teamCount));
    const total = demo ? 4 + realTeams : realTeams;
    if (total > 8) throw new Error("Maks 8 hold");

    must(await sb.from("games").update({ active: false }).eq("active", true));
    const { data: game } = must(
      await sb
        .from("games")
        .insert({ name: demo ? "Demo – Den kæmpe store elite jule quiz" : "Den kæmpe store elite jule quiz", is_demo: demo })
        .select("id")
        .single(),
    );

    const codes = uniqueCodes(total);
    const now = new Date().toISOString();
    const rows = codes.map((code, i) => {
      const isDemoTeam = demo && i < 4;
      return {
        game_id: game.id,
        slot: i + 1,
        join_code: code,
        is_demo: isDemoTeam,
        name: isDemoTeam ? DEMO_NAMES[i] : null,
        joined_at: isDemoTeam ? now : null,
      };
    });
    must(await sb.from("teams").insert(rows));

    const first = QUIZ[0];
    must(await sb.from("game_state").insert({ game_id: game.id, phase: "idle", ...questionFields(first), ...CLEARED }));
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
    const { q } = await currentQuestion(gameId);
    await patchState(gameId, { ...CLEARED, ...shownFields(q), phase: "question" });
  });
}

export async function startTimer(gameId: string): Promise<Result> {
  return run(async () => {
    const { q, phase } = await currentQuestion(gameId);
    if (phase === "idle") await patchState(gameId, { ...CLEARED, ...shownFields(q), phase: "question" });
    // Timer end is computed with database time (single source of truth).
    must(await getAdminSupabase().rpc("start_timer", { p_game: gameId, p_seconds: q.timerSeconds }));
  });
}

export async function lockNow(gameId: string): Promise<Result> {
  return run(async () => {
    must(await getAdminSupabase().rpc("lock_now", { p_game: gameId }));
  });
}

export async function reveal(gameId: string): Promise<Result> {
  return run(async () => {
    const { q, phase } = await currentQuestion(gameId);
    if (phase === "countdown") must(await getAdminSupabase().rpc("lock_now", { p_game: gameId }));
    await patchState(gameId, {
      ...shownFields(q),
      phase: "reveal",
      answer_text: q.answer,
      answer_value: q.answerValue,
      media_command: "stop",
    });
    if (q.scoring === "closest") await applyClosest(gameId, q, false);
  });
}

/** Auto-award "closest" points. Without `force`, existing (possibly hand-corrected) points are kept. */
async function applyClosest(gameId: string, q: QuizQuestion, force: boolean) {
  if (q.answerValue === null) return;
  const sb = getAdminSupabase();
  const key = questionKey(q.round, q.index);
  if (!force) {
    const { count } = await sb
      .from("scores")
      .select("team_id", { count: "exact", head: true })
      .eq("game_id", gameId)
      .eq("question_key", key);
    if ((count ?? 0) > 0) return;
  }
  const [{ data: teams }, { data: answers }] = await Promise.all([
    sb.from("teams").select("id").eq("game_id", gameId).not("name", "is", null),
    sb.from("answers").select("team_id, scale_value").eq("game_id", gameId).eq("question_key", key),
  ]);
  const values = new Map((answers ?? []).map((a) => [a.team_id as string, a.scale_value as number | null]));
  const rows = closestScores(q, (teams ?? []).map((t) => t.id as string), values).map((r) => ({
    game_id: gameId,
    team_id: r.teamId,
    question_key: key,
    points: r.points,
    updated_at: new Date().toISOString(),
  }));
  if (rows.length) must(await sb.from("scores").upsert(rows, { onConflict: "team_id,question_key" }));
}

export async function recalcClosest(gameId: string): Promise<Result> {
  return run(async () => {
    const { q } = await currentQuestion(gameId);
    if (q.scoring !== "closest" || q.answerValue === null) throw new Error("Spørgsmålet bruger ikke tættest-point");
    await applyClosest(gameId, q, true);
  });
}

export async function showScoreboard(gameId: string): Promise<Result> {
  return run(async () => {
    await patchState(gameId, { phase: "scoreboard", media_command: "stop" });
  });
}

export async function next(gameId: string): Promise<Result> {
  return run(async () => {
    const { q } = await currentQuestion(gameId);
    const n = nextQuestion(q.round, q.index);
    if (!n) {
      await patchState(gameId, { ...CLEARED, phase: "finished" });
      return;
    }
    await patchState(gameId, { ...CLEARED, ...questionFields(n), phase: "idle" });
  });
}

export async function gotoQuestion(gameId: string, round: number, index: number): Promise<Result> {
  return run(async () => {
    const q = findQuestion(round, index);
    if (!q) throw new Error("Ukendt spørgsmål");
    await patchState(gameId, { ...CLEARED, ...questionFields(q), phase: "idle" });
  });
}

export async function mediaCommand(gameId: string, cmd: MediaCommand): Promise<Result> {
  return run(async () => {
    await patchState(gameId, { media_command: cmd, media_command_at: new Date().toISOString() });
  });
}

// ───────────── scoring ─────────────

export async function setScore(gameId: string, teamId: string, qKey: string, points: number): Promise<Result> {
  return run(async () => {
    const m = /^r(\d{1,2})-q(\d{1,2})$/.exec(qKey);
    const q = m ? findQuestion(Number(m[1]), Number(m[2])) : null;
    if (!q) throw new Error("Ugyldigt spørgsmål");
    const allowed = [0, 1, 2, 3].map((p) => p * q.pointMultiplier);
    if (!allowed.includes(points)) throw new Error(`Point skal være ${allowed.join("/")}`);
    must(
      await getAdminSupabase()
        .from("scores")
        .upsert(
          { game_id: gameId, team_id: teamId, question_key: qKey, points, updated_at: new Date().toISOString() },
          { onConflict: "team_id,question_key" },
        ),
    );
  });
}

/** Remove all drawings for the current question (e.g. to re-run it). */
export async function clearAnswers(gameId: string): Promise<Result> {
  return run(async () => {
    const sb = getAdminSupabase();
    const { q } = await currentQuestion(gameId);
    const key = questionKey(q.round, q.index);
    const { data } = must(await sb.from("answers").select("image_path").eq("game_id", gameId).eq("question_key", key));
    if (data.length) await sb.storage.from("answers").remove(data.map((a) => a.image_path));
    must(await sb.from("answers").delete().eq("game_id", gameId).eq("question_key", key));
    await patchState(gameId, {}); // bump updated_at → clients refetch answers
  });
}

// ───────────── demo mode ─────────────

/** Upload a dummy drawing (generated in the admin browser) on behalf of a demo team. */
export async function demoSubmit(
  gameId: string,
  teamId: string,
  qKey: string,
  dataUrl: string,
  scaleValue: number | null = null,
): Promise<Result> {
  return run(async () => {
    const sb = getAdminSupabase();
    const { data: team } = must(
      await sb.from("teams").select("id, is_demo, game_id").eq("id", teamId).single(),
    );
    if (!team.is_demo || team.game_id !== gameId) throw new Error("Kun demo-hold");
    const m = /^data:image\/png;base64,(.+)$/.exec(dataUrl);
    if (!m) throw new Error("Ugyldigt billede");
    const bytes = Buffer.from(m[1], "base64");
    if (bytes.length > 1_500_000) throw new Error("Billedet er for stort");
    const path = answerPath(gameId, qKey, teamId);
    must(await sb.storage.from("answers").upload(path, bytes, { contentType: "image/png", upsert: true }));
    must(
      await sb
        .from("answers")
        .upsert(
          {
            game_id: gameId,
            team_id: teamId,
            question_key: qKey,
            image_path: path,
            scale_value: Number.isFinite(scaleValue) ? scaleValue : null,
            submitted_at: new Date().toISOString(),
          },
          { onConflict: "team_id,question_key" },
        ),
    );
  });
}
