"use client";

import { DrawingCanvas } from "@/components/DrawingCanvas";
import type { PlayInputProps } from "../ui";

/** Canvas (pen/eraser/undo/clear, 3 widths). The container exports + uploads the PNG when the timer locks. */
export default function DrawPlayInput({ q, disabled, canvasRef, persistKey }: PlayInputProps) {
  const scoring = q.payload.scoring as string | undefined;
  const parts = (q.payload.parts as string[] | undefined) ?? [];
  const unit = (q.payload.unit as string | undefined) ?? "";
  const hint =
    scoring === "manual-parts" && parts.length
      ? `Tegn eller skriv: ${parts.join(" + ")}`
      : scoring === "closest"
        ? `Skriv/tegn jeres bud${unit ? ` (${unit})` : ""} – tydeligt!`
        : null;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {hint && <p className="shrink-0 text-center text-sm font-semibold text-gold">{hint}</p>}
      <div className="min-h-0 flex-1">
        <DrawingCanvas ref={canvasRef} disabled={disabled} persistKey={persistKey} />
      </div>
    </div>
  );
}
