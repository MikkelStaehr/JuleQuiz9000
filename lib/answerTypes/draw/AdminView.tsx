"use client";

import { useState } from "react";
import { ZoomImage } from "@/components/ZoomImage";
import { formatDa, formatDanishInput } from "@/lib/format";
import { publicImageUrl } from "@/lib/supabase/browser";
import { signed, teamColor, type Team } from "@/lib/types";
import type { ClosestJudgment, ManualJudgment, PartsJudgment } from "../types";
import type { AdminViewProps } from "../ui";
import { drawPath } from "./score";

/**
 * Every drawing (after lock) with judging controls per scoring mode:
 * closest – type the value read off the drawing (or mark "ugyldig"); ranking is computed when all are read.
 * manual-parts – ✓/✗ per part.  manual – 0/1/2.
 */
export default function DrawAdminView({ q, teams, answers, scoreFor, onJudge, pending }: AdminViewProps) {
  const [zoom, setZoom] = useState<{ src: string; alt: string } | null>(null);
  const entries = teams.flatMap((t) => {
    const a = answers.find((x) => x.team_id === t.id);
    const path = drawPath(a?.value);
    return a && path ? [{ team: t, a, path }] : [];
  });
  const missing = teams.filter((t) => !entries.some((e) => e.team.id === t.id));

  if (entries.length === 0)
    return <p className="text-sm text-cream/50">Tegningerne kommer, når tiden er gået (de uploades ved lås).</p>;

  const judgedCount = entries.filter((e) => {
    const j = (e.a.judgment ?? {}) as ClosestJudgment;
    return j.invalid || typeof j.read === "number";
  }).length;

  return (
    <div className="space-y-3">
      {q.scoring === "closest" && (
        <p className={`rounded-lg px-3 py-2 text-xs ${judgedCount === entries.length ? "bg-emerald-400/15 text-emerald-200" : "bg-gold/10 text-gold-soft"}`}>
          Aflæst {judgedCount}/{entries.length}
          {judgedCount === entries.length ? " – point er beregnet (tættest på facit)." : " – point beregnes, når alle tegninger er aflæst eller markeret ugyldige."}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        {entries.map(({ team, a, path }) => {
          const src = publicImageUrl(path, a.submitted_at);
          const s = scoreFor(team.id);
          return (
            <div key={team.id} className="overflow-hidden rounded-xl bg-pine-950/60 ring-1 ring-gold/15">
              <button onClick={() => setZoom({ src, alt: `Tegning fra ${team.name}` })} className="block w-full bg-white" aria-label="Forstør">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="aspect-[10/7] w-full object-contain" />
              </button>
              <div className="space-y-2 p-2">
                <div className="flex items-center gap-2 text-sm">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: teamColor(team.slot) }} />
                  <span className="flex-1 truncate font-semibold">{team.name}</span>
                  {s && <span className="tabular text-xs font-bold text-gold">{signed(s.points)} p</span>}
                </div>
                {q.scoring === "closest" && (
                  <ClosestControls key={`${team.id}-${JSON.stringify(a.judgment ?? {})}`} team={team} judgment={(a.judgment ?? {}) as ClosestJudgment} unit={q.unit} onJudge={onJudge} pending={pending} />
                )}
                {q.scoring === "manual-parts" && (
                  <div className="space-y-1">
                    {q.parts.map((p, i) => {
                      const cur = ((a.judgment ?? {}) as PartsJudgment).parts ?? [];
                      const set = (ok: boolean) => {
                        const next = q.parts.map((_, k) => (k === i ? ok : (cur[k] ?? null)));
                        onJudge?.(team.id, { parts: next });
                      };
                      return (
                        <div key={p} className="flex items-center gap-2 text-sm">
                          <span className="flex-1 text-cream/70">{p}</span>
                          <button disabled={pending} onClick={() => set(true)} className={`h-8 w-9 rounded-md font-bold ${cur[i] === true ? "bg-emerald-400 text-ink" : "border border-emerald-300/40 text-emerald-300"}`} aria-label={`${p} rigtig`}>
                            ✓
                          </button>
                          <button disabled={pending} onClick={() => set(false)} className={`h-8 w-9 rounded-md font-bold ${cur[i] === false ? "bg-alarm text-cream" : "border border-alarm/40 text-[#ffb4b6]"}`} aria-label={`${p} forkert`}>
                            ✗
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
                {q.scoring === "manual" && (
                  <div className="flex gap-1.5">
                    {q.manualPoints.map((p) => {
                      const on = ((a.judgment ?? {}) as ManualJudgment).points === p;
                      return (
                        <button key={p} disabled={pending} onClick={() => onJudge?.(team.id, { points: p })} className={`h-9 flex-1 rounded-lg text-sm font-bold ${on ? "bg-gold text-ink" : "border border-gold/30 text-gold-soft hover:border-gold/60"}`}>
                          {p}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {missing.length > 0 && <p className="text-xs text-cream/40">Ingen tegning: {missing.map((t) => t.name).join(", ")}</p>}
      {zoom && <ZoomImage src={zoom.src} alt={zoom.alt} onClose={() => setZoom(null)} />}
    </div>
  );
}

function ClosestControls({
  team,
  judgment,
  unit,
  onJudge,
  pending,
}: {
  team: Team;
  judgment: ClosestJudgment;
  unit: string;
  onJudge: AdminViewProps["onJudge"];
  pending: boolean;
}) {
  const [text, setText] = useState(typeof judgment.read === "number" ? formatDa(judgment.read) : "");
  const commit = () => {
    const n = formatDanishInput(text).n;
    if (n !== judgment.read) onJudge?.(team.id, { read: n, invalid: false });
  };
  return (
    <div className="flex items-center gap-1.5">
      <label className={`flex min-w-0 flex-1 items-baseline gap-1 rounded-lg border bg-pine-950/70 px-2 py-1.5 ${judgment.invalid ? "border-alarm/40 opacity-50" : "border-gold/30 focus-within:border-gold"}`}>
        <input
          value={text}
          inputMode="decimal"
          placeholder="Aflæst værdi"
          aria-label={`Aflæst værdi for ${team.name}`}
          disabled={judgment.invalid}
          onChange={(e) => setText(formatDanishInput(e.target.value).text)}
          onBlur={commit}
          data-read-input
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            const all = [...document.querySelectorAll<HTMLInputElement>("[data-read-input]:not(:disabled)")];
            const next = all[all.indexOf(e.currentTarget) + 1];
            if (next) next.focus();
            else e.currentTarget.blur();
          }}
          className="tabular min-w-0 flex-1 bg-transparent text-right text-sm font-semibold outline-none"
        />
        {unit && <span className="text-xs text-gold">{unit}</span>}
      </label>
      <button
        disabled={pending}
        onClick={() => onJudge?.(team.id, { invalid: !judgment.invalid, read: judgment.read ?? null })}
        className={`h-8 shrink-0 rounded-lg px-2 text-xs font-semibold ${judgment.invalid ? "bg-alarm text-cream" : "border border-alarm/40 text-[#ffb4b6]"}`}
      >
        Ugyldig
      </button>
    </div>
  );
}
