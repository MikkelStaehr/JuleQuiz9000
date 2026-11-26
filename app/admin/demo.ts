"use client";

import { CANVAS_H, CANVAS_W, paintBackground } from "@/components/DrawingCanvas";
import { SCALE_GEOM, clampToScale, detectScaleValue, fracOf } from "@/lib/scale";
import type { Scale } from "@/lib/types";

const WRONG = ["Ingen anelse!", "42", "Julemanden?", "Rudolf", "1999", "Paris?", "Gløgg!", "Risalamande", "7", "Nisse"];

function rand(a: number, b: number) {
  return a + Math.random() * (b - a);
}

function wobblyLine(c: CanvasRenderingContext2D, pts: [number, number][]) {
  c.beginPath();
  pts.forEach(([x, y], i) => {
    const jx = x + rand(-3, 3);
    const jy = y + rand(-3, 3);
    if (i === 0) c.moveTo(jx, jy);
    else c.lineTo(jx, jy);
  });
  c.stroke();
}

function doodleTree(c: CanvasRenderingContext2D, x: number, y: number, s: number) {
  wobblyLine(c, [[x, y - s], [x - s * 0.6, y + s * 0.2], [x - s * 0.25, y + s * 0.2], [x - s * 0.75, y + s * 0.8], [x + s * 0.75, y + s * 0.8], [x + s * 0.25, y + s * 0.2], [x + s * 0.6, y + s * 0.2], [x, y - s]]);
  wobblyLine(c, [[x - s * 0.12, y + s * 0.8], [x - s * 0.12, y + s * 1.05], [x + s * 0.12, y + s * 1.05], [x + s * 0.12, y + s * 0.8]]);
}

function doodleStar(c: CanvasRenderingContext2D, x: number, y: number, s: number) {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 10; i++) {
    const r = i % 2 === 0 ? s : s * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r]);
  }
  wobblyLine(c, pts);
}

function doodleSnowman(c: CanvasRenderingContext2D, x: number, y: number, s: number) {
  for (const [dy, r] of [[0, s * 0.35], [s * 0.6, s * 0.5]] as const) {
    c.beginPath();
    c.ellipse(x + rand(-4, 4), y + dy, r, r * rand(0.92, 1.05), rand(-0.2, 0.2), 0, Math.PI * 2);
    c.stroke();
  }
  wobblyLine(c, [[x, y], [x + s * 0.3, y + s * 0.05]]);
}

/** Demo answer for a scale question: a hand-drawn cross near (or far from) the facit. */
export function dummyScaleDrawing(scale: Scale, answerValue: number | null): { dataUrl: string; value: number } {
  const range = scale.max - scale.min;
  const centre = answerValue ?? scale.min + range / 2;
  const noise = (Math.random() + Math.random() + Math.random() - 1.5) * range * 0.25;
  const target = clampToScale(centre + noise, scale);

  const cv = document.createElement("canvas");
  cv.width = CANVAS_W;
  cv.height = CANVAS_H;
  const bg = cv.getContext("2d")!;
  paintBackground(bg, scale);

  // ink on its own layer so we can detect the value exactly like a team device does
  const inkCv = document.createElement("canvas");
  inkCv.width = CANVAS_W;
  inkCv.height = CANVAS_H;
  const c = inkCv.getContext("2d")!;
  c.strokeStyle = "#13221a";
  c.lineCap = "round";
  c.lineWidth = rand(10, 14);
  const x = SCALE_GEOM.x0 + fracOf(target, scale) * (SCALE_GEOM.x1 - SCALE_GEOM.x0);
  const y = SCALE_GEOM.y + rand(-12, 12);
  const s = rand(34, 50);
  wobblyLine(c, [[x - s, y - s], [x, y], [x + s, y + s]]);
  wobblyLine(c, [[x + s, y - s], [x, y], [x - s, y + s]]);
  const value = detectScaleValue(c.getImageData(0, 0, CANVAS_W, CANVAS_H), scale) ?? target;
  bg.drawImage(inkCv, 0, 0);
  return { dataUrl: cv.toDataURL("image/png"), value };
}

/** A plausible-looking "team drawing": handwritten guess + a little doodle. */
export function dummyDrawing(answer: string | null, correct: boolean): string {
  const cv = document.createElement("canvas");
  cv.width = CANVAS_W;
  cv.height = CANVAS_H;
  const c = cv.getContext("2d")!;
  c.fillStyle = "#fff";
  c.fillRect(0, 0, CANVAS_W, CANVAS_H);
  c.strokeStyle = "#13221a";
  c.fillStyle = "#13221a";
  c.lineCap = "round";
  c.lineJoin = "round";
  c.lineWidth = rand(8, 14);

  const text = correct && answer ? answer.split(/[(/–]/)[0].trim().slice(0, 24) : WRONG[Math.floor(Math.random() * WRONG.length)];
  c.save();
  c.translate(CANVAS_W / 2 + rand(-60, 60), CANVAS_H * 0.42 + rand(-40, 40));
  c.rotate(rand(-0.12, 0.12));
  const fontSize = Math.min(180, 1500 / Math.max(4, text.length));
  c.font = `bold ${fontSize}px "Segoe Print", "Comic Sans MS", "Bradley Hand", cursive`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(text, 0, 0);
  c.restore();

  const doodles = [doodleTree, doodleStar, doodleSnowman];
  const n = 1 + Math.floor(Math.random() * 2);
  for (let i = 0; i < n; i++) {
    const d = doodles[Math.floor(Math.random() * doodles.length)];
    d(c, rand(140, CANVAS_W - 140), rand(CANVAS_H * 0.68, CANVAS_H * 0.8), rand(50, 90));
  }
  // underline scribble
  c.lineWidth = 6;
  wobblyLine(c, [[CANVAS_W * 0.3, CANVAS_H * 0.58], [CANVAS_W * 0.5, CANVAS_H * 0.6], [CANVAS_W * 0.7, CANVAS_H * 0.57]]);

  return cv.toDataURL("image/png");
}
