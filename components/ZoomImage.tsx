"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Fullscreen image viewer with pinch-zoom (touch), wheel-zoom (mouse) and drag to pan.
 * Double-tap / double-click resets.
 */
export function ZoomImage({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const [t, setT] = useState({ s: 1, x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; s: number } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const clampS = (s: number) => Math.min(6, Math.max(1, s));
  const dist = () => {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black/95"
      role="dialog"
      aria-label="Billede i fuld skærm"
    >
      <div className="flex shrink-0 items-center justify-between p-3 text-sm text-cream/70">
        <span>Knib eller scroll for at zoome · træk for at flytte</span>
        <button onClick={onClose} className="btn btn-gold px-4 py-2">Luk</button>
      </div>
      <div
        className="relative min-h-0 flex-1 overflow-hidden"
        style={{ touchAction: "none" }}
        onWheel={(e) => setT((p) => ({ ...p, s: clampS(p.s * (e.deltaY < 0 ? 1.15 : 1 / 1.15)) }))}
        onDoubleClick={() => setT({ s: 1, x: 0, y: 0 })}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (pointers.current.size === 2) pinch.current = { d: dist(), s: t.s };
        }}
        onPointerMove={(e) => {
          const prev = pointers.current.get(e.pointerId);
          if (!prev) return;
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (pointers.current.size === 2 && pinch.current) {
            const ratio = dist() / (pinch.current.d || 1);
            setT((p) => ({ ...p, s: clampS(pinch.current!.s * ratio) }));
          } else if (pointers.current.size === 1) {
            setT((p) => ({ ...p, x: p.x + (e.clientX - prev.x), y: p.y + (e.clientY - prev.y) }));
          }
        }}
        onPointerUp={(e) => {
          pointers.current.delete(e.pointerId);
          if (pointers.current.size < 2) pinch.current = null;
        }}
        onPointerCancel={(e) => {
          pointers.current.delete(e.pointerId);
          pinch.current = null;
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          draggable={false}
          className="absolute inset-0 m-auto max-h-full max-w-full select-none object-contain"
          style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.s})`, transformOrigin: "center" }}
        />
      </div>
    </div>
  );
}
