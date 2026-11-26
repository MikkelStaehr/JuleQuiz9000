"use client";

import { useEffect, useRef } from "react";
import { rankByDistance } from "@/lib/ranking";
import { chime } from "@/lib/sound";
import { publicImageUrl } from "@/lib/supabase/browser";
import { signed, teamColor, type AnswerValue, type Team } from "@/lib/types";
import { formatNumber } from "../meta";
import type { ClosestJudgment, PartsJudgment } from "../types";
import type { RevealProps } from "../ui";
import { drawPath } from "./score";

type Entry = { team: Team; answer: AnswerValue; path: string };

/**
 * Steps: 1…n one drawing at a time (zoom-in) · n+1 all in a grid (closest: read value under each)
 *        · n+2 facit (animated) + points · n+3 ranking (closest only).
 */
export default function DrawReveal({ reveal, answerText, step, teams, answers, scoreFor, totals }: RevealProps) {
  const scoring = reveal.scoring as string;
  const unit = (reveal.unit as string) ?? "";
  const parts = (reveal.parts as string[]) ?? [];
  const facit = reveal.answer;
  const entries: Entry[] = teams.flatMap((t) => {
    const a = answers.find((x) => x.team_id === t.id);
    const path = drawPath(a?.value);
    return a && path ? [{ team: t, answer: a, path }] : [];
  });
  const n = entries.length;
  const facitStep = n + 2;
  const rankStep = n + 3;

  const chimed = useRef(false);
  useEffect(() => {
    if (step >= facitStep && !chimed.current) {
      chimed.current = true;
      const id = setTimeout(chime, 500);
      return () => clearTimeout(id);
    }
  }, [step, facitStep]);

  // ── one at a time ──
  if (step >= 1 && step <= n) {
    const e = entries[step - 1];
    return (
      <div key={step} className="flex min-h-0 flex-1 flex-col items-center justify-center gap-[2vh] px-[3vw] pb-[3vh]">
        <div className="drawing-zoom relative w-[min(80vw,calc(70vh*10/7))] overflow-hidden rounded-[1.4vmin] bg-white shadow-[0_3vh_8vh_-3vh_rgba(0,0,0,0.8)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={publicImageUrl(e.path, e.answer.submitted_at)} alt={`Tegning fra ${e.team.name}`} className="aspect-[10/7] w-full object-contain" />
        </div>
        <p className="animate-fade-up flex items-center gap-[1vw] text-[2.6vw] font-semibold" style={{ animationDelay: "300ms" }}>
          <span className="h-[1.4vw] w-[1.4vw] rounded-full" style={{ background: teamColor(e.team.slot) }} />
          {e.team.name}
          <span className="tabular text-[1.4vw] text-cream/40">
            {step} / {n}
          </span>
        </p>
      </div>
    );
  }

  const read = (a: AnswerValue) => {
    const j = (a.judgment ?? {}) as ClosestJudgment;
    return j.invalid ? null : typeof j.read === "number" ? j.read : null;
  };

  // ── ranking (closest) ──
  if (scoring === "closest" && step >= rankStep) {
    const ranked = rankByDistance(
      teams.map((t) => {
        const e = entries.find((x) => x.team.id === t.id);
        const r = e ? read(e.answer) : null;
        return { teamId: t.id, distance: r === null ? null : Math.abs(r - Number(facit)) };
      }),
      [],
      1,
      1e-9,
    );
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-[2vh]">
        <p className="rounded-full bg-gold px-[2vw] py-[0.8vh] text-[2vw] font-bold text-ink">Facit: {answerText}</p>
        <ol className="animate-fade-up grid w-[80vw] grid-cols-2 gap-x-[2vw] gap-y-[1vh]">
          {ranked.map((r) => {
            const t = teams.find((x) => x.id === r.teamId)!;
            const e = entries.find((x) => x.team.id === r.teamId);
            const v = e ? read(e.answer) : null;
            const s = scoreFor(r.teamId);
            return (
              <li key={r.teamId} className="flex items-center gap-[1vw] rounded-[1vh] bg-pine-900/85 px-[1.2vw] py-[1vh] text-[1.5vw] ring-1 ring-gold/15">
                <span className="tabular w-[2.4vw] font-bold text-gold">{r.rank ?? "–"}</span>
                <span className="h-[1vw] w-[1vw] rounded-full" style={{ background: teamColor(t.slot) }} />
                <span className="min-w-0 flex-1 truncate font-semibold">{t.name}</span>
                <span className="tabular text-cream/70">
                  {v === null ? (e ? "ugyldig" : "ingen tegning") : `${formatNumber(v, unit)} (±${formatNumber(r.distance!)})`}
                </span>
                <span className="tabular w-[4vw] text-right font-bold text-gold">{s ? signed(s.points) : ""}</span>
                <span className="tabular w-[4vw] text-right text-cream/40">{totals.get(r.teamId) ?? 0} p</span>
              </li>
            );
          })}
        </ol>
      </div>
    );
  }

  // ── grid (+ facit) ──
  const showFacit = step >= facitStep;
  const cols = n <= 2 ? Math.max(1, n) : n <= 4 ? 2 : n <= 6 ? 3 : 4;
  const rows = Math.ceil(Math.max(1, n) / cols);
  const cardW = `((${(66 / rows).toFixed(2)}vh - 7vh) / 0.7)`;
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center gap-[2vh] px-[3vw] pb-[3vh]">
      <div className={`rounded-[1.2vmin] px-[2.4vw] py-[1vh] ${showFacit ? "animate-pop bg-gold text-ink" : "invisible"}`}>
        <span className="mr-[1vw] text-[1.2vw] font-semibold uppercase tracking-[0.25em]">Facit</span>
        <span className="text-[2.6vw] font-black">{answerText}</span>
      </div>
      {n === 0 && <p className="text-[2vw] text-cream/50">Ingen tegninger afleveret</p>}
      <div
        className="grid w-full min-h-0 flex-1 content-center gap-[1.2vw]"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, maxWidth: `min(94vw, calc(${cols} * ${cardW} + ${cols - 1} * 1.2vw))` }}
      >
        {entries.map((e, i) => {
          const s = scoreFor(e.team.id);
          const j = (e.answer.judgment ?? {}) as ClosestJudgment & PartsJudgment;
          return (
            <figure
              key={e.team.id}
              className="animate-pop flex flex-col overflow-hidden rounded-[1.1vmin] bg-cream text-ink shadow-[0_2vmin_5vmin_-2vmin_rgba(0,0,0,0.7)]"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <div className="relative aspect-[10/7] w-full bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={publicImageUrl(e.path, e.answer.submitted_at)} alt={`Tegning fra ${e.team.name}`} className="absolute inset-0 h-full w-full object-contain" />
                {showFacit && s && (
                  <span className={`animate-pop tabular absolute right-[4%] top-[5%] rounded-full px-[0.8vw] py-[0.3vw] text-[1.4vw] font-bold shadow-md ${s.points > 0 ? "bg-gold text-ink" : "bg-ink/80 text-cream"}`}>
                    {signed(s.points)}
                  </span>
                )}
              </div>
              <figcaption className="flex items-center justify-between gap-2 border-t border-ink/10 px-[1vw] py-[0.6vw]" style={{ boxShadow: `inset 0.5vw 0 0 ${teamColor(e.team.slot)}` }}>
                <span className="truncate text-[1.4vw] font-semibold">{e.team.name}</span>
                {scoring === "closest" ? (
                  <span className="tabular shrink-0 text-[1.4vw] font-bold text-gold-deep">
                    {j.invalid ? "ugyldig" : typeof j.read === "number" ? formatNumber(j.read, unit) : "?"}
                  </span>
                ) : scoring === "manual-parts" && showFacit ? (
                  <span className="flex shrink-0 gap-[0.4vw] text-[1.1vw] font-semibold">
                    {parts.map((p, pi) => (
                      <span key={p} className={(j.parts ?? [])[pi] ? "text-emerald-700" : "text-alarm line-through"}>
                        {p}
                      </span>
                    ))}
                  </span>
                ) : (
                  <span className="tabular shrink-0 text-[1.3vw] text-ink/50">{totals.get(e.team.id) ?? 0} p</span>
                )}
              </figcaption>
            </figure>
          );
        })}
      </div>
    </div>
  );
}
