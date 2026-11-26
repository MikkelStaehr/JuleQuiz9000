"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { detectScaleValue, paintScale } from "@/lib/scale";
import type { Scale } from "@/lib/types";

export const CANVAS_W = 1200;
export const CANVAS_H = 840; // 10:7 – same aspect everywhere (play, display, admin)

const INK = "#13221a";
const SIZES = [
  { id: "s", label: "Tynd", px: 5 },
  { id: "m", label: "Mellem", px: 12 },
  { id: "l", label: "Tyk", px: 26 },
] as const;
const ERASER_FACTOR = 2.6;
const MAX_UNDO = 25;

export interface DrawingCanvasHandle {
  /** Background (paper/scale) + ink, as PNG. */
  toBlob(): Promise<Blob>;
  isDirty(): boolean;
  /** For scale questions: value under the drawn cross (null if nothing drawn / no scale). */
  scaleValue(): number | null;
}

type Tool = "pen" | "eraser";

/** Paint the paper layer: white, plus the axis for scale questions. */
export function paintBackground(c: CanvasRenderingContext2D, scale: Scale | null) {
  c.fillStyle = "#ffffff";
  c.fillRect(0, 0, CANVAS_W, CANVAS_H);
  if (scale) paintScale(c, scale);
}

/**
 * Drawing surface with pen / eraser / undo / clear and three stroke widths.
 * Two layers: a fixed background (white paper, or a scale axis) and a transparent
 * ink layer – the eraser only removes ink. Pointer events (mouse, touch, pen).
 * Fixed internal resolution, scaled to fit the available space. Optionally
 * persisted to localStorage so a refresh during the countdown keeps the drawing.
 */
export const DrawingCanvas = forwardRef<
  DrawingCanvasHandle,
  { disabled?: boolean; persistKey?: string | null; scale?: Scale | null; onStroke?: () => void }
>(function DrawingCanvas({ disabled = false, persistKey = null, scale = null, onStroke }, ref) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLCanvasElement>(null);
  const inkRef = useRef<HTMLCanvasElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [tool, setTool] = useState<Tool>("pen");
  const [size, setSize] = useState<(typeof SIZES)[number]["id"]>("m");
  const [canUndo, setCanUndo] = useState(false);

  const dirty = useRef(false);
  const active = useRef<number | null>(null);
  const last = useRef<{ x: number; y: number } | null>(null);
  const undo = useRef<ImageData[]>([]);

  const ink = () => inkRef.current!.getContext("2d", { willReadFrequently: true })!;

  // Background layer
  const scaleSig = scale ? `${scale.min}|${scale.max}|${scale.unit}` : "";
  useEffect(() => {
    paintBackground(bgRef.current!.getContext("2d")!, scale);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scaleSig]);

  // Reset ink + restore persisted drawing
  useEffect(() => {
    ink().clearRect(0, 0, CANVAS_W, CANVAS_H);
    undo.current = [];
    dirty.current = false;
    if (!persistKey) return;
    try {
      const saved = JSON.parse(localStorage.getItem("xmasquiz-canvas") ?? "null");
      if (saved?.key === persistKey && typeof saved.data === "string") {
        const img = new Image();
        img.onload = () => {
          ink().drawImage(img, 0, 0, CANVAS_W, CANVAS_H);
          dirty.current = true;
          onStroke?.();
        };
        img.src = saved.data;
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistKey]);

  // Fit to container (contain)
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const ratio = CANVAS_W / CANVAS_H;
      const w = Math.min(width, height * ratio);
      setBox({ w: Math.floor(w), h: Math.floor(w / ratio) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const persist = useCallback(() => {
    if (!persistKey) return;
    try {
      localStorage.setItem("xmasquiz-canvas", JSON.stringify({ key: persistKey, data: inkRef.current!.toDataURL("image/png") }));
    } catch {}
  }, [persistKey]);

  useImperativeHandle(ref, () => ({
    isDirty: () => dirty.current,
    scaleValue: () =>
      scale && dirty.current ? detectScaleValue(ink().getImageData(0, 0, CANVAS_W, CANVAS_H), scale) : null,
    toBlob: () =>
      new Promise<Blob>((resolve, reject) => {
        const out = document.createElement("canvas");
        out.width = CANVAS_W;
        out.height = CANVAS_H;
        const c = out.getContext("2d")!;
        c.drawImage(bgRef.current!, 0, 0);
        c.drawImage(inkRef.current!, 0, 0);
        out.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG-eksport fejlede"))), "image/png");
      }),
  }));

  const toCanvas = (e: { clientX: number; clientY: number }) => {
    const r = inkRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * CANVAS_W, y: ((e.clientY - r.top) / r.height) * CANVAS_H };
  };

  const segment = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const c = ink();
    const px = SIZES.find((s) => s.id === size)!.px;
    c.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
    c.strokeStyle = INK;
    c.lineWidth = tool === "eraser" ? px * ERASER_FACTOR : px;
    c.lineCap = "round";
    c.lineJoin = "round";
    c.beginPath();
    c.moveTo(a.x, a.y);
    c.lineTo(b.x, b.y);
    c.stroke();
    c.globalCompositeOperation = "source-over";
  };

  const snapshot = () => {
    undo.current.push(ink().getImageData(0, 0, CANVAS_W, CANVAS_H));
    if (undo.current.length > MAX_UNDO) undo.current.shift();
    setCanUndo(true);
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled || active.current !== null) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    active.current = e.pointerId;
    snapshot();
    const p = toCanvas(e);
    last.current = p;
    segment(p, { x: p.x + 0.01, y: p.y + 0.01 }); // dot
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled || active.current !== e.pointerId || !last.current) return;
    e.preventDefault();
    const evs = e.nativeEvent.getCoalescedEvents?.() ?? [];
    for (const ev of evs.length ? evs : [e.nativeEvent]) {
      const p = toCanvas(ev);
      segment(last.current, p);
      last.current = p;
    }
  };

  const end = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (active.current !== e.pointerId) return;
    active.current = null;
    last.current = null;
    dirty.current = true;
    persist();
    onStroke?.();
  };

  const doUndo = () => {
    const img = undo.current.pop();
    if (img) ink().putImageData(img, 0, 0);
    setCanUndo(undo.current.length > 0);
    persist();
    onStroke?.();
  };

  const clearAll = () => {
    snapshot();
    ink().clearRect(0, 0, CANVAS_W, CANVAS_H);
    persist();
    onStroke?.();
  };

  // Stop an in-progress stroke when locked
  useEffect(() => {
    if (disabled) {
      active.current = null;
      last.current = null;
    }
  }, [disabled]);

  const style = { width: box.w || "100%", height: box.h || "auto" };

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-3">
      <div ref={wrapRef} className="relative grid min-h-0 flex-1 place-items-center">
        <div
          className={`relative overflow-hidden rounded-2xl shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)] ring-1 ring-gold/30 transition ${
            disabled ? "opacity-80 saturate-50" : ""
          }`}
          style={style}
        >
          <canvas ref={bgRef} width={CANVAS_W} height={CANVAS_H} className="absolute inset-0 h-full w-full" />
          <canvas
            ref={inkRef}
            width={CANVAS_W}
            height={CANVAS_H}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={end}
            onPointerCancel={end}
            onLostPointerCapture={end}
            onContextMenu={(e) => e.preventDefault()}
            className={`absolute inset-0 h-full w-full ${tool === "eraser" ? "cursor-cell" : "cursor-crosshair"}`}
            style={{ touchAction: "none" }}
          />
        </div>
      </div>

      <div
        className={`flex flex-wrap items-center justify-center gap-2 transition ${disabled ? "pointer-events-none opacity-40" : ""}`}
      >
        <ToolButton active={tool === "pen"} onClick={() => setTool("pen")} label="Pen">
          <path d="M3 21l3.8-1 11-11-2.8-2.8-11 11L3 21z M14 6.2l2.8 2.8 2-2a2 2 0 000-2.8 2 2 0 00-2.8 0l-2 2z" />
        </ToolButton>
        <ToolButton active={tool === "eraser"} onClick={() => setTool("eraser")} label="Viskelæder">
          <path d="M16.2 3.6l4.2 4.2a2 2 0 010 2.8L11 20H6.4l-3-3a2 2 0 010-2.8L13.4 3.6a2 2 0 012.8 0zM8.6 11L5 14.6l2.6 2.6h2.6l1.6-1.6L8.6 11z" />
        </ToolButton>

        <span className="mx-1 h-8 w-px bg-gold/25" />

        {SIZES.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSize(s.id)}
            aria-label={s.label}
            aria-pressed={size === s.id}
            className={`grid h-12 w-12 place-items-center rounded-xl border transition ${
              size === s.id ? "border-gold bg-gold/15" : "border-gold/20 hover:border-gold/50"
            }`}
          >
            <span className="rounded-full bg-cream" style={{ width: 4 + s.px * 0.8, height: 4 + s.px * 0.8 }} />
          </button>
        ))}

        <span className="mx-1 h-8 w-px bg-gold/25" />

        <button type="button" onClick={doUndo} disabled={!canUndo} className="btn btn-ghost h-12">
          Fortryd
        </button>
        <button type="button" onClick={clearAll} className="btn btn-danger h-12">
          Ryd alt
        </button>
      </div>
    </div>
  );
});

function ToolButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex h-12 items-center gap-2 rounded-xl border px-3 text-sm font-semibold transition ${
        active ? "border-gold bg-gold text-ink" : "border-gold/25 text-gold-soft hover:border-gold/60"
      }`}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
        {children}
      </svg>
      {label}
    </button>
  );
}
