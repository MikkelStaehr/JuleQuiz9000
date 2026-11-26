"use client";

let ctx: AudioContext | null = null;

/** Must be called from a user gesture once (browsers block audio until then). */
export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC();
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx.state !== "closed";
}

export function audioUnlocked() {
  return !!ctx && ctx.state === "running";
}

function blip(freq: number, dur: number, gain: number, type: OscillatorType = "square") {
  if (!ctx || ctx.state !== "running") return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** Clock tick for the last 10 seconds; gets higher and louder for the last 3. */
export function tick(secondsLeft: number) {
  const urgent = secondsLeft <= 3;
  blip(urgent ? 1320 : 880, 0.07, urgent ? 0.35 : 0.22);
  blip(urgent ? 660 : 440, 0.05, 0.12, "triangle");
}

/** Time's up. */
export function buzzer() {
  blip(196, 0.7, 0.4, "sawtooth");
  blip(147, 0.8, 0.3, "square");
}

/** Short victory fanfare (round winner). */
export function fanfare() {
  const notes: [number, number, number][] = [
    [523.25, 0, 0.16], // C5
    [659.25, 130, 0.16], // E5
    [783.99, 260, 0.16], // G5
    [1046.5, 390, 0.5], // C6
    [783.99, 640, 0.14], // G5
    [1046.5, 760, 0.8], // C6
  ];
  for (const [f, at, dur] of notes) setTimeout(() => {
    blip(f, dur, 0.22, "triangle");
    blip(f / 2, dur, 0.08, "square");
  }, at);
}

/** Soft chime (reveal). */
export function chime() {
  blip(1046.5, 0.6, 0.15, "sine");
  setTimeout(() => blip(1318.5, 0.7, 0.12, "sine"), 120);
  setTimeout(() => blip(1568, 0.9, 0.1, "sine"), 240);
}
