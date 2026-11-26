"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AnswerCard } from "@/components/AnswerCard";
import { RoundLabel, Star, Wordmark } from "@/components/Brand";
import { Scoreboard } from "@/components/Scoreboard";
import { TimerRing } from "@/components/TimerRing";
import { useClockSync } from "@/lib/clock";
import { chime, unlockAudio } from "@/lib/sound";
import { rankTeams, useActiveGame, useGame } from "@/lib/useGame";
import { ScalePreview, ScaleReveal } from "@/components/ScaleReveal";
import { multiplierLabel, stateScale, type Answer, type GameState, type Team } from "@/lib/types";

export function DisplayClient() {
  useClockSync();
  const { game, loaded } = useActiveGame();
  const { state, teams, answers, scores, totals } = useGame(game?.id);
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
    // Prime the media element inside the user gesture so later play() calls are allowed.
    audioRef.current?.play().then(() => audioRef.current?.pause()).catch(() => {});
    document.documentElement.requestFullscreen?.().catch(() => {});
    setStarted(true);
  };

  // ── audio controlled from admin ──
  const isAudio = state?.media_type === "audio" && !!state.media_url;
  const mediaCmd = state?.media_command;
  const mediaCmdAt = state?.media_command_at;
  const mediaUrl = state?.media_url;
  useEffect(() => {
    const el = audioRef.current;
    if (!el || !isAudio) return;
    if (mediaCmd === "play") {
      el.play()
        .then(() => setAudioBlocked(false))
        .catch(() => setAudioBlocked(true));
    } else {
      el.pause();
      if (mediaCmd === "stop") el.currentTime = 0;
    }
  }, [isAudio, mediaCmd, mediaCmdAt, mediaUrl]);

  // Chime on reveal
  const prevPhase = useRef<string | null>(null);
  const phaseNow = state?.phase ?? null;
  const isScaleQ = !!stateScale(state);
  useEffect(() => {
    // (scale reveals chime themselves when the facit marker lands)
    if (phaseNow === "reveal" && prevPhase.current && prevPhase.current !== "reveal" && !isScaleQ) chime();
    prevPhase.current = phaseNow;
  }, [phaseNow, isScaleQ]);

  const ranked = rankTeams(teams, totals);
  const joined = teams.filter((t) => t.name);

  let body: React.ReactNode;
  if (!loaded) body = null;
  else if (!game || !state) body = <Waiting />;
  else
    switch (state.phase) {
      case "idle":
        body = <RoundIntro state={state} teams={joined} origin={origin} showJoin={scores.length === 0} />;
        break;
      case "question":
        body = <QuestionView state={state} audioPlaying={audioPlaying} />;
        break;
      case "countdown":
      case "locked":
        body = <CountdownView state={state} teams={joined} answers={answers} audioPlaying={audioPlaying} sound={started} />;
        break;
      case "reveal":
        body = <RevealView state={state} teams={joined} answers={answers} totals={totals} scores={scores} />;
        break;
      case "scoreboard":
        body = (
          <Centered>
            <Scoreboard
              ranked={ranked}
              title={state.current_index >= state.round_size ? `Stilling efter runde ${state.current_round}` : "Stilling"}
            />
          </Centered>
        );
        break;
      case "finished":
        body = (
          <Centered>
            <div className="mb-[3vh] flex justify-center gap-[1vw] text-gold">
              <Star className="h-[4vh] w-[4vh]" />
              <Star className="h-[6vh] w-[6vh]" />
              <Star className="h-[4vh] w-[4vh]" />
            </div>
            <Scoreboard ranked={ranked} title="Glædelig jul – her er vinderne!" />
          </Centered>
        );
        break;
    }

  return (
    <main className="relative flex h-screen w-screen cursor-default flex-col overflow-hidden">
      {/* persistent audio element (kept across question → countdown) */}
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
        <header className="flex shrink-0 items-center justify-between px-[3vw] pt-[2.4vh]">
          <div className="flex items-center gap-[1.2vw]">
            <Wordmark size="sm" />
            {state.point_multiplier > 1 && <MultiplierBadge m={state.point_multiplier} small />}
          </div>
          <RoundLabel
            round={state.current_round}
            totalRounds={state.total_rounds}
            index={state.current_index}
            roundSize={state.round_size}
            className="text-[1.5vw]"
          />
        </header>
      )}

      <div key={`${state?.phase}-${state?.question_key}`} className="animate-fade-up flex min-h-0 flex-1 flex-col">
        {body}
      </div>

      {audioBlocked && started && (
        <p className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-alarm/80 px-4 py-1 text-sm">
          Browseren blokerede lyden – klik på skærmen
        </p>
      )}

      {!started && (
        <button
          onClick={start}
          className="absolute inset-0 z-50 grid place-items-center bg-pine-950/85 backdrop-blur-sm"
        >
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

function questionSize(text: string, compact: boolean) {
  const n = text.length;
  if (compact) return n < 70 ? "text-[3.4vw]" : n < 120 ? "text-[2.8vw]" : "text-[2.3vw]";
  return n < 60 ? "text-[5vw]" : n < 110 ? "text-[4vw]" : "text-[3.3vw]";
}

function RoundIntro({
  state,
  teams,
  origin,
  showJoin,
}: {
  state: GameState;
  teams: Team[];
  origin: string;
  showJoin: boolean;
}) {
  const firstOfRound = state.current_index === 1;
  return (
    <Centered>
      <div className="flex flex-col items-center gap-[3vh] text-center">
        <Wordmark size={showJoin ? "xl" : "md"} />
        <div className="hairline w-[40vw]" />
        <RoundLabel round={state.current_round} totalRounds={state.total_rounds} className="text-[2vw]" />
        <h1 className="font-display text-[8vw] font-semibold leading-none text-cream">{state.round_title}</h1>
        {state.point_multiplier > 1 && <MultiplierBadge m={state.point_multiplier} />}
        <p className="text-[2.2vw] text-gold-soft/80">
          {firstOfRound ? "Første spørgsmål kommer om lidt" : `Spørgsmål ${state.current_index} / ${state.round_size} kommer om lidt`}
        </p>
        {showJoin && (
          <div className="mt-[3vh] w-full max-w-[80vw] space-y-[2.4vh]">
            <p className="text-[2vw] text-cream/80">
              Gå til <span className="font-semibold text-gold">{origin}/play</span> og indtast jeres kode
            </p>
            <div className="flex flex-wrap justify-center gap-[1vw]">
              {teams.map((t) => (
                <span
                  key={t.id}
                  className="animate-pop rounded-full border border-gold/40 bg-pine-900/70 px-[1.6vw] py-[0.8vh] text-[1.8vw] font-semibold"
                >
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
  if (!state.media_url || state.media_type === "none") return null;
  if (state.media_type === "image")
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={state.media_url}
        alt=""
        className={`mx-auto rounded-[1.2vmin] object-contain shadow-[0_3vh_6vh_-3vh_rgba(0,0,0,0.8)] ring-1 ring-gold/25 ${
          compact ? "max-h-[42vh] max-w-[36vw]" : "max-h-[52vh] max-w-[70vw]"
        }`}
      />
    );
  if (state.media_type === "video") return <VideoPlayer state={state} compact={compact} />;
  return <AudioBadge playing={audioPlaying} compact={compact} />;
}

function AudioBadge({ playing, compact }: { playing: boolean; compact: boolean }) {
  const h = compact ? "h-[10vh]" : "h-[16vh]";
  return (
    <div className="flex flex-col items-center gap-[2vh]">
      <div className={`flex items-end gap-[0.6vw] ${h}`}>
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
    if (state.media_command === "play") el.play().catch(() => {});
    else {
      el.pause();
      if (state.media_command === "stop") el.currentTime = 0;
    }
    return () => {
      videoTimes.set(url, el.currentTime);
    };
  }, [url, state.media_command, state.media_command_at]);
  return (
    <video
      ref={ref}
      src={url}
      playsInline
      preload="auto"
      className={`mx-auto rounded-[1.2vmin] bg-black ring-1 ring-gold/25 ${compact ? "max-h-[42vh] max-w-[40vw]" : "max-h-[58vh] max-w-[80vw]"}`}
    />
  );
}

function QuestionView({ state, audioPlaying }: { state: GameState; audioPlaying: boolean }) {
  const text = state.question_text ?? "";
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-[5vh] px-[6vw] pb-[4vh] text-center">
      <h1 className={`font-display font-semibold leading-[1.08] text-cream ${questionSize(text, state.media_type !== "none")}`}>
        {text}
      </h1>
      <Media state={state} audioPlaying={audioPlaying} compact={false} />
      {stateScale(state) && <ScalePreview scale={stateScale(state)!} />}
    </div>
  );
}

function MultiplierBadge({ m, small = false }: { m: number; small?: boolean }) {
  return (
    <span
      className={`animate-pop inline-flex items-center gap-[0.6em] rounded-full bg-gold font-bold uppercase text-ink shadow-[0_0_4vmin_rgba(217,185,122,0.45)] ${
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

function TeamStatus({ teams, answers }: { teams: Team[]; answers: Answer[] }) {
  const done = new Set(answers.map((a) => a.team_id));
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
            <span className={ok ? "" : "italic text-cream/50"}>{ok ? "afleveret ✓" : "tegner…"}</span>
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
  answers: Answer[];
  audioPlaying: boolean;
  sound: boolean;
}) {
  const text = state.question_text ?? "";
  const hasMedia = state.media_type !== "none" && !!state.media_url;
  return (
    <div className="flex flex-1 flex-col">
      <h1 className={`px-[6vw] pt-[2vh] text-center font-display font-semibold leading-[1.1] text-cream ${questionSize(text, true)}`}>
        {text}
      </h1>
      <div className="flex min-h-0 flex-1 items-center justify-center gap-[6vw]">
        {hasMedia && <Media state={state} audioPlaying={audioPlaying} compact />}
        <TimerRing
          endsAt={state.timer_ends_at}
          totalSeconds={state.timer_seconds}
          size={hasMedia ? "40vmin" : "48vmin"}
          sound={sound}
          label="sekunder"
        />
      </div>
      <TeamStatus teams={teams} answers={answers} />
    </div>
  );
}

function RevealView({
  state,
  teams,
  answers,
  totals,
  scores,
}: {
  state: GameState;
  teams: Team[];
  answers: Answer[];
  totals: Map<string, number>;
  scores: { team_id: string; question_key: string; points: number }[];
}) {
  const scale = stateScale(state);
  if (scale)
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center px-[3vw] pb-[3vh] pt-[1.5vh]">
        <p className="max-w-[88vw] text-center font-display text-[2.8vw] leading-tight text-cream/90">{state.question_text}</p>
        <ScaleReveal
          scale={scale}
          answerValue={state.answer_value}
          answerText={state.answer_text}
          teams={teams}
          answers={answers}
          totals={totals}
          pointsFor={(id) => scores.find((s) => s.team_id === id && s.question_key === state.question_key)?.points}
        />
      </div>
    );
  const by = new Map(answers.map((a) => [a.team_id, a]));
  const n = Math.max(1, teams.length);
  const cols = n <= 4 ? n : n <= 6 ? 3 : 4;
  const rows = Math.ceil(n / cols);
  // Fit both width and height: card = drawing (10:7) + caption (~5.5vh); ~70vh available for the grid.
  const cardW = `((${(70 / rows).toFixed(2)}vh - 5.5vh) / 0.7)`;
  const gridMax = `min(94vw, calc(${cols} * ${cardW} + ${cols - 1} * 1.4vw))`;
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center gap-[2.4vh] px-[3vw] pb-[3vh] pt-[1.5vh]">
      <div className="flex max-w-[90vw] flex-wrap items-center justify-center gap-x-[2vw] gap-y-[1vh] text-center">
        <p className="font-display text-[2.4vw] leading-tight text-cream/85">{state.question_text}</p>
        <div className="animate-pop rounded-[1vmin] bg-gold px-[1.8vw] py-[1vh] text-ink" style={{ animationDelay: "400ms" }}>
          <span className="mr-[0.8vw] text-[1.1vw] font-semibold uppercase tracking-[0.25em]">Facit</span>
          <span className="text-[2.4vw] font-bold">{state.answer_text}</span>
        </div>
      </div>
      <div
        className="grid w-full min-h-0 flex-1 content-center gap-[1.4vw]"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, maxWidth: gridMax }}
      >
        {teams.map((t, i) => {
          const pts = scores.find((s) => s.team_id === t.id && s.question_key === state.question_key)?.points;
          return (
            <AnswerCard
              key={t.id}
              teamName={t.name ?? ""}
              answer={by.get(t.id)}
              total={totals.get(t.id) ?? 0}
              questionPoints={pts}
              delay={i * 90}
            />
          );
        })}
      </div>
    </div>
  );
}
