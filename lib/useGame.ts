"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSupabase } from "./supabase/browser";
import {
  ANSWER_COLUMNS,
  SCORE_COLUMNS,
  TEAM_COLUMNS,
  type AnswerStatus,
  type AnswerValue,
  type Game,
  type GameState,
  type Score,
  type Team,
} from "./types";

/** The currently active game (newest), kept live. Used by /display and /admin. */
export function useActiveGame() {
  const [game, setGame] = useState<Game | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const { data } = await getSupabase()
      .from("games")
      .select("*")
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setGame((data as Game) ?? null);
    setLoaded(true);
  }, []);

  useEffect(() => {
    // initial load happens on SUBSCRIBED (and again after every reconnect)
    const ch = getSupabase()
      .channel("games-watch")
      .on("postgres_changes", { event: "*", schema: "public", table: "games" }, () => load())
      .subscribe((status) => {
        if (status === "SUBSCRIBED") load();
      });
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      getSupabase().removeChannel(ch);
    };
  }, [load]);

  return { game, loaded, reload: load };
}

/**
 * Live view of one game: state, teams, answer *status* for the current question, all scores.
 * Initial fetch + Realtime postgres_changes; full refetch on (re)subscribe and tab focus.
 */
export function useGame(gameId: string | null | undefined) {
  const [state, setState] = useState<GameState | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [answers, setAnswers] = useState<AnswerStatus[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [connected, setConnected] = useState(false);
  const qKeyRef = useRef<string | null>(null);

  const loadAnswers = useCallback(
    async (qKey: string | null) => {
      if (!gameId || !qKey) return setAnswers([]);
      const { data } = await getSupabase()
        .from("answers")
        .select(ANSWER_COLUMNS)
        .eq("game_id", gameId)
        .eq("question_key", qKey);
      if (qKeyRef.current === qKey) setAnswers((data as AnswerStatus[]) ?? []);
    },
    [gameId],
  );

  const loadScores = useCallback(async () => {
    if (!gameId) return;
    const { data } = await getSupabase().from("scores").select(SCORE_COLUMNS).eq("game_id", gameId);
    setScores((data as Score[]) ?? []);
  }, [gameId]);

  const loadAll = useCallback(async () => {
    if (!gameId) return;
    const sb = getSupabase();
    const [s, t] = await Promise.all([
      sb.from("game_state").select("*").eq("game_id", gameId).maybeSingle(),
      sb.from("teams").select(TEAM_COLUMNS).eq("game_id", gameId).order("slot"),
    ]);
    const gs = (s.data as GameState) ?? null;
    setState(gs);
    setTeams((t.data as Team[]) ?? []);
    qKeyRef.current = gs?.question_key ?? null;
    await Promise.all([loadAnswers(gs?.question_key ?? null), loadScores()]);
  }, [gameId, loadAnswers, loadScores]);

  useEffect(() => {
    if (!gameId) return;
    const sb = getSupabase();
    const filter = `game_id=eq.${gameId}`;
    const ch = sb
      .channel(`game-${gameId}-${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "game_state", filter }, (p) => {
        const gs = p.new as GameState;
        if (!gs || !gs.game_id) return;
        setState(gs);
        qKeyRef.current = gs.question_key;
        loadAnswers(gs.question_key); // question changed / answers cleared
        loadScores(); // filtered DELETE events aren't delivered by Realtime → refetch on every state change
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "teams", filter }, (p) => {
        const t = p.new as Team;
        if (!t?.id) return;
        setTeams((prev) => [...prev.filter((x) => x.id !== t.id), t].sort((a, b) => a.slot - b.slot));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "answers", filter }, (p) => {
        const a = p.new as AnswerStatus;
        if (!a?.team_id || a.question_key !== qKeyRef.current) return;
        setAnswers((prev) => [...prev.filter((x) => x.team_id !== a.team_id), a]);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "scores", filter }, (p) => {
        if (p.eventType === "DELETE") return void loadScores();
        const s = p.new as Score;
        if (!s?.team_id) return;
        setScores((prev) => [
          ...prev.filter((x) => !(x.team_id === s.team_id && x.question_key === s.question_key)),
          s,
        ]);
      })
      .subscribe((status) => {
        setConnected(status === "SUBSCRIBED");
        if (status === "SUBSCRIBED") loadAll();
      });

    const onVis = () => document.visibilityState === "visible" && loadAll();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      sb.removeChannel(ch);
    };
  }, [gameId, loadAll, loadAnswers, loadScores]);

  // Never expose data from a previous game while switching.
  const cur = useMemo(
    () => ({
      state: state && state.game_id === gameId ? state : null,
      teams: teams.filter((t) => t.game_id === gameId),
      answers: answers.filter((a) => a.game_id === gameId),
      scores: scores.filter((s) => s.game_id === gameId),
    }),
    [state, teams, answers, scores, gameId],
  );

  const totals = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of cur.scores) m.set(s.team_id, (m.get(s.team_id) ?? 0) + s.points);
    return m;
  }, [cur.scores]);

  const scoreFor = useCallback(
    (teamId: string, key: string) => cur.scores.find((s) => s.team_id === teamId && s.question_key === key),
    [cur.scores],
  );

  return { ...cur, totals, scoreFor, connected: connected && !!gameId, reload: loadAll };
}

/** Answer values for the current question – only available once revealed (RPC revealed_answers). */
export function useRevealedAnswers(gameId: string | null | undefined, enabled: boolean, qKey: string | null, version: string) {
  const [rows, setRows] = useState<{ key: string | null; data: AnswerValue[] }>({ key: null, data: [] });
  useEffect(() => {
    if (!gameId || !enabled) return;
    let cancelled = false;
    getSupabase()
      .rpc("revealed_answers", { p_game: gameId })
      .then(({ data }) => {
        if (!cancelled) setRows({ key: qKey, data: (data as AnswerValue[]) ?? [] });
      });
    return () => {
      cancelled = true;
    };
  }, [gameId, enabled, qKey, version]);
  return enabled && rows.key === qKey ? rows.data : [];
}

export interface Standing extends Team {
  total: number;
  rank: number;
  prevRank: number | null;
}

/** Competition ranking (ties share). prevRank = ranking on scores from rounds before `currentRound`. */
export function standings(
  teams: Team[],
  scores: { team_id: string; points: number; round: number | null }[],
  currentRound?: number,
): Standing[] {
  const joined = teams.filter((t) => t.name);
  const sum = (pred: (s: { round: number | null }) => boolean) => {
    const m = new Map<string, number>();
    for (const s of scores) if (pred(s)) m.set(s.team_id, (m.get(s.team_id) ?? 0) + s.points);
    return m;
  };
  const rankOf = (totals: Map<string, number>) => {
    const list = joined.map((t) => totals.get(t.id) ?? 0);
    return (id: string) => list.filter((x) => x > (totals.get(id) ?? 0)).length + 1;
  };
  const now = sum(() => true);
  const rankNow = rankOf(now);
  const hasPrev = currentRound !== undefined && scores.some((s) => s.round !== null && s.round < currentRound);
  const rankPrev = hasPrev ? rankOf(sum((s) => s.round !== null && s.round < currentRound!)) : null;
  return joined
    .map((t) => ({ ...t, total: now.get(t.id) ?? 0, rank: rankNow(t.id), prevRank: rankPrev ? rankPrev(t.id) : null }))
    .sort((a, b) => a.rank - b.rank || a.slot - b.slot);
}
