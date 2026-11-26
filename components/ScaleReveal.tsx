"use client";

import { useEffect, useState } from "react";
import { fracOf, ticks } from "@/lib/scale";
import { chime } from "@/lib/sound";
import { formatScaleValue, teamColor, type Answer, type Scale, type Team } from "@/lib/types";

const VB_W = 1000;
const X0 = 50;
const X1 = 950;
const AXIS_Y = 250;
const ROWS = [190, 140, 90, 40]; // label rows above the axis

const STAGGER = 260; // ms between team markers
const FACIT_PAUSE = 1100; // extra suspense before the facit

/**
 * Reveal for scale questions: every team's cross on one shared axis in team colours,
 * then the facit marker drops in last; closest team(s) get highlighted.
 */
export function ScaleReveal({
  scale,
  answerValue,
  answerText,
  teams,
  answers,
  pointsFor,
  totals,
}: {
  scale: Scale;
  answerValue: number | null;
  answerText: string | null;
  teams: Team[];
  answers: Answer[];
  pointsFor: (teamId: string) => number | undefined;
  totals: Map<string, number>;
}) {
  const byTeam = new Map(answers.map((a) => [a.team_id, a]));
  const x = (v: number) => X0 + Math.min(1, Math.max(0, fracOf(v, scale))) * (X1 - X0);

  // Teams in slot order (reveal order), with values
  const marks = teams
    .map((t) => ({ team: t, v: byTeam.get(t.id)?.scale_value ?? null }))
    .filter((m): m is { team: Team; v: number } => m.v !== null);

  // Greedy label rows so names don't overlap
  const placed: { id: string; row: number; lx: number }[] = [];
  const rowEnds = ROWS.map(() => -Infinity);
  [...marks]
    .sort((a, b) => a.v - b.v)
    .forEach((m) => {
      const w = Math.min(220, 22 + (m.team.name?.length ?? 4) * 12.5);
      const cx = Math.min(VB_W - w / 2 - 4, Math.max(w / 2 + 4, x(m.v)));
      let row = rowEnds.findIndex((end) => cx - w / 2 > end + 8);
      if (row < 0) row = rowEnds.indexOf(Math.min(...rowEnds));
      rowEnds[row] = cx + w / 2;
      placed.push({ id: m.team.id, row, lx: cx });
    });
  const labelOf = new Map(placed.map((p) => [p.id, p]));

  const facitDelay = marks.length * STAGGER + FACIT_PAUSE;
  const dist = (v: number) => (answerValue === null ? Infinity : Math.abs(v - answerValue));
  const best = marks.length ? Math.min(...marks.map((m) => dist(m.v))) : Infinity;

  const [facitShown, setFacitShown] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => {
      setFacitShown(true);
      chime();
    }, facitDelay + 200);
    return () => clearTimeout(id);
  }, [facitDelay]);

  const ranking = [...teams]
    .map((t) => ({ t, v: byTeam.get(t.id)?.scale_value ?? null }))
    .sort((a, b) => (a.v === null ? 1 : 0) - (b.v === null ? 1 : 0) || (a.v !== null && b.v !== null ? dist(a.v) - dist(b.v) : 0));

  return (
    <div className="flex w-full flex-1 flex-col items-center justify-center gap-[3vh]">
      <svg viewBox={`0 0 ${VB_W} 360`} className="w-[92vw] overflow-visible" role="img" aria-label="Holdenes gæt på skalaen">
        {/* axis */}
        <rect x={X0 - 16} y={AXIS_Y - 34} width={X1 - X0 + 32} height={68} rx={12} fill="rgba(217,185,122,0.07)" />
        <line x1={X0} y1={AXIS_Y} x2={X1} y2={AXIS_Y} stroke="rgba(248,244,234,0.55)" strokeWidth={4} strokeLinecap="round" />
        {ticks(scale).map((v, i, arr) => {
          const major = arr.length <= 6 || i % 2 === 0;
          return (
            <g key={v}>
              <line x1={x(v)} x2={x(v)} y1={AXIS_Y - (major ? 14 : 8)} y2={AXIS_Y + (major ? 14 : 8)} stroke="rgba(248,244,234,0.5)" strokeWidth={major ? 3 : 2} />
              {major && (
                <text x={x(v)} y={AXIS_Y + 44} textAnchor="middle" fontSize={22} fill="rgba(248,244,234,0.6)" className="tabular">
                  {v.toLocaleString("da-DK")}
                </text>
              )}
            </g>
          );
        })}
        {scale.unit && (
          <text x={X1 + 26} y={AXIS_Y + 8} fontSize={22} fill="rgba(248,244,234,0.6)">
            {scale.unit}
          </text>
        )}

        {/* team crosses + labels */}
        {marks.map((m, i) => {
          const c = teamColor(m.team.slot);
          const mx = x(m.v);
          const lab = labelOf.get(m.team.id)!;
          const ly = ROWS[lab.row];
          const winner = facitShown && answerValue !== null && Math.abs(dist(m.v) - best) < 1e-9;
          const delay = i * STAGGER;
          return (
            <g key={m.team.id} style={{ animation: `fade-in 400ms ease ${delay}ms both` }}>
              <line x1={lab.lx} y1={ly + 10} x2={mx} y2={AXIS_Y - 24} stroke={c} strokeOpacity={0.55} strokeWidth={2} strokeDasharray="3 4" />
              <g
                style={{
                  animation: `marker-pop 450ms cubic-bezier(.2,.9,.3,1.4) ${delay}ms both`,
                  transformBox: "fill-box",
                  transformOrigin: "center",
                }}
              >
                <path
                  d={`M${mx - 16} ${AXIS_Y - 16} L${mx + 16} ${AXIS_Y + 16} M${mx + 16} ${AXIS_Y - 16} L${mx - 16} ${AXIS_Y + 16}`}
                  stroke={c}
                  strokeWidth={8}
                  strokeLinecap="round"
                />
              </g>
              <g>
                <rect
                  x={lab.lx - (Math.min(220, 22 + (m.team.name?.length ?? 4) * 12.5)) / 2}
                  y={ly - 18}
                  width={Math.min(220, 22 + (m.team.name?.length ?? 4) * 12.5)}
                  height={34}
                  rx={17}
                  fill={winner ? c : "rgba(4,17,11,0.85)"}
                  stroke={c}
                  strokeWidth={winner ? 0 : 2}
                  style={winner ? { animation: "shimmer 1.2s ease-in-out infinite" } : undefined}
                />
                <text
                  x={lab.lx}
                  y={ly + 6}
                  textAnchor="middle"
                  fontSize={19}
                  fontWeight={700}
                  fill={winner ? "#04110b" : c}
                >
                  {(m.team.name ?? "").length > 16 ? `${m.team.name!.slice(0, 15)}…` : m.team.name}
                </text>
              </g>
            </g>
          );
        })}

        {/* facit marker – last */}
        {answerValue !== null && (
          <g style={{ animation: `drop-in 900ms cubic-bezier(.2,.9,.3,1.2) ${facitDelay}ms both` }}>
            <line x1={x(answerValue)} x2={x(answerValue)} y1={AXIS_Y - 60} y2={AXIS_Y + 60} stroke="var(--color-gold)" strokeWidth={5} strokeLinecap="round" />
            <path
              d={`M${x(answerValue)} ${AXIS_Y - 62} l-16 -26 h32 z`}
              fill="var(--color-gold)"
            />
            <rect x={x(answerValue) - 110} y={AXIS_Y + 64} width={220} height={46} rx={10} fill="var(--color-gold)" />
            <text x={x(answerValue)} y={AXIS_Y + 96} textAnchor="middle" fontSize={26} fontWeight={800} fill="#13221a">
              {formatScaleValue(answerValue, scale)}
            </text>
          </g>
        )}
      </svg>

      {/* result chips (closest first) */}
      <div
        className="flex max-w-[92vw] flex-wrap justify-center gap-[0.8vw]"
        style={{ animation: `fade-in 600ms ease ${facitDelay + 700}ms both` }}
      >
        {answerText && (
          <span className="mr-[1vw] self-center text-[1.4vw] text-gold-soft">
            Facit: <span className="font-semibold">{answerText}</span>
          </span>
        )}
        {ranking.map(({ t, v }) => {
          const pts = pointsFor(t.id);
          return (
            <span
              key={t.id}
              className="flex items-center gap-[0.6vw] rounded-full border bg-pine-900/80 px-[1.1vw] py-[0.6vh] text-[1.35vw]"
              style={{ borderColor: teamColor(t.slot) }}
            >
              <span className="h-[1vw] w-[1vw] rounded-full" style={{ background: teamColor(t.slot) }} />
              <span className="max-w-[12vw] truncate font-semibold">{t.name}</span>
              <span className="tabular text-cream/70">{v === null ? "intet kryds" : formatScaleValue(v, scale)}</span>
              {pts !== undefined && <span className="tabular font-bold text-gold">+{pts}</span>}
              <span className="tabular text-cream/40">· {totals.get(t.id) ?? 0} p</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** Small axis preview shown with the question on the display. */
export function ScalePreview({ scale }: { scale: Scale }) {
  const x = (v: number) => X0 + fracOf(v, scale) * (X1 - X0);
  return (
    <svg viewBox="0 0 1000 120" className="w-[70vw]" aria-hidden>
      <line x1={X0} y1={50} x2={X1} y2={50} stroke="rgba(217,185,122,0.8)" strokeWidth={4} strokeLinecap="round" />
      {ticks(scale).map((v, i, arr) => {
        const major = arr.length <= 6 || i % 2 === 0;
        return (
          <g key={v}>
            <line x1={x(v)} x2={x(v)} y1={major ? 36 : 42} y2={major ? 64 : 58} stroke="rgba(217,185,122,0.8)" strokeWidth={major ? 3 : 2} />
            {major && (
              <text x={x(v)} y={100} textAnchor="middle" fontSize={24} fill="rgba(248,244,234,0.7)">
                {v.toLocaleString("da-DK")}
              </text>
            )}
          </g>
        );
      })}
      {scale.unit && (
        <text x={X1 + 22} y={58} fontSize={24} fill="rgba(248,244,234,0.7)">
          {scale.unit}
        </text>
      )}
    </svg>
  );
}
