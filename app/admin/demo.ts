"use client";

// Demo mode: realistic answers for the 4 simulated teams, for all three answer types.
import { CANVAS_H, CANVAS_W } from "@/components/DrawingCanvas";
import { formatDa } from "@/lib/format";
import type { Question } from "@/lib/answerTypes/types";

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
const gauss = () => (Math.random() + Math.random() + Math.random() + Math.random() - 2) / 2; // ≈ N(0, 0.4)

function typo(s: string) {
  if (s.length < 4) return s;
  const i = Math.floor(rand(1, s.length - 2));
  return s.slice(0, i) + s[i + 1] + s[i] + s.slice(i + 2);
}

const WRONG = ["Ingen anelse!", "Rudolf?", "Et rensdyr", "Julemanden", "Risalamande", "Last Christmas · Wham!", "Silent Night", "En nisse"];

function wobbly(c: CanvasRenderingContext2D, pts: [number, number][]) {
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x + rand(-3, 3), y + rand(-3, 3)) : c.moveTo(x, y)));
  c.stroke();
}

function doodle(c: CanvasRenderingContext2D) {
  const x = rand(150, CANVAS_W - 150);
  const y = rand(CANVAS_H * 0.7, CANVAS_H * 0.82);
  const s = rand(45, 80);
  if (Math.random() < 0.5) {
    // tree
    wobbly(c, [[x, y - s], [x - s * 0.7, y + s * 0.6], [x + s * 0.7, y + s * 0.6], [x, y - s]]);
  } else {
    // star
    const pts: [number, number][] = [];
    for (let i = 0; i <= 10; i++) {
      const r = i % 2 ? s * 0.45 : s;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r]);
    }
    wobbly(c, pts);
  }
}

/** A hand-drawn-looking PNG with the given text (+ a doodle). */
export function handwrittenPng(text: string): string {
  const cv = document.createElement("canvas");
  cv.width = CANVAS_W;
  cv.height = CANVAS_H;
  const c = cv.getContext("2d")!;
  c.fillStyle = "#fff";
  c.fillRect(0, 0, CANVAS_W, CANVAS_H);
  c.strokeStyle = c.fillStyle = "#13221a";
  c.lineCap = c.lineJoin = "round";
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    c.save();
    c.translate(CANVAS_W / 2 + rand(-40, 40), CANVAS_H * (lines.length > 1 ? 0.3 + i * 0.22 : 0.42) + rand(-20, 20));
    c.rotate(rand(-0.1, 0.1));
    const size = Math.min(150, 1400 / Math.max(5, line.length));
    c.font = `bold ${size}px "Segoe Print", "Comic Sans MS", "Bradley Hand", cursive`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(line, 0, 0);
    c.restore();
  });
  c.lineWidth = rand(8, 12);
  doodle(c);
  return cv.toDataURL("image/png");
}

export interface DemoAnswer {
  value: unknown;
  wager: number | null;
  /** draw: PNG data URL uploaded server-side */
  png?: string;
}

/** One plausible answer for a demo team. `skill` 0..1 makes some teams better than others. */
export function demoAnswer(q: Question, skill: number): DemoAnswer {
  switch (q.answerType) {
    case "draw": {
      let text: string;
      if (q.scoring === "closest") {
        const facit = q.answer as number;
        let n = facit * (1 + gauss() * (1.2 - skill) * 0.9);
        n = Math.abs(facit) >= 100 ? Math.round(n / 10) * 10 : Math.round(n);
        text = `${formatDa(Math.max(0, n))}${q.unit ? ` ${q.unit}` : ""}`;
      } else if (q.scoring === "manual-parts") {
        const [title, artist] = String(q.answer).split(/\s*[·\-–]\s*/);
        const part = (s: string | undefined) => (!s ? "?" : Math.random() < 0.4 + skill * 0.4 ? s : Math.random() < 0.5 ? typo(s) : pick(WRONG));
        text = `${part(title)}\n${part(artist)}`;
      } else {
        text = Math.random() < 0.35 + skill * 0.4 ? String(q.answer) : pick(WRONG);
      }
      return { value: null, wager: null, png: handwrittenPng(text) };
    }
    case "geo": {
      const f = q.answer as { lat: number; lng: number };
      const km = rand(3, 60) + (1 - skill) * rand(20, 400);
      const bearing = rand(0, Math.PI * 2);
      const lat = f.lat + (km / 111.2) * Math.cos(bearing);
      const lng = f.lng + (km / (111.2 * Math.cos((f.lat * Math.PI) / 180))) * Math.sin(bearing);
      return { value: { lat: Math.max(-85, Math.min(85, lat)), lng: ((lng + 540) % 360) - 180 }, wager: null };
    }
    case "true-false": {
      const right = Math.random() < 0.45 + skill * 0.4;
      return { value: { choice: right ? q.answer : !q.answer }, wager: q.wagerEnabled ? pick([1, 1, 2, 2, 3]) : null };
    }
  }
}
