"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { RoundLabel, Star, Wordmark } from "@/components/Brand";
import { Confetti, RoundWinner, Sleigh, Snowfall, Stamp, type RoundWinnerTeam } from "@/components/Fun";
import { Scoreboard } from "@/components/Scoreboard";
import { TimerRing } from "@/components/TimerRing";
import { REGISTRY } from "@/lib/answerTypes/registry";
import { useClockSync } from "@/lib/clock";
import { fanfare, unlockAudio } from "@/lib/sound";
import { multiplierLabel, publicQuestion, teamColor, type AnswerStatus, type GameState, type Score, type Team } from "@/lib/types";
import { standings, useActiveGame, useGame, useRevealedAnswers } from "@/lib/useGame";

export function DisplayClient() {
  useClockSync();
  const { game, loaded } = useActiveGame();
  const { state, teams, answers, scores, totals, scoreFor } = useGame(game?.id);
  const [started, setStarted] = useState(false);
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.host,
    () => "",
  );
  const audioRef = useRef<HTMLAudioElement>(null);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);

  const start = () => {
    unlockAudio();
    audioRef.current?.play().then(() => audioRef.current?.pause()).catch(() => {});
    document.documentElement.requestFullscreen?.().catch(() => {});
    setStarted(true);
  };

  // ── audio controlled from admin (only ever plays here, never on team devices) ──
  const isAudio = state?.media_type === "audio" && !!state.media_url;
  const mediaCmd = state?.media_command;
  const mediaCmdAt = state?.media_command_at;
  const mediaSeek = state?.media_seek ?? null;
  const mediaUrl = state?.media_url;
  useEffect(() => {
    const el = audioRef.current;
    if (!el || !isAudio) return;
    if (mediaCmd === "play") {
      if (mediaSeek !== null) el.currentTime = mediaSeek;
      el.play()
        .then(() => setAudioBlocked(false))
        .catch(() => setAudioBlocked(true));
    } else {
      el.pause();
      if (mediaCmd === "stop") el.currentTime = 0;
    }
  }, [isAudio, mediaCmd, mediaCmdAt, mediaSeek, mediaUrl]);

  // ── revealed answer values (RPC, only after reveal) ──
  const revealing = state?.phase === "reveal";
  const version = `${state?.updated_at}|${scores.map((s) => `${s.team_id}${s.question_key}${s.points}`).join(",")}`;
  const revealed = useRevealedAnswers(game?.id, revealing, state?.question_key ?? null, version);

  const joined = teams.filter((t) => t.name);

  let body: React.ReactNode = null;
  if (!loaded) body = null;
  else if (!game || !state) body = <Waiting />;
  else
    switch (state.phase) {
      case "idle":
        body = <RoundIntro state={state} teams={joined} origin={origin} showJoin={scores.length === 0 && state.current_round === 1} />;
        break;
      case "question":
        body = <QuestionView state={state} audioPlaying={audioPlaying} />;
        break;
      case "countdown":
      case "locked":
        body = <CountdownView state={state} teams={joined} answers={answers} audioPlaying={audioPlaying} sound={started} />;
        break;
      case "reveal": {
        const q = publicQuestion(state);
        const Reveal = REGISTRY[q.answerType].Reveal;
        body = (
          <div className="flex min-h-0 w-full flex-1 flex-col px-[3vw] pb-[3vh] pt-[1vh]">
            {q.answerType !== "geo" && (
              <p className="mb-[1vh] max-w-[88vw] self-center text-center font-display text-[2.4vw] leading-tight text-cream/85">{q.text}</p>
            )}
            <Reveal
              q={q}
              reveal={state.reveal_payload ?? {}}
              answerText={state.answer_text ?? ""}
              step={state.reveal_step}
              teams={joined}
              answers={revealed}
              scoreFor={(id) => scoreFor(id, state.question_key)}
              totals={totals}
            />
            {state.reveal_step === facitStep(state) && <Confetti seed={`facit-${state.question_key}`} />}
            {typeof state.reveal_payload?.source === "string" &&
              state.reveal_step >= facitStep(state) && (
              <p className="animate-fade-up mt-[1vh] self-center text-[1.2vw] text-cream/55">Kilde: {state.reveal_payload.source}</p>
            )}
          </div>
        );
        break;
      }
      case "scoreboard":
        body = <ScoreboardView state={state} teams={teams} scores={scores} sound={started} />;
        break;
      case "finished":
        body = (
          <Centered>
            <div className="mb-[3vh] flex justify-center gap-[1vw] text-gold">
              <Star className="h-[4vh] w-[4vh]" />
              <Star className="h-[6vh] w-[6vh]" />
              <Star className="h-[4vh] w-[4vh]" />
            </div>
            <Scoreboard ranked={standings(teams, scores, state.total_rounds)} title="Glædelig jul – her er vinderne!" />
            <Confetti seed="finale" mode="rain" loop count={120} />
            <Sleigh delay={2} top={4} />
          </Centered>
        );
        break;
    }

  return (
    <main className="relative flex h-screen w-screen cursor-default flex-col overflow-hidden">
      {isAudio && (
        <audio
          ref={audioRef}
          src={state!.media_url!}
          preload="auto"
          onPlay={() => setAudioPlaying(true)}
          onPause={() => setAudioPlaying(false)}
          onEnded={() => setAudioPlaying(false)}
        />
      )}

      {state && state.phase !== "idle" && state.phase !== "finished" && (
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-[2vw] gap-y-[1vh] px-[3vw] pt-[2.4vh]">
          <div className="flex items-center gap-[1.2vw]">
            <Wordmark size="sm" />
            {state.point_multiplier > 1 && <MultiplierBadge m={state.point_multiplier} small />}
          </div>
          <RoundLabel round={state.current_round} totalRounds={state.total_rounds} index={state.current_index} roundSize={state.round_size} className="text-[1.5vw]" />
        </header>
      )}

      <div key={`${state?.phase}-${state?.question_key}`} className="animate-fade-up flex min-h-0 flex-1 flex-col">
        {body}
      </div>

      {audioBlocked && started && (
        <p className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-alarm/80 px-4 py-1 text-sm">Browseren blokerede lyden – klik på skærmen</p>
      )}

      {!started && (
        <button onClick={start} className="absolute inset-0 z-[2000] grid place-items-center bg-pine-950/85 backdrop-blur-sm">
          <div className="space-y-[3vh] text-center">
            <Wordmark size="xl" />
            <p className="text-[2vw] text-cream/80">Klik for at starte storskærmen</p>
            <p className="text-[1.2vw] text-cream/40">Aktiverer fuldskærm og lyd</p>
          </div>
        </button>
      )}
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 flex-col justify-center px-[4vw] py-[3vh]">{children}</div>;
}

function Waiting() {
  return (
    <Centered>
      <Wordmark size="xl" />
      <p className="mt-[4vh] text-center text-[2vw] text-cream/50">Venter på quizmasteren…</p>
    </Centered>
  );
}

function MultiplierBadge({ m, small = false }: { m: number; small?: boolean }) {
  return (
    <span
      className={`animate-pop fun-wobble inline-flex items-center gap-[0.6em] rounded-full bg-gold font-bold uppercase text-ink shadow-[0_0_4vmin_rgba(217,185,122,0.45)] ${
        small ? "px-[1vw] py-[0.4vh] text-[1vw] tracking-[0.2em]" : "px-[2.4vw] py-[1.2vh] text-[2.6vw] tracking-[0.25em]"
      }`}
      style={small ? undefined : { animationDelay: "350ms" }}
    >
      <Star className={small ? "h-[0.9vw] w-[0.9vw]" : "h-[2vw] w-[2vw]"} />
      {multiplierLabel(m)}
      <Star className={small ? "h-[0.9vw] w-[0.9vw]" : "h-[2vw] w-[2vw]"} />
    </span>
  );
}

function questionSize(text: string, compact: boolean) {
  const n = text.length;
  if (compact) return n < 70 ? "text-[3.2vw]" : n < 130 ? "text-[2.6vw]" : "text-[2.1vw]";
  return n < 60 ? "text-[5vw]" : n < 110 ? "text-[4vw]" : "text-[3.2vw]";
}

function RoundIntro({ state, teams, origin, showJoin }: { state: GameState; teams: Team[]; origin: string; showJoin: boolean }) {
  return (
    <Centered>
      <Snowfall seed={`snow-${state.current_round}`} />
      {state.current_index === 1 && <Sleigh delay={1.2} top={6} />}
      <div className="flex flex-col items-center gap-[3vh] text-center">
        <Wordmark size={showJoin ? "xl" : "md"} />
        <div className="hairline w-[40vw]" />
        <RoundLabel round={state.current_round} totalRounds={state.total_rounds} className="text-[2vw]" />
        <h1 className="font-display text-[7.5vw] font-semibold leading-none text-cream">{state.round_title}</h1>
        {state.point_multiplier > 1 && <MultiplierBadge m={state.point_multiplier} />}
        <p className="text-[2.2vw] text-gold-soft/80">
          {state.current_index === 1 ? "Første spørgsmål kommer om lidt" : `Spørgsmål ${state.current_index} / ${state.round_size} kommer om lidt`}
        </p>
        {showJoin && (
          <div className="mt-[2vh] w-full max-w-[80vw] space-y-[2.4vh]">
            <p className="text-[2vw] text-cream/80">
              Gå til <span className="font-semibold text-gold">{origin}/play</span> og indtast jeres kode
            </p>
            <div className="flex flex-wrap justify-center gap-[1vw]">
              {teams.map((t) => (
                <span key={t.id} className="animate-pop rounded-full border border-gold/40 bg-pine-900/70 px-[1.6vw] py-[0.8vh] text-[1.8vw] font-semibold">
                  ✓ {t.name}
                </span>
              ))}
              {teams.length === 0 && <span className="text-[1.6vw] text-cream/40">Ingen hold tilmeldt endnu</span>}
            </div>
          </div>
        )}
      </div>
    </Centered>
  );
}

function Media({ state, audioPlaying, compact }: { state: GameState; audioPlaying: boolean; compact: boolean }) {
  const [broken, setBroken] = useState<string | null>(null);
  if (!state.media_url || state.media_type === "none" || broken === state.media_url) return null;
  if (state.media_type === "image")
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={state.media_url}
        onError={() => setBroken(state.media_url)}
        alt=""
        className={`mx-auto rounded-[1.2vmin] object-contain shadow-[0_3vh_6vh_-3vh_rgba(0,0,0,0.8)] ring-1 ring-gold/25 ${
          compact ? "max-h-[48vh] max-w-[46vw]" : "max-h-[54vh] max-w-[76vw]"
        }`}
      />
    );
  if (state.media_type === "video") return <VideoPlayer state={state} compact={compact} />;
  return <AudioBadge playing={audioPlaying} compact={compact} />;
}

function AudioBadge({ playing, compact }: { playing: boolean; compact: boolean }) {
  return (
    <div className="flex flex-col items-center gap-[2vh]">
      <div className={`flex items-end gap-[0.6vw] ${compact ? "h-[10vh]" : "h-[16vh]"}`}>
        {Array.from({ length: 7 }).map((_, i) => (
          <span
            key={i}
            className="w-[1.1vw] rounded-full bg-gold"
            style={{
              height: playing ? undefined : "18%",
              animation: playing ? `eq 0.${6 + (i % 4)}s ease-in-out ${i * 0.08}s infinite alternate` : undefined,
            }}
          />
        ))}
      </div>
      <span className="text-[1.6vw] uppercase tracking-[0.3em] text-gold/80">{playing ? "Lyt godt efter" : "♪ Lydklip"}</span>
      <style>{`@keyframes eq { from { height: 15% } to { height: 100% } }`}</style>
    </div>
  );
}

const videoTimes = new Map<string, number>();
function VideoPlayer({ state, compact }: { state: GameState; compact: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const url = state.media_url!;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const saved = videoTimes.get(url);
    if (saved && Math.abs(el.currentTime - saved) > 0.5) el.currentTime = saved;
    if (state.media_command === "play") {
      if (state.media_seek !== null) el.currentTime = state.media_seek;
      el.play().catch(() => {});
    } else {
      el.pause();
      if (state.media_command === "stop") el.currentTime = 0;
    }
    return () => {
      videoTimes.set(url, el.currentTime);
    };
  }, [url, state.media_command, state.media_command_at, state.media_seek]);
  return (
    <video
      ref={ref}
      src={url}
      playsInline
      preload="auto"
      className={`mx-auto rounded-[1.2vmin] bg-black ring-1 ring-gold/25 ${compact ? "max-h-[46vh] max-w-[46vw]" : "max-h-[58vh] max-w-[80vw]"}`}
    />
  );
}

function QuestionView({ state, audioPlaying }: { state: GameState; audioPlaying: boolean }) {
  const q = publicQuestion(state);
  const Extra = REGISTRY[q.answerType].DisplayQuestion;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-[4vh] px-[6vw] pb-[4vh] text-center">
      <h1 className={`font-display font-semibold leading-[1.08] text-cream ${questionSize(q.text, state.media_type !== "none")}`}>{q.text}</h1>
      <Media state={state} audioPlaying={audioPlaying} compact={false} />
      {Extra && <Extra q={q} compact={false} />}
    </div>
  );
}

function TeamStatus({ teams, answers, drawing, locked }: { teams: Team[]; answers: AnswerStatus[]; drawing: boolean; locked: boolean }) {
  const done = new Set(answers.map((a) => a.team_id));
  const lockedIds = new Set(answers.filter((a) => a.locked_at).map((a) => a.team_id));
  return (
    <div className="flex flex-wrap justify-center gap-[0.8vw] px-[3vw] pb-[3vh]">
      {teams.map((t) => {
        const ok = done.has(t.id);
        return (
          <span
            key={t.id}
            className={`flex items-center gap-[0.6vw] rounded-full px-[1.3vw] py-[0.8vh] text-[1.45vw] font-semibold transition-colors duration-500 ${
              ok ? "bg-gold text-ink" : "border border-gold/30 bg-pine-900/70 text-cream/80"
            }`}
          >
            <span className="max-w-[16vw] truncate">{t.name}</span>
            <span className={ok ? "" : "italic text-cream/50"}>
              {lockedIds.has(t.id) ? "låst 🔒" : ok ? "svaret ✓" : drawing ? (locked ? "afleverer…" : "tegner…") : "…"}
            </span>
          </span>
        );
      })}
    </div>
  );
}

function CountdownView({
  state,
  teams,
  answers,
  audioPlaying,
  sound,
}: {
  state: GameState;
  teams: Team[];
  answers: AnswerStatus[];
  audioPlaying: boolean;
  sound: boolean;
}) {
  const q = publicQuestion(state);
  const ui = REGISTRY[q.answerType];
  const Extra = ui.DisplayQuestion;
  const hasMedia = state.media_type !== "none" && !!state.media_url;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <h1 className={`px-[6vw] pt-[2vh] text-center font-display font-semibold leading-[1.1] text-cream ${questionSize(q.text, true)}`}>{q.text}</h1>
      <div className="flex min-h-0 flex-1 items-center justify-center gap-[6vw]">
        {hasMedia && <Media state={state} audioPlaying={audioPlaying} compact />}
        <TimerRing endsAt={state.timer_ends_at} totalSeconds={state.timer_seconds} size={hasMedia ? "40vmin" : "46vmin"} sound={sound} label="sekunder" />
      </div>
      {Extra && <Extra q={q} compact />}
      <div className="h-[2vh]" />
      <TeamStatus teams={teams} answers={answers} drawing={!!ui.submitOnLock} locked={state.phase === "locked"} />
      {state.phase === "locked" && <Stamp text="Tiden er gået!" />}
    </div>
  );
}

/** Reveal step on which the facit appears (draw: after every drawing + the grid). */
function facitStep(state: GameState) {
  return state.answer_type === "draw" ? Number(state.reveal_payload?.drawCount ?? 0) + 2 : 2;
}

/** Standings; after the last question of a round the round winner is celebrated first. */
function ScoreboardView({ state, teams, scores, sound }: { state: GameState; teams: Team[]; scores: Score[]; sound: boolean }) {
  const endOfRound = state.current_index >= state.round_size;
  const roundPts = new Map<string, number>();
  for (const s of scores) if (s.round === state.current_round) roundPts.set(s.team_id, (roundPts.get(s.team_id) ?? 0) + s.points);
  const best = Math.max(0, ...roundPts.values());
  const winners: RoundWinnerTeam[] =
    endOfRound && best > 0
      ? teams
          .filter((t) => t.name && roundPts.get(t.id) === best)
          .map((t) => ({ id: t.id, name: t.name!, color: teamColor(t.slot), roundPoints: best }))
      : [];
  const [celebrate, setCelebrate] = useState(winners.length > 0);
  const done = useCallback(() => setCelebrate(false), []);
  useEffect(() => {
    if (celebrate && sound) fanfare();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Centered>
      <Scoreboard
        ranked={standings(teams, scores, state.current_round)}
        title="Stilling"
        subtitle={endOfRound ? `Efter runde ${state.current_round} · ${state.round_title}` : undefined}
      />
      {!celebrate && <Sleigh delay={1.5} top={2} />}
      {celebrate && <RoundWinner round={state.current_round} winners={winners} onDone={done} />}
    </Centered>
  );
}
