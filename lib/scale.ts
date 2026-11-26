import type { Scale } from "./types";

/** Canvas geometry (internal 1200×840 px) for scale questions. Shared by team canvas, demo and value detection. */
export const SCALE_GEOM = { x0: 110, x1: 1090, y: 470, band: 230 } as const;

export function niceStep(range: number, targetTicks = 10) {
  const raw = Math.abs(range) / targetTicks;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow;
}

export function ticks(scale: Scale, target = 10) {
  const step = niceStep(scale.max - scale.min, target);
  const out: number[] = [];
  const start = Math.ceil(scale.min / step) * step;
  for (let v = start; v <= scale.max + step * 1e-6; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

export const fracOf = (v: number, s: Scale) => (v - s.min) / (s.max - s.min);
export const clampToScale = (v: number, s: Scale) => Math.min(Math.max(v, Math.min(s.min, s.max)), Math.max(s.min, s.max));

/** Paint the axis onto a 2D context of the 1200×840 canvas (on white). */
export function paintScale(c: CanvasRenderingContext2D, scale: Scale) {
  const { x0, x1, y } = SCALE_GEOM;
  c.save();
  c.strokeStyle = "#9aa7a0";
  c.fillStyle = "#5b6b63";
  c.lineCap = "round";
  // guide band
  c.fillStyle = "rgba(217,185,122,0.10)";
  c.fillRect(x0 - 20, y - 70, x1 - x0 + 40, 140);
  c.fillStyle = "#5b6b63";
  c.lineWidth = 6;
  c.beginPath();
  c.moveTo(x0, y);
  c.lineTo(x1, y);
  c.stroke();
  c.font = "600 30px Inter, system-ui, sans-serif";
  c.textAlign = "center";
  c.textBaseline = "top";
  const ts = ticks(scale);
  ts.forEach((v) => {
    const x = x0 + fracOf(v, scale) * (x1 - x0);
    const major = ts.length <= 6 || ts.indexOf(v) % 2 === 0;
    c.lineWidth = major ? 4 : 2.5;
    c.beginPath();
    c.moveTo(x, y - (major ? 26 : 16));
    c.lineTo(x, y + (major ? 26 : 16));
    c.stroke();
    if (major) c.fillText(`${v.toLocaleString("da-DK")}`, x, y + 40);
  });
  c.font = "600 34px Inter, system-ui, sans-serif";
  c.textAlign = "center";
  c.fillStyle = "#8a9891";
  c.fillText(`Sæt ét kryds på skalaen${scale.unit ? ` (${scale.unit})` : ""}`, 600, 120);
  c.restore();
}

/**
 * Where did the team put its cross? x-centroid of ink pixels inside the axis band
 * (falls back to all ink). Returns null when nothing is drawn.
 */
export function detectScaleValue(ink: ImageData, scale: Scale): number | null {
  const { x0, x1, y, band } = SCALE_GEOM;
  const { data, width, height } = ink;
  let sx = 0, n = 0, sxAll = 0, nAll = 0;
  for (let py = 0; py < height; py += 2) {
    const inBand = Math.abs(py - y) <= band;
    for (let px = 0; px < width; px += 2) {
      if (data[(py * width + px) * 4 + 3] > 100) {
        sxAll += px;
        nAll++;
        if (inBand) {
          sx += px;
          n++;
        }
      }
    }
  }
  const cx = n > 30 ? sx / n : nAll > 0 ? sxAll / nAll : null;
  if (cx === null) return null;
  const f = Math.min(1, Math.max(0, (cx - x0) / (x1 - x0)));
  const v = scale.min + f * (scale.max - scale.min);
  const step = niceStep(scale.max - scale.min, 100); // round to ~1% of range
  return Math.round(v / step) * step;
}
