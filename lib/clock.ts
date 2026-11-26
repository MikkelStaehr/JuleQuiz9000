"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { getSupabase } from "./supabase/browser";

/**
 * Clock-skew compensation: offset = serverTime - localTime, measured against
 * the `server_now()` RPC. We take several samples and keep the one with the
 * lowest round-trip time (its midpoint estimate is the most accurate).
 */
let offsetMs = 0;
let synced = false;
const listeners = new Set<() => void>();

export function serverNow() {
  return Date.now() + offsetMs;
}

async function sample(): Promise<{ offset: number; rtt: number } | null> {
  const t0 = Date.now();
  const { data, error } = await getSupabase().rpc("server_now");
  const t1 = Date.now();
  if (error || !data) return null;
  const server = Date.parse(data as string);
  return { offset: server - (t0 + t1) / 2, rtt: t1 - t0 };
}

let syncing: Promise<void> | null = null;
export function syncClock(): Promise<void> {
  if (syncing) return syncing;
  syncing = (async () => {
    let best: { offset: number; rtt: number } | null = null;
    for (let i = 0; i < 4; i++) {
      const s = await sample().catch(() => null);
      if (s && (!best || s.rtt < best.rtt)) best = s;
    }
    if (best) {
      offsetMs = best.offset;
      synced = true;
      try {
        localStorage.setItem("xmasquiz-clock-offset", String(Math.round(offsetMs)));
      } catch {}
      listeners.forEach((l) => l());
    }
  })().finally(() => {
    syncing = null;
  });
  return syncing;
}

/** Sync on mount and every 5 minutes. Returns current offset (ms) and whether it was measured. */
export function useClockSync() {
  const offset = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => offsetMs,
    () => 0,
  );
  useEffect(() => {
    if (!synced) {
      const cached = Number(localStorage.getItem("xmasquiz-clock-offset"));
      if (Number.isFinite(cached) && cached !== 0) offsetMs = cached;
    }
    syncClock();
    const id = setInterval(syncClock, 5 * 60_000);
    return () => clearInterval(id);
  }, []);
  return offset;
}

/** Milliseconds left until `endsAt` (server time), re-rendered every animation frame while running. */
export function useCountdown(endsAt: string | null, active = true) {
  const target = endsAt ? Date.parse(endsAt) : null;
  const [, setFrame] = useState(0);
  useEffect(() => {
    if (!target || !active) return;
    let raf = 0;
    const loop = () => {
      setFrame((f) => (f + 1) % 1_000_000);
      if (target - serverNow() > 0) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [target, active]);
  return target ? Math.max(0, target - serverNow()) : 0;
}
