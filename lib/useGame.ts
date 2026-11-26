"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSupabase } from "./supabase/browser";
import { TEAM_COLUMNS, type Answer, type Game, type GameState, type Score, type Team } from "./types";

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
 * Live view of one game: state, teams, answers for the current question, all scores.
 * Initial fetch + Supabase Realtime postgres_changes; full refetch on (re)subscribe and tab focus.
 */
export function useGame(gameId: string | null | undefined) {
  const [state, setState] = useState<GameState | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [connected, setConnected] = useState(false);
  const qKeyRef = useRef<string | null>(null);

  const loadAnswers = useCallback(
    async (qKey: string | null) => {
      if (!gameId || !qKey) return setAnswers([]);
      const { data } = await getSupabase()
        .from("answers")
        .select("*")
        .eq("game_id", gameId)
        .eq("question_key", qKey);
      if (qKeyRef.current === qKey) setAnswers((data as Answer[]) ?? []);
    },
    [gameId],
  );

  const loadAll = useCallback(async () => {
    if (!gameId) return;
    const sb = getSupabase();
    const [s, t, sc] = await Promise.all([
      sb.from("game_state").select("*").eq("game_id", gameId).maybeSingle(),
      sb.from("teams").select(TEAM_COLUMNS).eq("game_id", gameId).order("slot"),
      sb.from("scores").select("game_id, team_id, question_key, points").eq("game_id", gameId),
    ]);
    const gs = (s.data as GameState) ?? null;
    setState(gs);
    setTeams((t.data as Team[]) ?? []);
    setScores((sc.data as Score[]) ?? []);
    qKeyRef.current = gs?.question_key ?? null;
    await loadAnswers(gs?.question_key ?? null);
  }, [gameId, loadAnswers]);

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
        // Question changed or state touched → refresh answers for the (new) current question.
        qKeyRef.current = gs.question_key;
        loadAnswers(gs.question_key);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "teams", filter }, (p) => {
        const t = p.new as Team;
        if (!t?.id) return;
        setTeams((prev) => [...prev.filter((x) => x.id !== t.id), t].sort((a, b) => a.slot - b.slot));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "answers", filter }, (p) => {
        const a = p.new as Answer;
        if (a.question_key !== qKeyRef.current) return;
        setAnswers((prev) => [...prev.filter((x) => x.team_id !== a.team_id), a]);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "scores", filter }, (p) => {
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
  }, [gameId, loadAll, loadAnswers]);

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

  return { ...cur, totals, connected: connected && !!gameId, reload: loadAll };
}

/** Teams that have joined, ranked by total points (desc), ties by slot. */
export function rankTeams(teams: Team[], totals: Map<string, number>) {
  return teams
    .filter((t) => t.name)
    .map((t) => ({ ...t, total: totals.get(t.id) ?? 0 }))
    .sort((a, b) => b.total - a.total || a.slot - b.slot);
}
