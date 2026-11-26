"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Wordmark } from "@/components/Brand";
import { CountryBanner } from "@/components/Flag";
import { Confetti } from "@/components/Fun";
import type { DrawingCanvasHandle } from "@/components/DrawingCanvas";
import { REGISTRY } from "@/lib/answerTypes/registry";
import { serverNow, useClockSync, useCountdown } from "@/lib/clock";
import { getSupabase } from "@/lib/supabase/browser";
import { multiplierLabel, publicQuestion, signed, teamColor, type GameState } from "@/lib/types";
import { standings, useGame } from "@/lib/useGame";

interface Session {
  code: string;
  name: string;
  teamId: string;
  gameId: string;
}

type SaveStatus = "idle" | "saving" | "saved" | "error" | "empty";

async function ensureAuth() {
  const sb = getSupabase();
  const { data } = await sb.auth.getSession();
  if (data.session) return;
  const { error } = await sb.auth.signInAnonymously();
  if (error) throw new Error("Kunne ikke logge ind anonymt: " + error.message);
}

async function joinTeam(code: string, name: string) {
  await ensureAuth();
  const { data, error } = await getSupabase().rpc("join_team", { p_code: code, p_name: name });
  if (error) throw new Error(error.message.includes("Ukendt kode") ? "Ukendt kode – tjek de 4 cifre" : error.message);
  const r = data as { team_id: string; game_id: string; name: string };
  return { code, name: r.name, teamId: r.team_id, gameId: r.game_id } satisfies Session;
}

export function PlayClient() {
  useClockSync();
  const params = useSearchParams();
  // ?p=2 lets you run several teams in one browser while testing (separate localStorage slot).
  const storageKey = `xmasquiz-team${params.get("p") ? `-${params.get("p")}` : ""}`;
  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) return;
        const saved = JSON.parse(raw) as Session;
        // Re-join on every load: re-binds the team to this device's anonymous session.
        const s = await joinTeam(saved.code, saved.name);
        if (!cancelled) {
          setSession(s);
          localStorage.setItem(storageKey, JSON.stringify(s));
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.startsWith("Ukendt kode")) {
          localStorage.removeItem(storageKey);
          if (!cancelled) setBootError("Spillet er slut eller koden er ændret – log ind igen.");
        } else if (!cancelled) setBootError(msg);
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  // Keep the screen awake on phones/tablets
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const req = async () => {
      try {
        lock = (await (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<typeof lock> } }).wakeLock?.request("screen")) ?? null;
      } catch {}
    };
    req();
    const onVis = () => document.visibilityState === "visible" && req();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      lock?.release().catch(() => {});
    };
  }, []);

  if (booting)
    return (
      <Shell>
        <p className="text-center text-cream/60">Forbinder…</p>
      </Shell>
    );
  if (!session)
    return (
      <JoinForm
        initialError={bootError}
        onJoined={(s) => {
          localStorage.setItem(storageKey, JSON.stringify(s));
          setSession(s);
        }}
      />
    );
  return (
    <TeamScreen
      session={session}
      onLeave={() => {
        localStorage.removeItem(storageKey);
        setSession(null);
      }}
    />
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="no-overscroll flex min-h-[100dvh] flex-col items-center justify-center gap-6 p-6">
      <Wordmark size="sm" />
      {children}
    </main>
  );
}

function JoinForm({ onJoined, initialError }: { onJoined: (s: Session) => void; initialError: string | null }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(initialError);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onJoined(await joinTeam(code, name.trim()));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <form onSubmit={submit} className="card-dark animate-fade-up w-full max-w-sm space-y-5 p-7">
        <h1 className="text-center font-display text-4xl font-semibold">Velkommen, hold!</h1>
        <div className="hairline" />
        <label className="block space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.25em] text-gold">Holdkode</span>
          <input
            className="field tabular text-center font-mono text-3xl tracking-[0.5em]"
            inputMode="numeric"
            pattern="[0-9]{4}"
            maxLength={4}
            autoComplete="off"
            placeholder="····"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
            required
          />
        </label>
        <label className="block space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.25em] text-gold">Holdnavn</span>
          <input className="field text-lg" maxLength={40} placeholder="Fx Nissebanden" value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        {error && <p className="text-sm text-[#ffb4b6]">{error}</p>}
        <button className="btn btn-gold w-full py-3.5 text-base" disabled={busy || code.length !== 4 || !name.trim()}>
          {busy ? "Tilmelder…" : "Deltag"}
        </button>
      </form>
    </Shell>
  );
}

// ───────────────────────── answering ─────────────────────────

const answerKey = (teamId: string, qKey: string) => `xmasquiz-answer:${teamId}:${qKey}`;

function TeamScreen({ session, onLeave }: { session: Session; onLeave: () => void }) {
  const { state, teams, answers, scores, totals, scoreFor } = useGame(session.gameId);
  const me = teams.find((t) => t.id === session.teamId);
  const color = me ? teamColor(me.slot) : "#d9b97a";
  const myTotal = totals.get(session.teamId) ?? 0;
  const myRank = standings(teams, scores).find((t) => t.id === session.teamId)?.rank ?? 0;
  const myScore = state ? scoreFor(session.teamId, state.question_key) : undefined;

  return (
    <main className="no-overscroll flex h-[100dvh] flex-col gap-3 overflow-hidden p-3 sm:p-5">
      <header className="flex shrink-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: color }} />
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold leading-tight">{session.name}</p>
            <p className="tabular text-xs text-gold">
              {myTotal} point{myRank > 0 && ` · nr. ${myRank}`}
            </p>
          </div>
        </div>
        {state?.phase === "countdown" && <MiniTimer endsAt={state.timer_ends_at} total={state.timer_seconds} />}
        <button onClick={() => confirm("Forlad holdet på denne enhed?") && onLeave()} className="shrink-0 text-xs text-cream/40 underline-offset-2 hover:underline">
          Skift hold
        </button>
      </header>

      {!state ? (
        <Center>Forbinder til spillet…</Center>
      ) : state.phase === "question" || state.phase === "countdown" || state.phase === "locked" ? (
        <AnswerArea
          key={state.question_key}
          state={state}
          session={session}
          color={color}
          answered={answers.some((a) => a.team_id === session.teamId)}
          lockedOnServer={!!answers.find((a) => a.team_id === session.teamId)?.locked_at}
        />
      ) : state.phase === "reveal" ? (
        <Center>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gold">Facit</p>
          <p className="font-display text-4xl font-semibold">{state.answer_text}</p>
          {typeof state.reveal_payload?.explanation === "string" && (
            <p className="mt-2 max-w-md rounded-xl bg-pine-900/80 px-4 py-3 text-left text-sm leading-snug text-cream/90 ring-1 ring-gold/20">
              {state.reveal_payload.explanation}
            </p>
          )}
          {typeof state.reveal_payload?.source === "string" && <p className="text-xs text-cream/50">Kilde: {state.reveal_payload.source}</p>}
          {myScore ? (
            <p className={`animate-pop mt-4 text-3xl font-bold ${myScore.points < 0 ? "fun-nope text-[#ff8a8d]" : "text-gold"}`}>{signed(myScore.points)} point</p>
          ) : (
            <p className="mt-4 text-cream/50">Point kommer…</p>
          )}
          <p className="mt-4 text-cream/50">Kig op på storskærmen</p>
          {myScore && myScore.points > 0 && <Confetti seed={`me-${state.question_key}`} count={70} colors={[color, "#d9b97a", "#f8f4ea"]} />}
        </Center>
      ) : state.phase === "scoreboard" || state.phase === "finished" ? (
        <Center>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gold">{state.phase === "finished" ? "Slutstilling" : "Stilling"}</p>
          <p className="font-display text-6xl font-semibold">{myRank > 0 ? `Nr. ${myRank}` : "–"}</p>
          <p className="tabular text-xl text-cream/80">{myTotal} point</p>
          <p className="mt-4 text-cream/50">Kig op på storskærmen</p>
        </Center>
      ) : (
        <Center>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gold">
            Runde {state.current_round} · {state.round_title}
          </p>
          <p className="font-display text-4xl font-semibold">I er klar!</p>
          {state.point_multiplier > 1 && (
            <p className="animate-pop rounded-full bg-gold px-4 py-1.5 text-sm font-bold uppercase tracking-widest text-ink">{multiplierLabel(state.point_multiplier)}</p>
          )}
          <p className="text-cream/60">Kig op på storskærmen – næste spørgsmål kommer snart.</p>
        </Center>
      )}
    </main>
  );
}

function readLocal(key: string): { value: unknown; wager: number | null } {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") ?? { value: null, wager: null };
  } catch {
    return { value: null, wager: null };
  }
}

/** One question: renders the type's PlayInput; saves answers (debounced, last value wins) or uploads the drawing at lock. */
function AnswerArea({
  state,
  session,
  color,
  answered,
  lockedOnServer,
}: {
  state: GameState;
  session: Session;
  color: string;
  answered: boolean;
  lockedOnServer: boolean;
}) {
  const q = publicQuestion(state);
  const ui = REGISTRY[q.answerType];
  const storeKey = answerKey(session.teamId, q.key);
  const canvas = useRef<DrawingCanvasHandle>(null);

  const [local, setLocal] = useState(() => readLocal(storeKey));
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const dirty = useRef(false);
  const latest = useRef(local);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finished = useRef(false);

  // timer expiry (skew-compensated)
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    if (state.phase !== "countdown" || !state.timer_ends_at) return;
    const ms = Date.parse(state.timer_ends_at) - serverNow();
    const id = setTimeout(() => setExpired(true), Math.max(0, ms));
    return () => clearTimeout(id);
  }, [state.phase, state.timer_ends_at]);
  const timeUp = state.phase === "locked" || (state.phase === "countdown" && expired);
  // "Lås svar": the team froze its answer before the timer ran out
  const [lockedLocal, setLockedLocal] = useState(() => {
    try {
      return localStorage.getItem(`${storeKey}:locked`) === "1";
    } catch {
      return false;
    }
  });
  const locked = lockedLocal || lockedOnServer;
  const [locking, setLocking] = useState(false);
  const disabled = state.phase !== "countdown" || timeUp || locked || locking;

  const save = useCallback(async () => {
    const { value, wager } = latest.current;
    if (value === null || value === undefined) return;
    dirty.current = false;
    setStatus("saving");
    const { error: err } = await getSupabase().rpc("submit_answer", { p_team: session.teamId, p_value: value, p_wager: wager });
    if (err) {
      dirty.current = true;
      setStatus("error");
      setError(err.message);
    } else {
      setStatus("saved");
      setError(null);
    }
  }, [session.teamId]);

  const onChange = (value: unknown, wager?: number | null) => {
    const next = { value: value ?? latest.current.value, wager: wager === undefined ? latest.current.wager : wager };
    latest.current = next;
    setLocal(next);
    try {
      localStorage.setItem(storeKey, JSON.stringify(next));
    } catch {}
    dirty.current = true;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(save, 450);
  };

  /** draw: export the canvas → upload the PNG → register the answer. */
  const uploadDrawing = useCallback(async (lock = false): Promise<boolean> => {
    const c = canvas.current;
    if (!c) return false;
    if (!c.isDirty()) {
      if (lock) setError("Tegn noget først");
      else setStatus("empty");
      return false;
    }
    setStatus("saving");
    const sb = getSupabase();
    const path = `${session.gameId}/${q.key}/${session.teamId}.png`;
    let last = "";
    try {
      const blob = await c.toBlob();
      for (let attempt = 0; attempt < 4; attempt++) {
        if (attempt) await new Promise((r) => setTimeout(r, 700 * attempt));
        const up = await sb.storage.from("answers").upload(path, blob, { contentType: "image/png", upsert: false });
        const upErr = up.error as (Error & { statusCode?: string }) | null;
        if (upErr && upErr.statusCode !== "409" && !/exists|duplicate/i.test(upErr.message)) {
          last = upErr.message;
          continue;
        }
        const { error: err } = await sb.rpc(lock ? "lock_answer" : "submit_answer", { p_team: session.teamId, p_value: { path }, p_wager: null });
        if (err) {
          last = lockError(err.message);
          if (/låst/i.test(err.message)) break; // already locked – don't retry
          continue;
        }
        setStatus("saved");
        try {
          localStorage.removeItem("xmasquiz-canvas");
        } catch {}
        return true;
      }
      setStatus("error");
      setError(last);
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : String(e));
    }
    return false;
  }, [q.key, session.gameId, session.teamId]);

  /** "Lås svar": save the final answer and freeze it (drawings are handed in right away). */
  const lockAnswer = async () => {
    setLocking(true);
    setError(null);
    try {
      let ok = false;
      if (ui.submitOnLock) ok = await uploadDrawing(true);
      else {
        if (debounce.current) clearTimeout(debounce.current);
        const { value, wager } = latest.current;
        if (value === null || value === undefined) {
          setError("Vælg et svar først");
        } else {
          setStatus("saving");
          const { error: err } = await getSupabase().rpc("lock_answer", { p_team: session.teamId, p_value: value, p_wager: wager });
          if (err) {
            setStatus("error");
            setError(lockError(err.message));
          } else {
            dirty.current = false;
            setStatus("saved");
            ok = true;
          }
        }
      }
      if (ok) {
        setLockedLocal(true);
        try {
          localStorage.setItem(`${storeKey}:locked`, "1");
        } catch {}
      }
    } finally {
      setLocking(false);
    }
  };

  // at lock: flush the last value / upload the drawing (once)
  useEffect(() => {
    if (!timeUp || finished.current) return;
    finished.current = true;
    if (locked) return; // already handed in
    if (debounce.current) clearTimeout(debounce.current);
    const id = setTimeout(() => {
      if (ui.submitOnLock) uploadDrawing();
      else if (dirty.current) save();
    }, 0);
    return () => clearTimeout(id);
  }, [timeUp, locked, ui.submitOnLock, uploadDrawing, save]);

  const Input = ui.PlayInput;
  const banner =
    state.phase === "question"
      ? "Klar… I kan svare, når timeren starter"
      : locked
        ? "Låst 🔒 – venter på de andre"
        : timeUp
        ? status === "saving"
          ? ui.submitOnLock
            ? "Sender tegningen…"
            : "Gemmer…"
          : status === "empty"
            ? "Tiden er gået – intet afleveret"
            : status === "error"
              ? "Fejl ved aflevering"
              : answered || status === "saved"
                ? "Tiden er gået · svaret ✓"
                : "Tiden er gået"
        : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {typeof q.payload.country === "string" && /^[A-Z]{2}$/.test(q.payload.country) && (
        <div className="shrink-0">
          <CountryBanner code={q.payload.country} size="sm" />
        </div>
      )}
      {q.showTextOnPlay && q.text && (
        <p className={`shrink-0 text-center font-display font-semibold leading-tight ${q.text.length > 120 ? "text-xl" : "text-2xl sm:text-3xl"}`}>{q.text}</p>
      )}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <Input
          q={q}
          value={local.value}
          wager={local.wager}
          onChange={onChange}
          disabled={disabled}
          color={color}
          canvasRef={canvas}
          persistKey={ui.submitOnLock ? `${session.teamId}:${q.key}` : null}
        />
        {banner && (
          <div className="pointer-events-none absolute inset-x-0 top-1/2 z-[600] -translate-y-1/2 text-center">
            <span className="animate-pop inline-block rounded-full bg-pine-950/90 px-5 py-2.5 text-base font-semibold shadow-xl ring-1 ring-gold/40">{banner}</span>
          </div>
        )}
      </div>
      <div className="flex min-h-6 shrink-0 items-center justify-center gap-3 text-sm">
        {status === "error" ? (
          <>
            <span className="text-[#ffb4b6]">{error}</span>
            <button className="btn btn-ghost" onClick={() => (ui.submitOnLock ? uploadDrawing() : save())} disabled={locked}>
              Prøv igen
            </button>
          </>
        ) : locked && !timeUp ? (
          <span className="font-semibold text-gold">Jeres svar er låst 🔒</span>
        ) : !timeUp && state.phase === "countdown" ? (
          ui.submitOnLock ? (
            <span className="text-cream/50">Tegningen afleveres automatisk, når tiden er gået</span>
          ) : status === "saving" ? (
            <span className="text-cream/60">Gemmer…</span>
          ) : status === "saved" || answered ? (
            <span className="text-emerald-300">Svar gemt ✓ – I kan ændre det, indtil tiden er gået</span>
          ) : (
            <span className="text-cream/50">Vælg jeres svar</span>
          )
        ) : null}
      </div>
      {state.phase === "countdown" && !timeUp && !locked && (ui.submitOnLock || local.value !== null) && (
        <LockButton busy={locking} onLock={lockAnswer} drawing={!!ui.submitOnLock} />
      )}
    </div>
  );
}

function lockError(msg: string) {
  if (/lock_answer|function|schema cache/i.test(msg)) return "Låsning er ikke slået til endnu (databasen mangler en opdatering)";
  return msg;
}

/** Two-tap lock: first tap arms (3 s), second tap locks for good. */
function LockButton({ busy, onLock, drawing }: { busy: boolean; onLock: () => void; drawing: boolean }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const id = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(id);
  }, [armed]);
  return (
    <button
      className={`btn h-14 shrink-0 text-lg ${armed ? "btn-danger bg-alarm/20" : "btn-gold"}`}
      disabled={busy}
      onClick={() => {
        if (!armed) return setArmed(true);
        setArmed(false);
        onLock();
      }}
    >
      {busy ? (drawing ? "Afleverer…" : "Låser…") : armed ? "Tryk igen for at låse – kan ikke fortrydes" : drawing ? "Aflevér og lås tegningen 🔒" : "Lås svar 🔒"}
    </button>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="animate-fade-up flex flex-1 flex-col items-center justify-center gap-2 text-center">{children}</div>;
}

function MiniTimer({ endsAt, total }: { endsAt: string | null; total: number | null }) {
  const ms = useCountdown(endsAt);
  const secs = Math.ceil(ms / 1000);
  const urgent = secs <= 10;
  const frac = total ? ms / (total * 1000) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-pine-800 sm:w-40">
        <div className={`h-full rounded-full ${urgent ? "bg-alarm" : "bg-gold"}`} style={{ width: `${Math.max(0, Math.min(1, frac)) * 100}%` }} />
      </div>
      <span className={`tabular w-10 text-right text-2xl font-bold ${urgent ? "animate-pulse text-[#ff8a8d]" : "text-cream"}`}>{secs}</span>
    </div>
  );
}
