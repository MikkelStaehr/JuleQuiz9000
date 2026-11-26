// Generates the audio clips for "Gæt julesangen" (public-domain melodies, synthesized here).
// Usage: node scripts/gen-audio.mjs   → writes public/media/song-*.wav
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const SR = 22050;
const OUT = join(process.cwd(), "public", "media");
mkdirSync(OUT, { recursive: true });

const NOTE = { C: -9, "C#": -8, D: -7, "D#": -6, E: -5, F: -4, "F#": -3, G: -2, "G#": -1, A: 0, "A#": 1, B: 2 };
function freq(n) {
  const m = /^([A-G]#?)(\d)$/.exec(n);
  if (!m) throw new Error("bad note " + n);
  const semis = NOTE[m[1]] + (Number(m[2]) - 4) * 12;
  return 440 * Math.pow(2, semis / 12);
}

// [note, beats]  ("R" = rest)
const SONGS = {
  "song-jingle-bells": {
    beat: 0.28,
    notes: [
      ["E4", 1], ["E4", 1], ["E4", 2], ["E4", 1], ["E4", 1], ["E4", 2],
      ["E4", 1], ["G4", 1], ["C4", 1.5], ["D4", 0.5], ["E4", 4],
      ["F4", 1], ["F4", 1], ["F4", 1.5], ["F4", 0.5], ["F4", 1], ["E4", 1], ["E4", 1], ["E4", 0.5], ["E4", 0.5],
      ["E4", 1], ["D4", 1], ["D4", 1], ["E4", 1], ["D4", 2], ["G4", 2],
    ],
  },
  "song-silent-night": {
    beat: 0.42,
    notes: [
      ["G4", 1.5], ["A4", 0.5], ["G4", 1], ["E4", 3],
      ["G4", 1.5], ["A4", 0.5], ["G4", 1], ["E4", 3],
      ["D5", 2], ["D5", 1], ["B4", 3],
      ["C5", 2], ["C5", 1], ["G4", 3],
      ["A4", 2], ["A4", 1], ["C5", 1.5], ["B4", 0.5], ["A4", 1],
      ["G4", 1.5], ["A4", 0.5], ["G4", 1], ["E4", 3],
    ],
  },
  "song-we-wish-you": {
    beat: 0.34,
    notes: [
      ["D4", 1],
      ["G4", 1], ["G4", 0.5], ["A4", 0.5], ["G4", 0.5], ["F#4", 0.5], ["E4", 1], ["E4", 1], ["E4", 1],
      ["A4", 1], ["A4", 0.5], ["B4", 0.5], ["A4", 0.5], ["G4", 0.5], ["F#4", 1], ["D4", 1], ["D4", 1],
      ["B4", 1], ["B4", 0.5], ["C5", 0.5], ["B4", 0.5], ["A4", 0.5], ["G4", 1], ["E4", 1], ["D4", 0.5], ["D4", 0.5],
      ["E4", 1], ["A4", 1], ["F#4", 1], ["G4", 3],
    ],
  },
  "song-joy-to-the-world": {
    beat: 0.36,
    notes: [
      ["D5", 2], ["C#5", 1.5], ["B4", 0.5], ["A4", 3], ["G4", 1], ["F#4", 2], ["E4", 2], ["D4", 3],
      ["A4", 1], ["B4", 3], ["B4", 1], ["C#5", 3], ["C#5", 1], ["D5", 4],
    ],
  },
  "song-o-tannenbaum": {
    beat: 0.42,
    notes: [
      ["D4", 1],
      ["G4", 0.75], ["G4", 0.25], ["G4", 1.5], ["A4", 0.5],
      ["B4", 0.75], ["B4", 0.25], ["B4", 1.5], ["B4", 0.5],
      ["A4", 0.5], ["B4", 0.5], ["C5", 1], ["F#4", 1], ["A4", 1], ["G4", 2], ["R", 1],
      ["D5", 0.5], ["B4", 0.5], ["E5", 1.5], ["D5", 0.5],
      ["D5", 0.5], ["C5", 0.5], ["C5", 1.5], ["C5", 0.5],
      ["C5", 0.5], ["A4", 0.5], ["D5", 1.5], ["C5", 0.5], ["C5", 0.5], ["B4", 0.5], ["B4", 2],
    ],
  },
  "song-deck-the-halls": {
    beat: 0.3,
    notes: [
      ["D5", 1.5], ["C5", 0.5], ["B4", 1], ["A4", 1], ["G4", 1], ["A4", 1], ["B4", 1], ["G4", 1],
      ["A4", 0.5], ["B4", 0.5], ["C5", 0.5], ["A4", 0.5], ["B4", 1.5], ["A4", 0.5], ["G4", 1], ["F#4", 1], ["G4", 2],
      ["D5", 1.5], ["C5", 0.5], ["B4", 1], ["A4", 1], ["G4", 1], ["A4", 1], ["B4", 1], ["G4", 1],
      ["A4", 0.5], ["B4", 0.5], ["C5", 0.5], ["A4", 0.5], ["B4", 1.5], ["A4", 0.5], ["G4", 1], ["F#4", 1], ["G4", 2],
    ],
  },
};

function render({ beat, notes }) {
  const totalSec = notes.reduce((s, [, b]) => s + b * beat, 0) + 1.5;
  const buf = new Float32Array(Math.ceil(totalSec * SR));
  let t = 0;
  for (const [n, beats] of notes) {
    const dur = beats * beat;
    if (n !== "R") {
      const f = freq(n);
      const len = Math.floor((dur + 0.6) * SR); // let the note ring a little
      const start = Math.floor(t * SR);
      for (let i = 0; i < len && start + i < buf.length; i++) {
        const s = i / SR;
        const env = Math.min(1, s / 0.01) * Math.exp(-s * (2.2 / Math.max(dur, 0.25)));
        // soft bell/celesta timbre
        const v =
          Math.sin(2 * Math.PI * f * s) * 0.6 +
          Math.sin(2 * Math.PI * f * 2 * s) * 0.22 * Math.exp(-s * 3) +
          Math.sin(2 * Math.PI * f * 3.01 * s) * 0.1 * Math.exp(-s * 5) +
          Math.sin(2 * Math.PI * f * 0.5 * s) * 0.12;
        buf[start + i] += v * env * 0.45;
      }
    }
    t += dur;
  }
  // simple echo for warmth
  const d = Math.floor(0.18 * SR);
  for (let i = d; i < buf.length; i++) buf[i] += buf[i - d] * 0.25;
  return buf;
}

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  const norm = peak > 0 ? 0.9 / peak : 1;
  samples.forEach((s, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s * norm)) * 32767), i * 2));
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

for (const [name, song] of Object.entries(SONGS)) {
  writeFileSync(join(OUT, `${name}.wav`), wav(render(song)));
  console.log("wrote", name);
}
