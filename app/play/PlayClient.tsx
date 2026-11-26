"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { DrawingCanvas, type DrawingCanvasHandle } from "@/components/DrawingCanvas";
import { Wordmark } from "@/components/Brand";
import { serverNow, useClockSync, useCountdown } from "@/lib/clock";
import { getSupabase, publicImageUrl } from "@/lib/supabase/browser";
import { rankTeams, useGame } from "@/lib/useGame";
import { answerPath, formatScaleValue, multiplierLabel, stateScale } from "@/lib/types";

interface Session {
  code: string;
  name: string;
  teamId: string;
  gameId: string;
}

type SubmitStatus = "idle" | "uploading" | "submitted" | "empty" | "error";

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
        lock = await (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<typeof lock> } }).wakeLock?.request("screen") ?? null;
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

  if (booting) return <Shell><p className="text-center text-cream/60">Forbinder…</p></Shell>;
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
          <input
            className="field text-lg"
            maxLength={40}
            placeholder="Fx Nissebanden"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
        {error && <p className="text-sm text-[#ffb4b6]">{error}</p>}
        <button className="btn btn-gold w-full py-3.5 text-base" disabled={busy || code.length !== 4 || !name.trim()}>
          {busy ? "Tilmelder…" : "Deltag"}
        </button>
      </form>
    </Shell>
  );
}

function TeamScreen({ session, onLeave }: { session: Session; onLeave: () => void }) {
  const { state, teams, answers, scores, totals } = useGame(session.gameId);
  const canvas = useRef<DrawingCanvasHandle>(null);
  const qKey = state?.question_key ?? null;
  const phase = state?.phase ?? "idle";
  const scale = stateScale(state);
  const scaleSig = scale ? `${scale.min}|${scale.max}|${scale.unit}` : "";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const scaleMemo = useMemo(() => scale, [scaleSig]);
  const [liveValue, setLiveValue] = useState<{ qKey: string | null; v: number | null }>({ qKey: null, v: null });

  const [sub, setSub] = useState<{ qKey: string | null; status: SubmitStatus; error?: string }>({ qKey: null, status: "idle" });
  const status: SubmitStatus = sub.qKey === qKey ? sub.status : "idle";
  const mine = answers.find((a) => a.team_id === session.teamId);
  const submitted = !!mine || status === "submitted";
  const busy = useRef<string | null>(null);

  // Timer expiry computed locally (skew-compensated)
  const [expiredFor, setExpiredFor] = useState<string | null>(null);
  useEffect(() => {
    if (phase !== "countdown" || !state?.timer_ends_at) return;
    const tag = `${qKey}@${state.timer_ends_at}`;
    const ms = Date.parse(state.timer_ends_at) - serverNow();
    const id = setTimeout(() => setExpiredFor(tag), Math.max(0, ms));
    return () => clearTimeout(id);
  }, [phase, state?.timer_ends_at, qKey]);
  const timeUp =
    (phase === "countdown" && expiredFor === `${qKey}@${state?.timer_ends_at}`) || phase === "locked";

  const submit = useCallback(
    async (manual: boolean) => {
      if (!qKey || busy.current === qKey || submitted) return;
      const c = canvas.current;
      if (!c) return;
      if (!manual && !c.isDirty()) {
        setSub({ qKey, status: "empty" });
        return;
      }
      busy.current = qKey;
      setSub({ qKey, status: "uploading" });
      const sb = getSupabase();
      const path = answerPath(session.gameId, qKey, session.teamId);
      let lastErr = "";
      try {
        const blob = await c.toBlob();
        const scaleValue = c.scaleValue();
        for (let attempt = 0; attempt < 4; attempt++) {
          if (attempt) await new Promise((r) => setTimeout(r, 700 * attempt));
          const up = await sb.storage.from("answers").upload(path, blob, { contentType: "image/png", upsert: false });
          const upErr = up.error as (Error & { statusCode?: string }) | null;
          if (upErr && upErr.statusCode !== "409" && !/exists|duplicate/i.test(upErr.message)) {
            lastErr = upErr.message;
            continue;
          }
          const ins = await sb
            .from("answers")
            .insert({
              game_id: session.gameId,
              team_id: session.teamId,
              question_key: qKey,
              image_path: path,
              scale_value: scaleValue,
            });
          if (ins.error && ins.error.code !== "23505") {
            lastErr = ins.error.message;
            continue;
          }
          setSub({ qKey, status: "submitted" });
          try {
            localStorage.removeItem("xmasquiz-canvas");
          } catch {}
          return;
        }
        setSub({ qKey, status: "error", error: lastErr });
      } catch (e) {
        setSub({ qKey, status: "error", error: e instanceof Error ? e.message : String(e) });
      } finally {
        busy.current = null;
      }
    },
    [qKey, submitted, session.gameId, session.teamId],
  );

  // Auto-submit when the timer hits 0 or the quizmaster locks.
  useEffect(() => {
    if (!(timeUp && !submitted && status === "idle")) return;
    const id = setTimeout(() => submit(false), 0);
    return () => clearTimeout(id);
  }, [timeUp, submitted, status, submit]);

  const myTotal = totals.get(session.teamId) ?? 0;
  const myPoints = scores.find((s) => s.team_id === session.teamId && s.question_key === qKey)?.points;
  const ranked = rankTeams(teams, totals);
  const myRank = ranked.findIndex((t) => t.id === session.teamId) + 1;

  const drawing = phase === "countdown" && !timeUp && !submitted && status !== "uploading";
  const showCanvas = phase === "question" || phase === "countdown" || phase === "locked";

  return (
    <main className="no-overscroll flex h-[100dvh] flex-col gap-3 overflow-hidden p-3 sm:p-5">
      <header className="flex shrink-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold leading-tight">{session.name}</p>
          <p className="tabular text-xs text-gold">{myTotal} point{myRank > 0 && ` · nr. ${myRank}`}</p>
        </div>
        {phase === "countdown" && !timeUp && <MiniTimer endsAt={state!.timer_ends_at} total={state!.timer_seconds} />}
        <button
          onClick={() => confirm("Forlad holdet på denne enhed?") && onLeave()}
          className="shrink-0 text-xs text-cream/40 underline-offset-2 hover:underline"
        >
          Skift hold
        </button>
      </header>

      {!state ? (
        <Center>Forbinder til spillet…</Center>
      ) : showCanvas ? (
        <>
          <p className="shrink-0 text-center font-display text-2xl font-semibold leading-tight sm:text-3xl">
            {state.question_text}
          </p>
          <div className="relative min-h-0 flex-1">
            <DrawingCanvas
              key={qKey}
              ref={canvas}
              disabled={!drawing}
              persistKey={qKey ? `${session.teamId}:${qKey}` : null}
              scale={scaleMemo}
              onStroke={() => setLiveValue({ qKey, v: canvas.current?.scaleValue() ?? null })}
            />
            {!drawing && (
              <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center">
                <span className="animate-pop inline-block rounded-full bg-pine-950/90 px-5 py-2.5 text-base font-semibold shadow-xl ring-1 ring-gold/40">
                  {phase === "question"
                    ? "Klar… tegningen starter med timeren"
                    : submitted
                      ? "Afleveret ✓"
                      : status === "uploading"
                        ? "Sender tegning…"
                        : status === "empty"
                          ? "Tiden er gået – intet afleveret"
                          : status === "error"
                            ? "Fejl ved aflevering"
                            : "Tiden er gået"}
                </span>
              </div>
            )}
          </div>
          {scale && (
            <p className="shrink-0 text-center text-sm text-cream/70">
              {liveValue.qKey === qKey && liveValue.v !== null ? (
                <>
                  Jeres kryds: <span className="font-bold text-gold">{formatScaleValue(liveValue.v, scale)}</span>
                </>
              ) : (
                "Sæt ét kryds på skalaen – midten af krydset tæller"
              )}
            </p>
          )}
          {status === "error" && (
            <div className="flex shrink-0 items-center justify-center gap-3 text-sm text-[#ffb4b6]">
              {sub.error}
              <button className="btn btn-ghost" onClick={() => { setSub({ qKey, status: "idle" }); submit(true); }}>
                Prøv igen
              </button>
            </div>
          )}
          {phase === "countdown" && !submitted && !timeUp && (
            <SendButton disabled={status === "uploading"} onSend={() => submit(true)} />
          )}
        </>
      ) : phase === "reveal" ? (
        <Center>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gold">Facit</p>
          <p className="font-display text-4xl font-semibold">{state.answer_text}</p>
          {mine && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={publicImageUrl(mine.image_path, mine.submitted_at)}
              alt="Jeres tegning"
              className="mt-4 max-h-[40vh] rounded-xl bg-white ring-1 ring-gold/30"
            />
          )}
          {mine && mine.scale_value !== null && scale && (
            <p className="text-cream/70">
              Jeres gæt: <span className="font-semibold text-cream">{formatScaleValue(mine.scale_value, scale)}</span>
            </p>
          )}
          {myPoints !== undefined && (
            <p className="animate-pop mt-4 text-3xl font-bold text-gold">+{myPoints} point</p>
          )}
        </Center>
      ) : phase === "scoreboard" || phase === "finished" ? (
        <Center>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gold">
            {phase === "finished" ? "Slutstilling" : "Stilling"}
          </p>
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
            <p className="animate-pop rounded-full bg-gold px-4 py-1.5 text-sm font-bold uppercase tracking-widest text-ink">
              {multiplierLabel(state.point_multiplier)}
            </p>
          )}
          <p className="text-cream/60">Kig op på storskærmen – næste spørgsmål kommer snart.</p>
        </Center>
      )}
    </main>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="animate-fade-up flex flex-1 flex-col items-center justify-center gap-2 text-center">{children}</div>;
}

/** Two-tap send: first tap arms, second tap (within 3 s) sends. */
function SendButton({ disabled, onSend }: { disabled: boolean; onSend: () => void }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const id = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(id);
  }, [armed]);
  return (
    <button
      className={`btn h-14 shrink-0 text-lg ${armed ? "btn-danger bg-alarm/20" : "btn-gold"}`}
      disabled={disabled}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onSend();
        } else setArmed(true);
      }}
    >
      {armed ? "Tryk igen for at sende – kan ikke fortrydes" : "Send svar"}
    </button>
  );
}

function MiniTimer({ endsAt, total }: { endsAt: string | null; total: number | null }) {
  const ms = useCountdown(endsAt);
  const secs = Math.ceil(ms / 1000);
  const urgent = secs <= 10;
  const frac = total ? ms / (total * 1000) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-pine-800 sm:w-40">
        <div
          className={`h-full rounded-full ${urgent ? "bg-alarm" : "bg-gold"}`}
          style={{ width: `${Math.max(0, Math.min(1, frac)) * 100}%` }}
        />
      </div>
      <span className={`tabular w-10 text-right text-2xl font-bold ${urgent ? "animate-pulse text-[#ff8a8d]" : "text-cream"}`}>
        {secs}
      </span>
    </div>
  );
}
