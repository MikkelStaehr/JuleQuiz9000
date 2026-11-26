"use client";

import { useEffect, useRef } from "react";
import { useCountdown } from "@/lib/clock";
import { buzzer, tick } from "@/lib/sound";

const R = 90;
const C = 2 * Math.PI * R;

/**
 * Circular countdown computed locally from `endsAt` (server time, skew-compensated).
 * Last 10 seconds: red, pulsing, and (optionally) ticking.
 */
export function TimerRing({
  endsAt,
  totalSeconds,
  size = "40vmin",
  sound = false,
  label,
}: {
  endsAt: string | null;
  totalSeconds: number | null;
  size?: string;
  sound?: boolean;
  label?: string;
}) {
  const ms = useCountdown(endsAt);
  const secs = Math.ceil(ms / 1000);
  const total = Math.max(1, totalSeconds ?? 1);
  const frac = endsAt ? Math.min(1, ms / (total * 1000)) : 0;
  const urgent = ms > 0 && secs <= 10;
  const done = !!endsAt && ms <= 0;

  const prev = useRef<number | null>(null);
  useEffect(() => {
    const p = prev.current;
    prev.current = secs;
    if (!sound || p === null || p === secs) return;
    if (secs > 0 && secs <= 10) tick(secs);
    if (p > 0 && secs === 0) buzzer();
  }, [secs, sound]);

  const color = urgent || done ? "var(--color-alarm)" : "var(--color-gold)";

  return (
    <div className={urgent && secs <= 3 ? "fun-shake" : ""}>
    <div
      className={`relative grid place-items-center ${urgent ? "animate-pulse-ring" : ""}`}
      style={{ width: size, height: size }}
      role="timer"
      aria-live="off"
    >
      <svg viewBox="0 0 200 200" className="absolute inset-0 h-full w-full -rotate-90">
        <circle cx="100" cy="100" r={R} fill="rgba(4,17,11,0.55)" stroke="rgba(217,185,122,0.14)" strokeWidth="10" />
        <circle
          cx="100"
          cy="100"
          r={R}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - frac)}
          style={{ transition: "stroke 300ms ease" }}
        />
      </svg>
      <div className="relative flex flex-col items-center leading-none">
        <span
          className="tabular font-semibold"
          style={{
            fontSize: `calc(${size} * 0.36)`,
            color: urgent || done ? "#ff8a8d" : "var(--color-cream)",
            transition: "color 300ms ease",
          }}
        >
          {done ? "0" : secs}
        </span>
        {label && (
          <span
            className="mt-[0.4em] uppercase tracking-[0.3em] text-gold/80"
            style={{ fontSize: `calc(${size} * 0.055)` }}
          >
            {done ? "Tiden er gået" : label}
          </span>
        )}
      </div>
    </div>
    </div>
  );
}
