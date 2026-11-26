"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RoundLabel, Wordmark } from "@/components/Brand";
import { TimerRing } from "@/components/TimerRing";
import { serverNow, useClockSync } from "@/lib/clock";
import { publicImageUrl } from "@/lib/supabase/browser";
import { useActiveGame, useGame } from "@/lib/useGame";
import {
  formatScaleValue,
  multiplierLabel,
  questionKey,
  teamColor,
  type Game,
  type Phase,
  type QuizQuestion,
  type Scale,
  type TeamWithCode,
} from "@/lib/types";
import * as A from "./actions";
import { dummyDrawing, dummyScaleDrawing } from "./demo";

const qScale = (q: QuizQuestion | null | undefined): Scale | null =>
  q && q.canvasBackground === "scale" && q.scaleMin !== null && q.scaleMax !== null
    ? { min: q.scaleMin, max: q.scaleMax, unit: q.unit ?? "" }
    : null;

const PHASE_LABEL: Record<Phase, string> = {
  idle: "Klar",
  question: "Spørgsmål vises",
  countdown: "Timer kører",
  locked: "Låst",
  reveal: "Svar vises",
  scoreboard: "Scoreboard",
  finished: "Slut",
};

export function AdminPanel({
  quiz,
  initialGame,
  teamCodes,
}: {
  quiz: QuizQuestion[];
  initialGame: Game | null;
  teamCodes: TeamWithCode[];
}) {
  useClockSync();
  const router = useRouter();
  const { game: liveGame, loaded } = useActiveGame();
  const game = loaded ? liveGame : initialGame;
  const gameId = game?.id ?? null;
  const { state, teams, answers, scores, totals, connected } = useGame(gameId);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Codes come from the server render; refresh if the active game changed.
  useEffect(() => {
    if (gameId && teamCodes[0]?.game_id !== gameId) router.refresh();
  }, [gameId, teamCodes, router]);
  const codeById = useMemo(() => new Map(teamCodes.map((t) => [t.id, t.join_code])), [teamCodes]);

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Ukendt fejl");
    });

  const q = state ? quiz.find((x) => x.round === state.current_round && x.index === state.current_index) : null;
  const qi = q ? quiz.indexOf(q) : -1;
  const nextQ = qi >= 0 ? quiz[qi + 1] : null;
  const qKey = state?.question_key ?? "";
  const phase = state?.phase ?? "idle";

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

  // ── demo simulation: demo teams "draw" and submit at random times ──
  const demoDone = useRef(new Set<string>());
  useEffect(() => {
    if (!game?.is_demo || !gameId || !state || !q) return;
    if (phase !== "countdown" && phase !== "locked") return;
    const demoTeams = teams.filter((t) => t.is_demo);
    const submitted = new Set(answers.map((a) => a.team_id));
    const timers: ReturnType<typeof setTimeout>[] = [];
    const left = state.timer_ends_at ? Math.max(0, Date.parse(state.timer_ends_at) - serverNow()) : 0;
    demoTeams.forEach((t, i) => {
      const tag = `${qKey}:${t.id}`;
      if (submitted.has(t.id) || demoDone.current.has(tag)) return;
      const delay = phase === "locked" ? 200 + i * 250 : left * (0.25 + Math.random() * 0.7);
      timers.push(
        setTimeout(() => {
          if (demoDone.current.has(tag)) return;
          demoDone.current.add(tag);
          const sc = qScale(q);
          const res = sc
            ? dummyScaleDrawing(sc, q.answerValue)
            : { dataUrl: dummyDrawing(q.answer, Math.random() < 0.55), value: null };
          A.demoSubmit(gameId, t.id, qKey, res.dataUrl, res.value).then((r) => {
            if (!r.ok) {
              demoDone.current.delete(tag);
              setError(`Demo: ${r.error}`);
            }
          });
        }, delay),
      );
    });
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.is_demo, gameId, phase, qKey, teams.length, state?.timer_ends_at]);

  if (!game) return <Setup act={act} pending={pending} error={error} />;

  const joinedTeams = teams.filter((t) => t.name || codeById.has(t.id));
  const answerBy = new Map(answers.map((a) => [a.team_id, a]));
  const pointsFor = (teamId: string, key: string) =>
    scores.find((s) => s.team_id === teamId && s.question_key === key)?.points;

  const can = {
    show: phase === "idle" || phase === "question",
    start: phase === "idle" || phase === "question",
    lock: phase === "countdown",
    reveal: phase === "locked" || phase === "scoreboard" || phase === "countdown",
    next: phase !== "countdown" && phase !== "finished",
    board: phase !== "countdown",
  };
  const primary: Record<Phase, string> = {
    idle: "show",
    question: "start",
    countdown: "lock",
    locked: "reveal",
    reveal: nextQ && nextQ.round !== q?.round ? "board" : "next",
    scoreboard: "next",
    finished: "board",
  };
  const btn = (id: keyof typeof can) => `btn h-14 text-base ${primary[phase] === id ? "btn-gold" : "btn-ghost"}`;

  return (
    <main className="mx-auto max-w-[1500px] p-4 sm:p-6">
      {/* Header */}
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <Wordmark size="sm" />
          <span className="rounded-full border border-gold/30 px-3 py-1 text-xs text-gold-soft">
            {game.is_demo ? "DEMO-MODE" : "Live"}
          </span>
          <span className="flex items-center gap-1.5 text-xs text-cream/60">
            <span className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-400" : "bg-alarm animate-pulse"}`} />
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

      <div className="grid gap-5 lg:grid-cols-[1.15fr_1fr]">
        {/* ───────── Left: question + controls ───────── */}
        <section className="space-y-5">
          <div className="card-dark p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              {state && (
                <RoundLabel
                  round={state.current_round}
                  totalRounds={state.total_rounds}
                  index={state.current_index}
                  roundSize={state.round_size}
                  className="text-xs"
                />
              )}
              <span className="rounded-full bg-gold/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-gold">
                {PHASE_LABEL[phase]}
              </span>
            </div>

            {phase === "finished" ? (
              <p className="py-8 text-center font-display text-4xl">Quizzen er slut 🎄</p>
            ) : q ? (
              <div className="flex gap-5">
                <div className="min-w-0 flex-1 space-y-4">
                  <p className="text-xs uppercase tracking-widest text-cream/50">{q.roundTitle}</p>
                  <p className="font-display text-3xl leading-tight">{q.text}</p>
                  <div className="rounded-xl border border-gold/40 bg-gold/10 px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-gold">Facit · kun quizmaster</p>
                    <p className="mt-1 text-xl font-semibold text-gold-soft">{q.answer}</p>
                  </div>
                  <p className="text-xs text-cream/50">
                    Timer: {q.timerSeconds} sek · Medie: {q.mediaType === "none" ? "intet" : q.mediaType}
                    {qScale(q) && ` · Skala ${q.scaleMin}–${q.scaleMax} ${q.unit ?? ""}`}
                    {" · "}Point: {q.scoring === "closest" ? `tættest vinder (${q.closestPoints.map((p) => p * q.pointMultiplier).join("/")})` : "manuelt"}
                  </p>
                  {q.pointMultiplier > 1 && (
                    <span className="inline-block rounded-full bg-gold px-3 py-1 text-xs font-bold uppercase tracking-widest text-ink">
                      {multiplierLabel(q.pointMultiplier)}
                    </span>
                  )}
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
              <p className="text-cream/60">Spørgsmål ikke fundet i quiz.json</p>
            )}
          </div>

          {/* Controls */}
          <div className="card-dark grid grid-cols-2 gap-3 p-5 sm:grid-cols-3">
            <button className={btn("show")} disabled={pending || !can.show} onClick={() => act(() => A.showQuestion(game.id))}>
              Vis spørgsmål
            </button>
            <button className={btn("start")} disabled={pending || !can.start} onClick={() => act(() => A.startTimer(game.id))}>
              Start timer
            </button>
            <button className={btn("lock")} disabled={pending || !can.lock} onClick={() => act(() => A.lockNow(game.id))}>
              Lås nu
            </button>
            <button className={btn("reveal")} disabled={pending || !can.reveal} onClick={() => act(() => A.reveal(game.id))}>
              Vis svar
            </button>
            <button className={btn("next")} disabled={pending || !can.next} onClick={() => act(() => A.next(game.id))}>
              Næste
            </button>
            <button className={btn("board")} disabled={pending || !can.board} onClick={() => act(() => A.showScoreboard(game.id))}>
              Scoreboard
            </button>

            {q && (q.mediaType === "audio" || q.mediaType === "video") && (
              <div className="col-span-full mt-1 flex flex-wrap items-center gap-2 border-t border-gold/15 pt-4">
                <span className="mr-2 text-xs uppercase tracking-widest text-cream/50">
                  {q.mediaType === "audio" ? "Lyd" : "Video"} på storskærm
                </span>
                <button className="btn btn-ghost" onClick={() => act(() => A.mediaCommand(game.id, "play"))}>▶ Afspil</button>
                <button className="btn btn-ghost" onClick={() => act(() => A.mediaCommand(game.id, "pause"))}>❚❚ Pause</button>
                <button className="btn btn-ghost" onClick={() => act(() => A.mediaCommand(game.id, "stop"))}>■ Stop</button>
                <span className="text-xs text-cream/50">
                  Status: {state?.media_command === "play" ? "spiller" : state?.media_command === "pause" ? "pauset" : "stoppet"}
                  {phase === "idle" && " · vis spørgsmålet først"}
                </span>
              </div>
            )}
          </div>

          {nextQ && (
            <div className="card-dark p-5 text-sm">
              <p className="mb-1 text-xs uppercase tracking-widest text-cream/50">
                Næste · R{nextQ.round} S{nextQ.index} {nextQ.round !== q?.round && `· ny runde: ${nextQ.roundTitle}`}
              </p>
              <p className="text-cream/90">{nextQ.text}</p>
              <p className="mt-1 text-gold/80">Facit: {nextQ.answer}</p>
            </div>
          )}

          <div className="card-dark flex flex-wrap items-center gap-3 p-5 text-sm">
            <label className="flex items-center gap-2">
              <span className="text-cream/60">Hop til</span>
              <select
                className="field w-auto py-2"
                value={q ? questionKey(q.round, q.index) : ""}
                onChange={(e) => {
                  const t = quiz.find((x) => questionKey(x.round, x.index) === e.target.value);
                  if (t) act(() => A.gotoQuestion(game.id, t.round, t.index));
                }}
                disabled={pending || phase === "countdown"}
              >
                {quiz.map((x) => (
                  <option key={questionKey(x.round, x.index)} value={questionKey(x.round, x.index)}>
                    R{x.round} S{x.index} – {x.text.slice(0, 50)}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="btn btn-ghost"
              disabled={pending || phase === "countdown"}
              onClick={() => {
                if (!confirmInline("Slet alle tegninger for dette spørgsmål?")) return;
                demoDone.current.clear();
                act(() => A.clearAnswers(game.id));
              }}
            >
              Ryd svar for spørgsmålet
            </button>
            <button
              className="btn btn-danger ml-auto"
              disabled={pending}
              onClick={() => confirmInline("Afslut spillet? Storskærm og hold kobles af.") && act(() => A.endGame(game.id))}
            >
              Afslut spil
            </button>
          </div>
        </section>

        {/* ───────── Right: teams + points ───────── */}
        <section className="space-y-5">
          <div className="card-dark p-5">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="font-display text-2xl">Hold & point</h2>
              <span className="text-xs text-cream/50">
                {answers.length}/{teams.filter((t) => t.name).length} afleveret · {qKey}
              </span>
            </div>
            {q?.scoring === "closest" && q.answerValue !== null && (
              <div className="mb-2 flex items-center justify-between gap-3 rounded-lg bg-gold/10 px-3 py-2 text-xs text-gold-soft">
                <span>Tættest-point gives automatisk ved “Vis svar” (kan rettes).</span>
                <button
                  className="btn btn-ghost px-3 py-1.5 text-xs"
                  disabled={pending || (phase !== "reveal" && phase !== "scoreboard")}
                  onClick={() => act(() => A.recalcClosest(game.id))}
                >
                  Beregn igen
                </button>
              </div>
            )}
            <ul className="divide-y divide-gold/10">
              {joinedTeams.map((t) => {
                const a = answerBy.get(t.id);
                const pts = pointsFor(t.id, qKey);
                return (
                  <li key={t.id} className="flex items-center gap-3 py-3">
                    <div className="relative h-14 w-20 shrink-0 overflow-hidden rounded-md bg-cream">
                      {a ? (
                        <a href={publicImageUrl(a.image_path, a.submitted_at)} target="_blank" rel="noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={publicImageUrl(a.image_path, a.submitted_at)} alt="" className="h-full w-full object-contain" />
                        </a>
                      ) : (
                        <span className="grid h-full place-items-center text-[10px] text-ink/40">—</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">
                        {t.name ?? <span className="text-cream/40">Venter på hold…</span>}
                        {t.is_demo && <span className="ml-2 text-[10px] uppercase text-gold/60">demo</span>}
                      </p>
                      <p className="text-xs text-cream/50">
                        {!t.is_demo && (
                          <>
                            Kode <span className="tabular font-mono text-sm font-bold tracking-widest text-gold">{codeById.get(t.id) ?? "····"}</span>
                            {" · "}
                          </>
                        )}
                        {phase === "countdown" || phase === "locked" ? (a ? "afleveret ✓" : t.name ? "tegner…" : "") : ""}
                        {a && a.scale_value !== null && qScale(q) && (
                          <span className="ml-1 font-semibold" style={{ color: teamColor(t.slot) }}>
                            ✕ {formatScaleValue(a.scale_value, qScale(q)!)}
                          </span>
                        )}
                        <span className="ml-1 tabular">· {totals.get(t.id) ?? 0} p i alt</span>
                      </p>
                    </div>
                    {t.name && (
                      <div className="flex gap-1">
                        {[0, 1, 2, 3].map((b) => b * (q?.pointMultiplier ?? 1)).map((p) => (
                          <button
                            key={p}
                            disabled={pending}
                            onClick={() => act(() => A.setScore(game.id, t.id, qKey, p))}
                            className={`h-10 w-11 rounded-lg text-sm font-bold transition ${
                              pts === p ? "bg-gold text-ink" : "border border-gold/25 text-gold-soft hover:border-gold/60"
                            }`}
                          >
                            {p === 0 ? "0" : `+${p}`}
                          </button>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          <ScoreMatrix
            quiz={quiz}
            upto={qi}
            teams={teams.filter((t) => t.name)}
            pointsFor={pointsFor}
            totals={totals}
            onSet={(teamId, key, p) => act(() => A.setScore(game.id, teamId, key, p))}
          />
        </section>
      </div>
    </main>
  );
}

function confirmInline(msg: string) {
  // Native confirm is fine for the quizmaster's own screen.
  return window.confirm(msg);
}

function Setup({
  act,
  pending,
  error,
}: {
  act: (fn: () => Promise<{ ok: boolean; error?: string }>) => void;
  pending: boolean;
  error: string | null;
}) {
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
              <button
                key={i}
                onClick={() => setN(i)}
                className={`h-11 w-11 rounded-lg font-bold ${n === i ? "bg-gold text-ink" : "border border-gold/30 text-gold-soft"}`}
              >
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
            4 simulerede hold, der afleverer dummy-tegninger automatisk – plus valgfrie rigtige pladser, så du også kan teste
            /play i en anden fane eller på mobilen.
          </p>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-cream/60">Ekstra rigtige hold:</span>
            {[0, 1, 2, 3, 4].map((i) => (
              <button
                key={i}
                onClick={() => setExtra(i)}
                className={`h-9 w-9 rounded-lg font-bold ${extra === i ? "bg-gold text-ink" : "border border-gold/30 text-gold-soft"}`}
              >
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
  pointsFor,
  totals,
  onSet,
}: {
  quiz: QuizQuestion[];
  upto: number;
  teams: { id: string; name: string | null }[];
  pointsFor: (teamId: string, key: string) => number | undefined;
  totals: Map<string, number>;
  onSet: (teamId: string, key: string, p: number) => void;
}) {
  const cols = quiz.slice(0, Math.max(1, upto + 1));
  return (
    <details className="card-dark p-5" open>
      <summary className="cursor-pointer font-display text-2xl">Pointtabel · ret point</summary>
      <div className="mt-4 overflow-x-auto">
        <table className="text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 bg-pine-900 pr-3 text-left font-semibold text-cream/60">Hold</th>
              {cols.map((x) => (
                <th
                  key={questionKey(x.round, x.index)}
                  className={`px-0.5 font-normal ${x.pointMultiplier > 1 ? "text-gold" : "text-cream/50"}`}
                  title={`${x.text}${x.pointMultiplier > 1 ? ` (×${x.pointMultiplier})` : ""}`}
                >
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
                  const key = questionKey(x.round, x.index);
                  const v = pointsFor(t.id, key);
                  return (
                    <td key={key} className="px-0.5">
                      <select
                        value={v ?? ""}
                        onChange={(e) => e.target.value !== "" && onSet(t.id, key, Number(e.target.value))}
                        className={`h-7 w-9 appearance-none rounded text-center tabular ${
                          v ? "bg-gold/25 text-gold-soft" : "bg-pine-950/70 text-cream/40"
                        }`}
                      >
                        <option value="">–</option>
                        {[0, 1, 2, 3].map((b) => b * x.pointMultiplier).map((p) => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
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
