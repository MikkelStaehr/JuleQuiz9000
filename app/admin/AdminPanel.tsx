"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RoundLabel, Wordmark } from "@/components/Brand";
import { TimerRing } from "@/components/TimerRing";
import { META } from "@/lib/answerTypes/meta";
import { REGISTRY } from "@/lib/answerTypes/registry";
import type { Question, ScoreResult } from "@/lib/answerTypes/types";
import { serverNow, useClockSync } from "@/lib/clock";
import { standings, useActiveGame, useGame } from "@/lib/useGame";
import { multiplierLabel, signed, teamColor, type AnswerValue, type Game, type Phase, type TeamWithCode } from "@/lib/types";
import * as A from "./actions";
import { demoAnswer } from "./demo";

const PHASE_LABEL: Record<Phase, string> = {
  idle: "Klar",
  question: "Spørgsmål vises",
  countdown: "Timer kører",
  locked: "Låst",
  reveal: "Svar vises",
  scoreboard: "Scoreboard",
  finished: "Slut",
};

type Act = (fn: () => Promise<{ ok: boolean; error?: string }>) => void;

export function AdminPanel({ quiz, initialGame, teamCodes }: { quiz: Question[]; initialGame: Game | null; teamCodes: TeamWithCode[] }) {
  useClockSync();
  const router = useRouter();
  const { game: liveGame, loaded } = useActiveGame();
  const game = loaded ? liveGame : initialGame;
  const gameId = game?.id ?? null;
  const { state, teams, answers, scores, totals, scoreFor, connected } = useGame(gameId);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (gameId && teamCodes[0]?.game_id !== gameId) router.refresh();
  }, [gameId, teamCodes, router]);
  const codeById = useMemo(() => new Map(teamCodes.map((t) => [t.id, t.join_code])), [teamCodes]);

  const act: Act = useCallback(
    (fn) =>
      startTransition(async () => {
        setError(null);
        const r = await fn();
        if (!r.ok) setError(r.error ?? "Ukendt fejl");
      }),
    [],
  );

  const qKey = state?.question_key ?? "";
  const q = quiz.find((x) => x.key === qKey) ?? null;
  const qi = q ? quiz.indexOf(q) : -1;
  const nextQ = qi >= 0 ? quiz[qi + 1] : null;
  const phase = state?.phase ?? "idle";
  const joined = teams.filter((t) => t.name);

  // ── live answer values (server-side read; clients can't see them) ──
  const [live, setLive] = useState<{ key: string; rows: AnswerValue[] }>({ key: "", rows: [] });
  const answersSig = answers.map((a) => `${a.team_id}@${a.submitted_at}`).join("|");
  const loadLive = useCallback(async () => {
    if (!gameId) return;
    const r = await A.getLiveAnswers(gameId);
    if (r.ok) setLive({ key: qKey, rows: r.data ?? [] });
  }, [gameId, qKey]);
  useEffect(() => {
    const id = setTimeout(loadLive, 0);
    return () => clearTimeout(id);
  }, [loadLive, answersSig, phase, state?.updated_at]);
  const liveRows = live.key === qKey ? live.rows : [];

  // ── auto-lock when the timer runs out ──
  const lockedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!gameId || phase !== "countdown" || !state?.timer_ends_at) return;
    const tag = `${qKey}@${state.timer_ends_at}`;
    const ms = Date.parse(state.timer_ends_at) - serverNow();
    const id = setTimeout(() => {
      if (lockedFor.current === tag) return;
      lockedFor.current = tag;
      A.lockNow(gameId);
    }, Math.max(0, ms + 150));
    return () => clearTimeout(id);
  }, [gameId, phase, state?.timer_ends_at, qKey]);

  // ── demo: the simulated teams answer (and sometimes change their mind) ──
  const demoDone = useRef(new Set<string>());
  useEffect(() => {
    if (!game?.is_demo || !gameId || !state || !q) return;
    if (phase !== "countdown" && phase !== "locked") return;
    const demoTeams = teams.filter((t) => t.is_demo);
    const left = state.timer_ends_at ? Math.max(0, Date.parse(state.timer_ends_at) - serverNow()) : 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const send = (teamIdx: number, tag: string) => {
      const t = demoTeams[teamIdx];
      const skill = [0.85, 0.6, 0.4, 0.2][teamIdx % 4];
      const d = demoAnswer(q, skill);
      A.demoSubmit(gameId, t.id, d.value, d.wager, d.png ?? null).then((r) => {
        if (!r.ok) {
          demoDone.current.delete(tag);
          setError(`Demo: ${r.error}`);
        }
      });
    };
    demoTeams.forEach((t, i) => {
      const tag = `${qKey}:${t.id}`;
      if (demoDone.current.has(tag)) return;
      // drawings are uploaded at lock; the others answer during the countdown
      if (REGISTRY[q.answerType].submitOnLock && phase !== "locked") return;
      const delay = phase === "locked" ? 300 + i * 400 : left * rand(0.15, 0.75);
      timers.push(
        setTimeout(() => {
          if (demoDone.current.has(tag)) return;
          demoDone.current.add(tag);
          send(i, tag);
          // one team changes its answer later ("last value wins")
          if (i === 1 && phase === "countdown" && !REGISTRY[q.answerType].submitOnLock)
            timers.push(setTimeout(() => send(i, tag), left * 0.15));
        }, delay),
      );
    });
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.is_demo, gameId, phase, qKey, teams.length, state?.timer_ends_at]);

  if (!game) return <Setup act={act} pending={pending} error={error} />;

  const answeredIds = new Set(answers.map((a) => a.team_id));
  const steps = q && phase === "reveal" ? META[q.answerType].revealSteps(state?.reveal_payload ?? null) : 1;
  const step = state?.reveal_step ?? 0;
  const moreSteps = phase === "reveal" && step < steps;

  const can = {
    show: phase === "idle" || phase === "question",
    start: phase === "idle" || phase === "question",
    lock: phase === "countdown",
    reveal: phase === "locked" || phase === "scoreboard" || phase === "countdown",
    next: phase !== "countdown" && phase !== "finished",
    board: phase !== "countdown",
  };
  const lastOfRound = !!q && (!nextQ || nextQ.round !== q.round);
  const primary: Record<Phase, string> = {
    idle: "show",
    question: "start",
    countdown: "lock",
    locked: "reveal",
    reveal: moreSteps ? "next" : lastOfRound ? "board" : "next",
    scoreboard: "next",
    finished: "board",
  };
  const btn = (id: keyof typeof can) => `btn h-14 text-base ${primary[phase] === id ? "btn-gold" : "btn-ghost"}`;
  const AdminView = q ? REGISTRY[q.answerType].AdminView : null;

  return (
    <main className="mx-auto max-w-[1500px] p-4 sm:p-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <Wordmark size="sm" />
          <span className="rounded-full border border-gold/30 px-3 py-1 text-xs text-gold-soft">{game.is_demo ? "DEMO-MODE" : "Live"}</span>
          <span className="flex items-center gap-1.5 text-xs text-cream/60">
            <span className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-400" : "animate-pulse bg-alarm"}`} />
            {connected ? "Realtime forbundet" : "Forbinder…"}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <a className="btn btn-ghost" href="/display" target="_blank" rel="noreferrer">Storskærm ↗</a>
          <a className="btn btn-ghost" href="/play" target="_blank" rel="noreferrer">Hold-skærm ↗</a>
          <button className="btn btn-ghost" onClick={() => A.logout()}>Log ud</button>
        </div>
      </header>

      {error && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-alarm/40 bg-alarm/10 px-4 py-3 text-sm text-[#ffc9ca]">
          {error}
          <button onClick={() => setError(null)} className="text-xs underline">luk</button>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.05fr_1fr]">
        {/* ───────── left: question + controls ───────── */}
        <section className="space-y-5">
          <div className="card-dark p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              {state && (
                <RoundLabel round={state.current_round} totalRounds={state.total_rounds} index={state.current_index} roundSize={state.round_size} className="text-xs" />
              )}
              <span className="rounded-full bg-gold/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-gold">
                {PHASE_LABEL[phase]}
                {phase === "reveal" && ` · trin ${step}/${steps}`}
              </span>
            </div>
            {phase === "finished" ? (
              <p className="py-8 text-center font-display text-4xl">Quizzen er slut 🎄</p>
            ) : q ? (
              <div className="flex gap-5">
                <div className="min-w-0 flex-1 space-y-3">
                  <p className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-widest text-cream/50">
                    {q.roundTitle} · {META[q.answerType].label}
                    {q.scoring && ` (${q.scoring})`}
                    {q.pointMultiplier > 1 && (
                      <span className="rounded-full bg-gold px-2 py-0.5 font-bold text-ink">{multiplierLabel(q.pointMultiplier)}</span>
                    )}
                  </p>
                  <p className="font-display text-3xl leading-tight">{q.text}</p>
                  <div className="rounded-xl border border-gold/40 bg-gold/10 px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-gold">Facit · kun quizmaster</p>
                    <p className="mt-1 text-xl font-semibold text-gold-soft">{META[q.answerType].answerText(q)}</p>
                  </div>
                  <p className="text-xs text-cream/50">
                    Timer {q.timerSeconds} s · {pointsRule(q)}
                  </p>
                </div>
                {phase === "countdown" || phase === "locked" ? (
                  <TimerRing endsAt={state!.timer_ends_at} totalSeconds={state!.timer_seconds} size="130px" />
                ) : (
                  q.mediaType === "image" &&
                  q.mediaUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={q.mediaUrl} alt="" className="h-32 w-44 rounded-lg object-contain ring-1 ring-gold/20" />
                  )
                )}
              </div>
            ) : (
              <p className="text-cream/60">Spørgsmål “{qKey}” findes ikke i quiz.json</p>
            )}
          </div>

          <div className="card-dark grid grid-cols-2 gap-3 p-5 sm:grid-cols-3">
            <button className={btn("show")} disabled={pending || !can.show} onClick={() => act(() => A.showQuestion(game.id))}>Vis spørgsmål</button>
            <button className={btn("start")} disabled={pending || !can.start} onClick={() => act(() => A.startTimer(game.id))}>Start timer</button>
            <button className={btn("lock")} disabled={pending || !can.lock} onClick={() => act(() => A.lockNow(game.id))}>Lås nu</button>
            <button className={btn("reveal")} disabled={pending || !can.reveal} onClick={() => act(() => A.reveal(game.id))}>Vis svar</button>
            <button
              className={btn("next")}
              disabled={pending || !can.next}
              onClick={() => act(() => (moreSteps ? A.advanceReveal(game.id) : A.next(game.id)))}
            >
              {moreSteps ? `Næste trin (${step + 1}/${steps})` : "Næste"}
            </button>
            <button className={btn("board")} disabled={pending || !can.board} onClick={() => act(() => A.showScoreboard(game.id))}>Scoreboard</button>
            {state && (state.media_type === "audio" || state.media_type === "video") && <MediaControls gameId={game.id} state={state} act={act} />}
          </div>

          {nextQ && (
            <div className="card-dark p-5 text-sm">
              <p className="mb-1 text-xs uppercase tracking-widest text-cream/50">
                Næste · R{nextQ.round} S{nextQ.index} {nextQ.round !== q?.round && `· ny runde: ${nextQ.roundTitle}`}
              </p>
              <p className="text-cream/90">{nextQ.text}</p>
              <p className="mt-1 text-gold/80">Facit: {META[nextQ.answerType].answerText(nextQ)}</p>
            </div>
          )}

          <div className="card-dark flex flex-wrap items-center gap-3 p-5 text-sm">
            <label className="flex items-center gap-2">
              <span className="text-cream/60">Hop til</span>
              <select
                className="field w-auto py-2"
                value={qKey}
                onChange={(e) => act(() => A.gotoQuestion(game.id, e.target.value))}
                disabled={pending || phase === "countdown"}
              >
                {quiz.map((x) => (
                  <option key={x.key} value={x.key}>
                    R{x.round} S{x.index} – {x.text.slice(0, 50)}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="btn btn-ghost"
              disabled={pending || phase === "countdown"}
              onClick={() => {
                if (!window.confirm("Slet alle svar (og beregnede point) for dette spørgsmål?")) return;
                demoDone.current.clear();
                act(() => A.clearAnswers(game.id));
              }}
            >
              Ryd svar for spørgsmålet
            </button>
            <button
              className="btn btn-danger ml-auto"
              disabled={pending}
              onClick={() => window.confirm("Afslut spillet? Storskærm og hold kobles af.") && act(() => A.endGame(game.id))}
            >
              Afslut spil
            </button>
          </div>
        </section>

        {/* ───────── right: teams, live answers, points ───────── */}
        <section className="space-y-5">
          <div className="card-dark p-5">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="font-display text-2xl">Hold</h2>
              <span className="text-xs text-cream/50">
                {answers.length}/{joined.length} har svaret
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {teams.map((t) => (
                <span
                  key={t.id}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm ${answeredIds.has(t.id) ? "bg-gold text-ink" : "border border-gold/25"}`}
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: teamColor(t.slot) }} />
                  {t.name ?? <span className="text-cream/40">ledig plads</span>}
                  {!t.is_demo && <span className="tabular font-mono text-xs font-bold tracking-widest opacity-70">{codeById.get(t.id) ?? "····"}</span>}
                  {answeredIds.has(t.id) && "✓"}
                </span>
              ))}
            </div>
          </div>

          {q && AdminView && (
            <div className="card-dark p-5">
              <h2 className="mb-3 font-display text-2xl">Svar · live</h2>
              <AdminView
                q={q}
                teams={joined}
                answers={liveRows}
                scoreFor={(id) => scoreFor(id, qKey)}
                pending={pending}
                onJudge={(teamId, j) =>
                  act(async () => {
                    const r = await A.judgeAnswer(game.id, teamId, j);
                    loadLive();
                    return r;
                  })
                }
              />
            </div>
          )}

          {q && <PointsPanel q={q} gameId={game.id} teams={joined} scoreFor={(id) => scoreFor(id, qKey)} totals={totals} act={act} pending={pending} />}

          <ScoreMatrix
            quiz={quiz}
            upto={qi}
            teams={joined}
            scores={scores}
            totals={totals}
            onSet={(teamId, key, p) => act(() => A.setScore(game.id, teamId, key, p))}
          />

          <div className="card-dark p-5 text-sm">
            <h2 className="mb-2 font-display text-2xl">Stilling</h2>
            <ol className="space-y-1">
              {standings(teams, scores, state?.current_round).map((s) => (
                <li key={s.id} className="flex items-center gap-2">
                  <span className="tabular w-6 font-bold text-gold">{s.rank}</span>
                  <span className="flex-1 truncate">{s.name}</span>
                  <span className="tabular font-semibold">{s.total} p</span>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </div>
    </main>
  );
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

function pointsRule(q: Question) {
  const m = q.pointMultiplier > 1 ? ` × ${q.pointMultiplier}` : "";
  if (q.answerType === "true-false") return q.wagerEnabled ? `±satsning (1–3)${m}` : `rigtigt = ${q.pointsCorrect}${m}`;
  if (q.answerType === "geo" || q.scoring === "closest") return `tættest: ${q.pointsByRank.join("/")}${m}`;
  if (q.scoring === "manual-parts") return `${q.pointsCorrect} pr. del (${q.parts.join(", ")})${m}`;
  return `manuelt ${q.manualPoints.join("/")}${m}`;
}

function MediaControls({ gameId, state, act }: { gameId: string; state: { media_command: string; media_type: string }; act: Act }) {
  const [from, setFrom] = useState("30");
  return (
    <div className="col-span-full mt-1 flex flex-wrap items-center gap-2 border-t border-gold/15 pt-4">
      <span className="mr-1 text-xs uppercase tracking-widest text-cream/50">{state.media_type === "audio" ? "Lyd" : "Video"} på storskærm</span>
      <button className="btn btn-ghost" onClick={() => act(() => A.mediaCommand(gameId, "play"))}>▶ Afspil</button>
      <button className="btn btn-ghost" onClick={() => act(() => A.mediaCommand(gameId, "pause"))}>❚❚ Pause</button>
      <button className="btn btn-ghost" onClick={() => act(() => A.mediaCommand(gameId, "play", 0))}>⟲ Genstart</button>
      <button className="btn btn-ghost" onClick={() => act(() => A.mediaCommand(gameId, "stop"))}>■ Stop</button>
      <span className="flex items-center gap-1">
        <input value={from} onChange={(e) => setFrom(e.target.value.replace(/[^\d.,]/g, ""))} className="field w-16 px-2 py-2 text-center" inputMode="decimal" aria-label="Sekund" />
        <button className="btn btn-ghost" onClick={() => act(() => A.mediaCommand(gameId, "play", Number(from.replace(",", ".")) || 0))}>
          Afspil fra sek.
        </button>
      </span>
      <span className="text-xs text-cream/50">Status: {state.media_command === "play" ? "spiller" : state.media_command === "pause" ? "pauset" : "stoppet"}</span>
    </div>
  );
}

function PointsPanel({
  q,
  gameId,
  teams,
  scoreFor,
  totals,
  act,
  pending,
}: {
  q: Question;
  gameId: string;
  teams: { id: string; name: string | null; slot: number }[];
  scoreFor: (id: string) => { points: number; source: string } | undefined;
  totals: Map<string, number>;
  act: Act;
  pending: boolean;
}) {
  const [proposal, setProposal] = useState<{ key: string; rows: ScoreResult[] } | null>(null);
  const rows = proposal?.key === q.key ? proposal.rows : null;
  const quick = q.answerType === "true-false" && q.wagerEnabled ? [-3, -2, -1, 0, 1, 2, 3] : q.answerType === "draw" && q.scoring === "manual" ? q.manualPoints : [0, 1, 2, 3];
  const SRC: Record<string, string> = { auto: "auto", approved: "godkendt", manual: "rettet" };
  return (
    <div className="card-dark p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-2xl">Point · dette spørgsmål</h2>
        <div className="flex gap-2">
          <button
            className="btn btn-ghost"
            disabled={pending}
            onClick={() =>
              act(async () => {
                const r = await A.proposeScores(gameId);
                if (r.ok) setProposal({ key: q.key, rows: r.data ?? [] });
                return r;
              })
            }
          >
            Beregn point
          </button>
          {rows && (
            <button className="btn btn-gold" disabled={pending} onClick={() => act(async () => { const r = await A.approveScores(gameId); if (r.ok) setProposal(null); return r; })}>
              Godkend
            </button>
          )}
        </div>
      </div>
      <ul className="divide-y divide-gold/10 text-sm">
        {teams.map((t) => {
          const s = scoreFor(t.id);
          const prop = rows?.find((r) => r.teamId === t.id);
          return (
            <li key={t.id} className="flex flex-wrap items-center gap-2 py-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: teamColor(t.slot) }} />
              <span className="min-w-24 flex-1 truncate font-semibold">{t.name}</span>
              {prop && (
                <span className={`tabular rounded-md px-2 py-0.5 text-xs ${prop.points !== s?.points ? "bg-gold/20 text-gold" : "text-cream/40"}`}>
                  forslag {signed(prop.points)}
                  {prop.rank ? ` (nr. ${prop.rank})` : ""}
                </span>
              )}
              <span className="tabular w-10 text-right text-base font-bold">{s ? signed(s.points) : "–"}</span>
              <span className="w-14 text-[10px] uppercase text-cream/40">{s ? SRC[s.source] : ""}</span>
              <span className="flex gap-1">
                {quick.map((p) => {
                  const v = p * (q.answerType === "draw" && q.scoring === "manual" ? 1 : q.pointMultiplier);
                  return (
                    <button
                      key={p}
                      disabled={pending}
                      onClick={() => act(() => A.setScore(gameId, t.id, q.key, v))}
                      className={`h-8 min-w-8 rounded-md px-1.5 text-xs font-bold ${s?.points === v ? "bg-gold text-ink" : "border border-gold/25 text-gold-soft hover:border-gold/60"}`}
                    >
                      {signed(v)}
                    </button>
                  );
                })}
              </span>
              <span className="tabular w-12 text-right text-xs text-cream/50">{totals.get(t.id) ?? 0} i alt</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-cream/40">Point beregnes automatisk ved lås og ved “Vis svar”. Knapperne overskriver (“rettet”) og bliver aldrig overskrevet automatisk.</p>
    </div>
  );
}

function Setup({ act, pending, error }: { act: Act; pending: boolean; error: string | null }) {
  const [n, setN] = useState(6);
  const [extra, setExtra] = useState(1);
  return (
    <main className="mx-auto grid min-h-screen max-w-4xl content-center gap-6 p-6">
      <Wordmark />
      <div className="hairline" />
      {error && <p className="rounded-xl border border-alarm/40 bg-alarm/10 px-4 py-3 text-sm">{error}</p>}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="card-dark space-y-4 p-6">
          <h2 className="font-display text-3xl">Nyt spil</h2>
          <p className="text-sm text-cream/60">Der genereres en 4-cifret kode pr. hold.</p>
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <button key={i} onClick={() => setN(i)} className={`h-11 w-11 rounded-lg font-bold ${n === i ? "bg-gold text-ink" : "border border-gold/30 text-gold-soft"}`}>
                {i}
              </button>
            ))}
          </div>
          <button className="btn btn-gold w-full py-3" disabled={pending} onClick={() => act(() => A.createGame(n, false))}>
            Opret spil med {n} hold
          </button>
        </div>
        <div className="card-dark space-y-4 p-6">
          <h2 className="font-display text-3xl">Demo-mode</h2>
          <p className="text-sm text-cream/60">
            4 simulerede hold svarer automatisk (tegninger, kortnåle og sandt/falsk) – plus valgfrie rigtige pladser, så du også kan teste /play.
          </p>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-cream/60">Ekstra rigtige hold:</span>
            {[0, 1, 2, 3, 4].map((i) => (
              <button key={i} onClick={() => setExtra(i)} className={`h-9 w-9 rounded-lg font-bold ${extra === i ? "bg-gold text-ink" : "border border-gold/30 text-gold-soft"}`}>
                {i}
              </button>
            ))}
          </div>
          <button className="btn btn-ghost w-full py-3" disabled={pending} onClick={() => act(() => A.createGame(extra, true))}>
            Start demo
          </button>
        </div>
      </div>
      <p className="text-center text-xs text-cream/40">Et nyt spil afslutter automatisk det aktive spil.</p>
    </main>
  );
}

function ScoreMatrix({
  quiz,
  upto,
  teams,
  scores,
  totals,
  onSet,
}: {
  quiz: Question[];
  upto: number;
  teams: { id: string; name: string | null }[];
  scores: { team_id: string; question_key: string; points: number }[];
  totals: Map<string, number>;
  onSet: (teamId: string, key: string, p: number) => void;
}) {
  const cols = quiz.slice(0, Math.max(1, upto + 1));
  return (
    <details className="card-dark p-5">
      <summary className="cursor-pointer font-display text-2xl">Pointtabel · ret point bagefter</summary>
      <div className="mt-4 overflow-x-auto">
        <table className="text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 bg-pine-900 pr-3 text-left font-semibold text-cream/60">Hold</th>
              {cols.map((x) => (
                <th key={x.key} className={`px-0.5 font-normal ${x.pointMultiplier > 1 ? "text-gold" : "text-cream/50"}`} title={x.text}>
                  {x.round}.{x.index}
                </th>
              ))}
              <th className="pl-3 text-right text-gold">Σ</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((t) => (
              <tr key={t.id}>
                <td className="sticky left-0 max-w-[9rem] truncate bg-pine-900 py-1 pr-3 font-semibold">{t.name}</td>
                {cols.map((x) => {
                  const v = scores.find((s) => s.team_id === t.id && s.question_key === x.key)?.points;
                  return (
                    <td key={x.key} className="px-0.5">
                      <input
                        key={`${t.id}-${x.key}-${v ?? ""}`}
                        defaultValue={v ?? ""}
                        inputMode="numeric"
                        aria-label={`${t.name} ${x.key}`}
                        onBlur={(e) => {
                          const raw = e.target.value.trim();
                          if (raw === "" || raw === String(v ?? "")) return;
                          const n = Number(raw.replace("−", "-"));
                          if (Number.isInteger(n)) onSet(t.id, x.key, n);
                        }}
                        className={`tabular h-7 w-9 rounded text-center ${v ? "bg-gold/25 text-gold-soft" : "bg-pine-950/70 text-cream/50"}`}
                      />
                    </td>
                  );
                })}
                <td className="tabular pl-3 text-right text-sm font-bold text-gold">{totals.get(t.id) ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
