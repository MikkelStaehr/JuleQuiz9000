"use client";

import type { Team } from "@/lib/types";

type Ranked = Team & { total: number };

/** Large-screen scoreboard with proportional bars. */
export function Scoreboard({ ranked, title = "Stilling" }: { ranked: Ranked[]; title?: string }) {
  const max = Math.max(1, ...ranked.map((t) => t.total));
  // competition ranking: ties share a rank
  const ranks = ranked.map((t) => ranked.findIndex((x) => x.total === t.total) + 1);
  return (
    <div className="mx-auto flex w-full max-w-[78vw] flex-col gap-[1.4vh]">
      <h2 className="mb-[2vh] text-center font-display text-[5vw] font-semibold leading-none text-cream">{title}</h2>
      {ranked.map((t, i) => {
        const rank = ranks[i];
        const top = rank === 1 && t.total > 0;
        return (
          <div
            key={t.id}
            className="animate-fade-up flex items-center gap-[1.5vw]"
            style={{ animationDelay: `${i * 90}ms` }}
          >
            <span
              className={`tabular grid h-[6.2vh] w-[6.2vh] shrink-0 place-items-center rounded-full text-[2.6vh] font-bold ${
                top ? "bg-gold text-ink" : "border border-gold/40 text-gold"
              }`}
            >
              {rank}
            </span>
            <div className="relative h-[7.2vh] flex-1 overflow-hidden rounded-[1vh] bg-pine-900/80 ring-1 ring-gold/15">
              <div
                className={`absolute inset-y-0 left-0 rounded-[1vh] ${top ? "bg-gold/90" : "bg-gold/25"}`}
                style={{ width: `${Math.max(4, (t.total / max) * 100)}%`, transition: "width 800ms cubic-bezier(.2,.8,.2,1)" }}
              />
              <div className="relative flex h-full items-center justify-between px-[1.4vw]">
                <span className={`truncate text-[3vh] font-semibold ${top ? "text-ink" : "text-cream"}`}>{t.name}</span>
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
