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
 * Steps: 1 facit (big) · 2…n+1 one drawing at a time, compared with the facit (closest: read value + deviation, points)
 *        · n+2 all drawings in a grid with points · n+3 ranking (closest only).
 */
export default function DrawReveal({ reveal, answerText, step, teams, answers, scoreFor, totals }: RevealProps) {
  const scoring = reveal.scoring as string;
  const unit = (reveal.unit as string) ?? "";
  const parts = (reveal.parts as string[]) ?? [];
  const facit = Number(reveal.answer);
  const entries: Entry[] = teams.flatMap((t) => {
    const a = answers.find((x) => x.team_id === t.id);
    const path = drawPath(a?.value);
    return a && path ? [{ team: t, answer: a, path }] : [];
  });
  const n = entries.length;
  const gridStep = n + 2;
  const rankStep = n + 3;

  const chimed = useRef(false);
  useEffect(() => {
    if (step >= 1 && !chimed.current) {
      chimed.current = true;
      const id = setTimeout(chime, 400);
      return () => clearTimeout(id);
    }
  }, [step]);

  const read = (a: AnswerValue) => {
    const j = (a.judgment ?? {}) as ClosestJudgment;
    return j.invalid ? null : typeof j.read === "number" ? j.read : null;
  };

  // ── 1: facit first, big ──
  if (step <= 1)
    return (
      <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-[3vh]">
        <div className="fun-drop-in rounded-[2vmin] bg-gold px-[6vmin] py-[3vmin] text-center text-ink shadow-[0_0_8vmin_rgba(217,185,122,0.55)]">
          <span className="block text-[min(2.4vw,3.4vh)] font-semibold uppercase tracking-[0.35em]">Facit</span>
          <span className="block text-[min(13vw,18vh)] font-black leading-none">{answerText}</span>
        </div>
        {n > 0 && (
          <p className="fun-pop-late text-[min(2.2vw,3.2vh)] text-cream/70">
            {scoring === "closest" ? "Hvem kom tættest på? Lad os se tegningerne…" : "Lad os se, hvad I har tegnet…"}
          </p>
        )}
      </div>
    );

  // compact facit bar shown above the drawings
  const facitBar = (
    <div className="shrink-0 rounded-[1.4vmin] bg-gold px-[3vmin] py-[0.8vmin] text-center text-ink shadow-[0_0_4vmin_rgba(217,185,122,0.4)]">
      <span className="mr-[2vmin] align-middle text-[min(1.6vw,2.3vh)] font-semibold uppercase tracking-[0.25em]">Facit</span>
      <span className="align-middle text-[min(4.5vw,6.5vh)] font-black leading-tight">{answerText}</span>
    </div>
  );

  // ── 2…n+1: one drawing at a time ──
  if (step >= 2 && step <= n + 1) {
    const e = entries[step - 2];
    const s = scoreFor(e.team.id);
    const v = read(e.answer);
    const j = (e.answer.judgment ?? {}) as ClosestJudgment & PartsJudgment;
    return (
      <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-[2vh] px-[3vw] pb-[2vh]">
        {facitBar}
        <div key={step} className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-[1.5vh]">
          <div className="drawing-zoom relative w-[min(78vw,calc(58vh*10/7))] overflow-hidden rounded-[1.4vmin] bg-white shadow-[0_3vh_8vh_-3vh_rgba(0,0,0,0.8)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={publicImageUrl(e.path, e.answer.submitted_at)} alt={`Tegning fra ${e.team.name}`} className="aspect-[10/7] w-full object-contain" />
            {s && (
              <span
                className={`fun-pop-late tabular absolute right-[3%] top-[4%] rounded-full px-[1.6vmin] py-[0.6vmin] text-[min(3.4vw,5vh)] font-black shadow-lg ${
                  s.points > 0 ? "bg-gold text-ink" : "bg-ink/85 text-cream"
                }`}
              >
                {signed(s.points)}
              </span>
            )}
          </div>
          <div className="animate-fade-up flex flex-wrap items-center justify-center gap-x-[2vw] gap-y-[0.5vh]" style={{ animationDelay: "300ms" }}>
            <span className="flex items-center gap-[1vw] text-[min(3vw,4.4vh)] font-semibold">
              <span className="h-[min(1.6vw,2.4vh)] w-[min(1.6vw,2.4vh)] rounded-full" style={{ background: teamColor(e.team.slot) }} />
              {e.team.name}
            </span>
            {scoring === "closest" && (
              <span className="tabular text-[min(3vw,4.4vh)] font-bold text-gold">
                {j.invalid ? "ugyldig" : v === null ? "?" : `${formatNumber(v, unit)}`}
                {v !== null && <span className="ml-[1vw] text-[0.6em] font-semibold text-cream/60">±{formatNumber(Math.abs(v - facit))}</span>}
              </span>
            )}
            {scoring === "manual-parts" && (
              <span className="flex gap-[1vw] text-[min(2.4vw,3.4vh)] font-semibold">
                {parts.map((p, pi) => (
                  <span key={p} className={(j.parts ?? [])[pi] ? "text-emerald-300" : "text-[#ff8a8d] line-through"}>
                    {(j.parts ?? [])[pi] ? "✓" : "✗"} {p}
                  </span>
                ))}
              </span>
            )}
            <span className="tabular text-[min(1.6vw,2.4vh)] text-cream/40">
              {step - 1} / {n}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // ── n+3: ranking (closest) ──
  if (scoring === "closest" && step >= rankStep) {
    const ranked = rankByDistance(
      teams.map((t) => {
        const e = entries.find((x) => x.team.id === t.id);
        const r = e ? read(e.answer) : null;
        return { teamId: t.id, distance: r === null ? null : Math.abs(r - facit) };
      }),
      [],
      1,
      1e-9,
    );
    return (
      <div className="flex w-full flex-1 flex-col items-center justify-center gap-[2.5vh]">
        {facitBar}
        <ol className="animate-fade-up grid w-[84vw] grid-cols-2 gap-x-[2vw] gap-y-[1.2vh]">
          {ranked.map((r) => {
            const t = teams.find((x) => x.id === r.teamId)!;
            const e = entries.find((x) => x.team.id === r.teamId);
            const v = e ? read(e.answer) : null;
            const s = scoreFor(r.teamId);
            return (
              <li key={r.teamId} className={`flex items-center gap-[1vw] rounded-[1vh] bg-pine-900/85 px-[1.2vw] py-[1.2vh] text-[min(1.8vw,2.6vh)] ring-1 ring-gold/15 ${r.rank === 1 ? "fun-rank-up ring-2 ring-gold" : ""}`}>
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

  // ── n+2: all drawings in a grid ──
  const cols = n <= 2 ? Math.max(1, n) : n <= 4 ? 2 : n <= 6 ? 3 : 4;
  const rows = Math.ceil(Math.max(1, n) / cols);
  const cardW = `((${(62 / rows).toFixed(2)}vh - 7vh) / 0.7)`;
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-[2vh] px-[3vw] pb-[3vh]">
      {facitBar}
      {n === 0 && step >= gridStep && <p className="text-[2vw] text-cream/50">Ingen tegninger afleveret</p>}
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
                {s && (
                  <span className={`animate-pop tabular absolute right-[4%] top-[5%] rounded-full px-[0.8vw] py-[0.3vw] text-[1.6vw] font-bold shadow-md ${s.points > 0 ? "bg-gold text-ink" : "bg-ink/80 text-cream"}`}>
                    {signed(s.points)}
                  </span>
                )}
              </div>
              <figcaption className="flex items-center justify-between gap-2 border-t border-ink/10 px-[1vw] py-[0.6vw]" style={{ boxShadow: `inset 0.5vw 0 0 ${teamColor(e.team.slot)}` }}>
                <span className="truncate text-[1.5vw] font-semibold">{e.team.name}</span>
                {scoring === "closest" ? (
                  <span className="tabular shrink-0 text-[1.5vw] font-bold text-gold-deep">
                    {j.invalid ? "ugyldig" : typeof j.read === "number" ? formatNumber(j.read, unit) : "?"}
                  </span>
                ) : scoring === "manual-parts" ? (
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
