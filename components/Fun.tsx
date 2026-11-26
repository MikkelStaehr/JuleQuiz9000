"use client";

// Silly, celebratory big-screen animations. Pure CSS keyframes on transform/opacity (see globals.css · "fun").
// Particles use a seeded PRNG so renders are pure and stable.

import { useEffect, useState } from "react";

/** mulberry32 – tiny deterministic PRNG */
function rng(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);

const CONFETTI_COLORS = ["#d9b97a", "#f8f4ea", "#e5484d", "#38d9a9", "#e9d3a6", "#4dabf7"];

/**
 * Confetti.
 * mode "burst": explodes from a point (default centre) and falls · mode "rain": falls from the top (loops if `loop`).
 */
export function Confetti({
  seed = "confetti",
  count = 90,
  mode = "burst",
  loop = false,
  colors = CONFETTI_COLORS,
  originX = 50,
  originY = 45,
}: {
  seed?: string;
  count?: number;
  mode?: "burst" | "rain";
  loop?: boolean;
  colors?: string[];
  originX?: number;
  originY?: number;
}) {
  const r = rng(hash(seed));
  const pieces = Array.from({ length: count }, (_, i) => {
    const angle = r() * Math.PI * 2;
    const power = 18 + r() * 34; // vmin
    const w = 0.7 + r() * 0.9;
    return {
      i,
      color: colors[i % colors.length],
      w,
      h: r() < 0.3 ? w : w * (1.8 + r()),
      round: r() < 0.25,
      dx: Math.cos(angle) * power,
      dy: Math.sin(angle) * power - 12,
      x: r() * 100,
      drift: (r() - 0.5) * 20,
      rot: (r() < 0.5 ? -1 : 1) * (360 + r() * 720),
      delay: mode === "rain" ? r() * 4 : r() * 0.15,
      dur: mode === "rain" ? 3.5 + r() * 3 : 2.4 + r() * 1.4,
    };
  });
  return (
    <div className="fun-layer pointer-events-none fixed inset-0 z-[1500] overflow-hidden" aria-hidden>
      {pieces.map((p) => (
        <span
          key={p.i}
          className={mode === "burst" ? "fun-confetti-burst" : "fun-confetti-rain"}
          style={
            {
              left: mode === "burst" ? `${originX}%` : `${p.x}%`,
              top: mode === "burst" ? `${originY}%` : "-4vh",
              width: `${p.w}vmin`,
              height: `${p.h}vmin`,
              background: p.color,
              borderRadius: p.round ? "50%" : "0.15vmin",
              "--dx": `${p.dx}vmin`,
              "--dy": `${p.dy}vmin`,
              "--drift": `${p.drift}vw`,
              "--rot": `${p.rot}deg`,
              animationDuration: `${p.dur}s`,
              animationDelay: `${p.delay}s`,
              animationIterationCount: loop ? "infinite" : 1,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

/** Gentle snowfall (round intro). */
export function Snowfall({ count = 46, seed = "snow" }: { count?: number; seed?: string }) {
  const r = rng(hash(seed));
  return (
    <div className="fun-layer pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
      {Array.from({ length: count }, (_, i) => {
        const size = 0.4 + r() * 1.1;
        return (
          <span
            key={i}
            className="fun-snow"
            style={
              {
                left: `${r() * 100}%`,
                width: `${size}vmin`,
                height: `${size}vmin`,
                opacity: 0.35 + r() * 0.5,
                "--drift": `${(r() - 0.5) * 12}vw`,
                animationDuration: `${9 + r() * 9}s`,
                animationDelay: `${-r() * 18}s`,
              } as React.CSSProperties
            }
          />
        );
      })}
    </div>
  );
}

/** Santa's sleigh with reindeer flying across the top of the screen. */
export function Sleigh({ delay = 0.6, top = 12, flip = false }: { delay?: number; top?: number; flip?: boolean }) {
  return (
    <div className="fun-layer pointer-events-none fixed inset-x-0 z-[1400] overflow-hidden" style={{ top: `${top}vh`, height: "14vh" }} aria-hidden>
      <div className={flip ? "fun-sleigh fun-sleigh--rtl" : "fun-sleigh"} style={{ animationDelay: `${delay}s` }}>
        <div className="fun-sleigh-bob flex items-end gap-[0.6vw] text-[6vmin] leading-none">
          {/* emoji reindeer face left → mirror them so they lead the way */}
          <span className="fun-mirror">🎅</span>
          <span className="fun-mirror">🛷</span>
          <span className="fun-mirror fun-rein">🦌</span>
          <span className="fun-mirror fun-rein" style={{ animationDelay: "0.15s" }}>🦌</span>
          <span className="fun-mirror fun-rein text-[7vmin]" style={{ animationDelay: "0.3s" }}>
            🦌<span className="fun-nose" />
          </span>
        </div>
      </div>
    </div>
  );
}

/** "TIDEN ER GÅET!" rubber stamp slamming onto the screen. */
export function Stamp({ text }: { text: string }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-[1500] grid place-items-center" aria-hidden>
      <div className="fun-stamp rounded-[2vmin] border-[1vmin] border-alarm px-[4vw] py-[2vh] font-black uppercase tracking-[0.12em] text-alarm" style={{ fontSize: "8vmin" }}>
        {text}
      </div>
    </div>
  );
}

/** Crown that drops onto the leader. */
export function Crown({ className = "" }: { className?: string }) {
  return (
    <span className={`fun-crown inline-block ${className}`} aria-hidden>
      👑
    </span>
  );
}

export interface RoundWinnerTeam {
  id: string;
  name: string;
  color: string;
  roundPoints: number;
}

/**
 * Round-winner celebration: dims the screen, drops a banner, the team name in its colour, confetti.
 * Calls onDone after ~6 s so the scoreboard underneath takes over.
 */
export function RoundWinner({ round, winners, onDone }: { round: number; winners: RoundWinnerTeam[]; onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const a = setTimeout(() => setLeaving(true), 6200);
    const b = setTimeout(onDone, 6900);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [onDone]);
  const tie = winners.length > 1;
  return (
    <div className={`fixed inset-0 z-[1600] grid place-items-center bg-pine-950/80 backdrop-blur-sm ${leaving ? "fun-fade-out" : "fun-fade-in"}`}>
      <Confetti seed={`round-${round}`} count={140} mode="rain" colors={[...winners.map((w) => w.color), "#d9b97a", "#f8f4ea"]} />
      <Confetti seed={`round-burst-${round}`} count={70} />
      <div className="relative flex flex-col items-center gap-[3vh] text-center">
        <p className="fun-drop-in text-[2.4vw] font-bold uppercase tracking-[0.35em] text-gold">{tie ? "Rundens vindere" : "Rundens vinder"}</p>
        <div className="fun-crown-big text-[12vmin] leading-none">👑</div>
        <div className="flex flex-col items-center gap-[1.5vh]">
          {winners.map((w, i) => (
            <p
              key={w.id}
              className="fun-winner-name font-display font-semibold leading-none"
              style={{ color: w.color, fontSize: tie ? "7vw" : "10vw", animationDelay: `${0.5 + i * 0.25}s`, textShadow: `0 0 4vmin ${w.color}66` }}
            >
              {w.name}
            </p>
          ))}
        </div>
        <p className="fun-pop-late tabular text-[3vw] font-bold text-cream">+{winners[0].roundPoints} point i runde {round}</p>
      </div>
    </div>
  );
}
