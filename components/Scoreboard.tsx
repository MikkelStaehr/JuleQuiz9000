"use client";

import type { Standing } from "@/lib/useGame";
import { Crown } from "./Fun";

/** Large-screen scoreboard with proportional bars and movement since the previous round. */
export function Scoreboard({ ranked, title = "Stilling", subtitle }: { ranked: Standing[]; title?: string; subtitle?: string }) {
  const max = Math.max(1, ...ranked.map((t) => t.total));
  return (
    <div className="mx-auto flex w-full max-w-[80vw] flex-col gap-[1.4vh]">
      <h2 className="text-center font-display text-[5vw] font-semibold leading-none text-cream">{title}</h2>
      {subtitle && <p className="mb-[1.5vh] text-center text-[1.6vw] text-gold/80">{subtitle}</p>}
      {ranked.map((t, i) => {
        const top = t.rank === 1 && t.total > 0;
        const move = t.prevRank === null ? 0 : t.prevRank - t.rank; // + = moved up
        return (
          <div key={t.id} className={`animate-fade-up flex items-center gap-[1.4vw] ${move > 0 ? "fun-rank-up" : ""}`} style={{ animationDelay: `${i * 90}ms` }}>
            <span
              className={`tabular grid h-[6.2vh] w-[6.2vh] shrink-0 place-items-center rounded-full text-[2.6vh] font-bold ${
                top ? "bg-gold text-ink" : "border border-gold/40 text-gold"
              }`}
            >
              {t.rank}
            </span>
            <span
              className={`tabular w-[4.2vw] shrink-0 text-center text-[2.2vh] font-bold ${
                move > 0 ? "text-emerald-300" : move < 0 ? "text-[#ff8a8d]" : "text-cream/30"
              }`}
              title={t.prevRank ? `Før: nr. ${t.prevRank}` : undefined}
            >
              {t.prevRank === null ? "" : move > 0 ? `▲${move}` : move < 0 ? `▼${-move}` : "–"}
            </span>
            <div className="relative h-[7.2vh] flex-1 overflow-hidden rounded-[1vh] bg-pine-900/80 ring-1 ring-gold/15">
              <div
                className={`absolute inset-y-0 left-0 rounded-[1vh] ${top ? "bg-gold/90" : "bg-gold/25"}`}
                style={{
                  width: `${Math.max(4, (Math.max(0, t.total) / max) * 100)}%`,
                  transition: "width 800ms cubic-bezier(.2,.8,.2,1)",
                }}
              />
              <div className="relative flex h-full items-center px-[1.4vw]">
                <span className={`truncate text-[3vh] font-semibold ${top ? "text-ink" : "text-cream"}`}>{t.name}</span>
                {top && <Crown className="ml-[0.8vw] text-[4vh]" />}
              </div>
            </div>
            <span className="tabular w-[7vw] shrink-0 text-right text-[4vh] font-bold text-gold">{t.total}</span>
          </div>
        );
      })}
      {ranked.length === 0 && <p className="text-center text-[3vh] text-cream/50">Ingen hold endnu</p>}
    </div>
  );
}
