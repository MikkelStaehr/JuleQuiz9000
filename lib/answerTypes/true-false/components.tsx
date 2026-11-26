"use client";

import { useEffect, useRef } from "react";
import { chime } from "@/lib/sound";
import { signed, teamColor } from "@/lib/types";
import { DEFAULT_LABELS } from "../meta";
import type { TrueFalseLabels } from "../types";
import type { AdminViewProps, DisplayQuestionProps, PlayInputProps, RevealProps } from "../ui";
import { tfChoice } from "./score";

const WAGERS = [1, 2, 3];
const labelsOf = (p: Record<string, unknown> | null | undefined) => (p?.labels as TrueFalseLabels | undefined) ?? DEFAULT_LABELS;
const OPTIONS = [true, false] as const;

/** Two big buttons (round labels, e.g. LOVLIGT/ULOVLIGT) + wager 1/2/3 if the round has wagerEnabled. */
export function TrueFalsePlayInput({ q, value, wager, onChange, disabled }: PlayInputProps) {
  const labels = labelsOf(q.payload);
  const wagerEnabled = q.payload.wagerEnabled === true;
  const current = tfChoice(value);
  const w = wager ?? 1;
  return (
    <div className="flex flex-1 flex-col justify-center gap-5">
      <div className="grid grid-cols-2 gap-3">
        {OPTIONS.map((opt) => {
          const on = current === opt;
          return (
            <button
              key={String(opt)}
              disabled={disabled}
              onClick={() => onChange({ choice: opt }, wagerEnabled ? w : null)}
              aria-pressed={on}
              className={`h-36 rounded-2xl border-2 px-2 text-2xl font-black tracking-wider transition active:scale-[0.98] disabled:opacity-60 sm:h-48 sm:text-4xl ${
                on
                  ? opt
                    ? "border-emerald-300 bg-emerald-400 text-ink"
                    : "border-[#ff8a8d] bg-alarm text-cream"
                  : "border-gold/30 bg-pine-900/70 text-cream hover:border-gold/70"
              }`}
            >
              {opt ? labels.true : labels.false}
            </button>
          );
        })}
      </div>
      {wagerEnabled && (
        <div className="space-y-2 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold">Satsning</p>
          <div className="flex justify-center gap-2">
            {WAGERS.map((n) => (
              <button
                key={n}
                disabled={disabled}
                onClick={() => onChange(current === null ? null : { choice: current }, n)}
                aria-pressed={w === n}
                className={`h-14 w-20 rounded-xl text-xl font-bold transition disabled:opacity-60 ${
                  w === n ? "bg-gold text-ink" : "border border-gold/30 text-gold-soft hover:border-gold/60"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="text-xs text-cream/50">
            Rigtigt = +{w} point · forkert = −{w} point
          </p>
        </div>
      )}
    </div>
  );
}

/** The two labels as big chips under the question on the display. */
export function TrueFalseDisplayQuestion({ q, compact }: DisplayQuestionProps) {
  const labels = labelsOf(q.payload);
  return (
    <div className={`flex flex-col items-center gap-[1.5vh] ${compact ? "mt-[1vh]" : "mt-[4vh]"}`}>
      <div className="flex justify-center gap-[3vw]">
        {OPTIONS.map((opt) => (
          <span
            key={String(opt)}
            className={`rounded-[1.2vmin] border-2 px-[3vw] py-[1.5vh] font-black tracking-[0.15em] ${compact ? "text-[2vw]" : "text-[3.2vw]"} ${
              opt ? "border-emerald-300/70 text-emerald-200" : "border-[#ff8a8d]/70 text-[#ffb4b6]"
            }`}
          >
            {opt ? labels.true : labels.false}
          </span>
        ))}
      </div>
      {q.payload.wagerEnabled === true && !compact && (
        <p className="text-[1.6vw] text-gold/80">Sats 1–3 point · forkert svar koster det samme</p>
      )}
    </div>
  );
}

/** Step 1: all choices flip at once · 2: facit + point change per team · 3: revealMediaUrl (if set). */
export function TrueFalseReveal({ reveal, answerText, step, teams, answers, scoreFor, totals }: RevealProps) {
  const labels = labelsOf(reveal);
  const facit = reveal.answer as boolean;
  const media = reveal.revealMediaUrl as string | null;
  const cols = teams.length <= 4 ? teams.length || 1 : 4;

  const chimed = useRef(false);
  useEffect(() => {
    if (step >= 2 && !chimed.current) {
      chimed.current = true;
      chime();
    }
  }, [step]);

  if (step >= 3 && media)
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-[2vh]">
        <p className="text-[1.6vw] uppercase tracking-[0.3em] text-gold">Facit: {answerText}</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={media} alt="" className="animate-pop max-h-[72vh] max-w-[84vw] rounded-[1.2vmin] object-contain ring-1 ring-gold/30" />
      </div>
    );

  return (
    <div className="flex w-full flex-1 flex-col items-center justify-center gap-[3vh]">
      <div className={`rounded-[1.6vmin] px-[4vmin] py-[1.4vmin] text-center ${step >= 2 ? "fun-drop-in bg-gold text-ink shadow-[0_0_6vmin_rgba(217,185,122,0.5)]" : "invisible"}`}>
        <span className="block text-[min(1.8vw,2.6vh)] font-semibold uppercase tracking-[0.3em]">Facit</span>
        <span className="block text-[min(8vw,11vh)] font-black leading-none tracking-wider">{answerText}</span>
      </div>
      <div className="grid w-[88vw] gap-[1.6vw]" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {teams.map((t, i) => {
          const a = answers.find((x) => x.team_id === t.id);
          const c = tfChoice(a?.value);
          const right = c !== null && c === facit;
          const s = scoreFor(t.id);
          return (
            <div key={t.id} className={`[perspective:1200px] ${step >= 2 && c !== null ? (right ? "fun-hop" : "fun-nope") : ""}`}>
              <div
                className="relative h-[24vh] transition-transform duration-700 [transform-style:preserve-3d]"
                style={{ transform: step >= 1 ? "rotateY(180deg)" : "none", transitionDelay: `${i * 80}ms` }}
              >
                <div className="absolute inset-0 grid place-items-center rounded-[1.2vmin] bg-pine-800 ring-1 ring-gold/30 [backface-visibility:hidden]">
                  <span className="text-[2vw] font-semibold">{t.name}</span>
                </div>
                <div
                  className={`absolute inset-0 flex flex-col items-center justify-center gap-[0.8vh] rounded-[1.2vmin] transition-colors duration-500 [backface-visibility:hidden] [transform:rotateY(180deg)] ${
                    step >= 2 ? (c === null ? "bg-pine-900 ring-1 ring-gold/20" : right ? "bg-emerald-400 text-ink" : "bg-alarm text-cream") : "bg-cream text-ink"
                  }`}
                  style={{ boxShadow: `inset 0 0.6vh 0 ${teamColor(t.slot)}` }}
                >
                  <span className="max-w-[90%] truncate text-[1.6vw] font-semibold">{t.name}</span>
                  <span className="text-[2.6vw] font-black tracking-wider">{c === null ? "–" : c ? labels.true : labels.false}</span>
                  {a?.wager ? <span className="text-[1.3vw] opacity-75">sats {a.wager}</span> : c === null ? <span className="text-[1.3vw] opacity-60">intet svar</span> : null}
                  {step >= 2 && (
                    <span className="animate-pop tabular text-[2.4vw] font-black">
                      {s ? signed(s.points) : "0"} <span className="text-[1.2vw] font-semibold opacity-70">({totals.get(t.id) ?? 0} p)</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function TrueFalseAdminView({ q, teams, answers }: AdminViewProps) {
  const labelOf = (c: boolean | null) => (c === null ? "–" : c ? q.labels.true : q.labels.false);
  return (
    <div className="space-y-2 text-sm">
      <div className="flex gap-4 text-xs text-cream/60">
        {OPTIONS.map((o) => (
          <span key={String(o)}>
            {labelOf(o)}: <b className="text-cream">{answers.filter((a) => tfChoice(a.value) === o).length}</b>
          </span>
        ))}
        {q.wagerEnabled && <span className="text-gold/70">satsning slået til</span>}
      </div>
      <ul className="space-y-1">
        {teams.map((t) => {
          const a = answers.find((x) => x.team_id === t.id);
          const c = tfChoice(a?.value);
          return (
            <li key={t.id} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: teamColor(t.slot) }} />
              <span className="flex-1 truncate">{t.name}</span>
              <span className={`font-semibold ${c === null ? "text-cream/40" : c === q.answer ? "text-emerald-300" : "text-[#ffb4b6]"}`}>{labelOf(c)}</span>
              <span className="tabular w-14 text-right text-cream/60">{q.wagerEnabled && c !== null ? `sats ${a?.wager ?? 1}` : ""}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
