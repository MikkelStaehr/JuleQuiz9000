"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Wordmark } from "@/components/Brand";
import { Flag } from "@/components/Flag";
import { parseCoordinates } from "@/lib/answerTypes/geo/coords";
import { countryList, countryName } from "@/lib/countries";
import { WORLD, type MapView } from "@/lib/answerTypes/geo/view";
import { getSupabase } from "@/lib/supabase/browser";
import { createMediaUpload, saveQuiz } from "../actions";

const EditorMap = dynamic(() => import("@/lib/answerTypes/geo/maps").then((m) => m.EditorMap), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-xs text-cream/50">Indlæser kort…</div>,
});

// ───────────── raw quiz.json shape (what is saved) ─────────────

type AnswerType = "draw" | "geo" | "true-false";
type Scoring = "closest" | "manual-parts" | "manual";
type Media = "none" | "image" | "audio" | "video";

interface RawQuestion {
  key: string;
  text: string;
  mediaType: Media;
  mediaUrl: string | null;
  timerSeconds?: number;
  answer: unknown;
  showTextOnPlay?: boolean;
  revealMediaUrl?: string | null;
  mapStart?: MapView;
  [extra: string]: unknown;
}

interface RawRound {
  number: number;
  title: string;
  answerType: AnswerType;
  scoring?: Scoring;
  unit?: string;
  parts?: string[];
  labels?: { true: string; false: string };
  wagerEnabled?: boolean;
  pointMultiplier?: number;
  defaultTimerSeconds?: number;
  pointsByRank?: number[];
  pointsCorrect?: number;
  manualPoints?: number[];
  questions: RawQuestion[];
  [extra: string]: unknown;
}

const TYPE_LABEL: Record<AnswerType, string> = { draw: "Tegning", geo: "Kort (hvor er vi?)", "true-false": "Sandt / falsk" };
const SCORING_LABEL: Record<Scoring, string> = {
  closest: "Tættest på (quizmaster aflæser tallet)",
  "manual-parts": "Pr. del (✓/✗ pr. del, fx Sang + Kunstner)",
  manual: "Manuelt (0/1/2)",
};
const LABEL_PRESETS = [
  { true: "SANDT", false: "FALSK" },
  { true: "LOVLIGT", false: "ULOVLIGT" },
  { true: "ÆGTE", false: "FAKE" },
  { true: "JA", false: "NEJ" },
];

const newKey = () => `q-${Math.random().toString(36).slice(2, 8)}`;

function defaultAnswer(r: RawRound): unknown {
  if (r.answerType === "true-false") return true;
  if (r.answerType === "geo") return { lat: 55.6761, lng: 12.5683, label: "" };
  return r.scoring === "closest" ? 0 : "";
}

function newQuestion(r: RawQuestion | null, round: RawRound): RawQuestion {
  return { key: newKey(), text: "", mediaType: round.answerType === "geo" ? "image" : "none", mediaUrl: null, answer: defaultAnswer(round), ...(r ?? {}) };
}

function newRound(n: number): RawRound {
  const r: RawRound = { number: n, title: "Ny runde", answerType: "true-false", labels: LABEL_PRESETS[0], wagerEnabled: false, pointMultiplier: 1, questions: [] };
  r.questions = [newQuestion(null, r)];
  return r;
}

/** Make answers fit a (changed) round type / scoring. */
function coerceAnswer(q: RawQuestion, r: RawRound): unknown {
  const a = q.answer;
  if (r.answerType === "true-false") return typeof a === "boolean" ? a : true;
  if (r.answerType === "geo") {
    const g = a as { lat?: unknown; lng?: unknown; label?: unknown } | null;
    return g && typeof g.lat === "number" && typeof g.lng === "number" ? g : defaultAnswer(r);
  }
  if (r.scoring === "closest") return typeof a === "number" ? a : Number(String(a ?? "").replace(/\./g, "").replace(",", ".")) || 0;
  return typeof a === "string" ? a : typeof a === "number" ? String(a) : "";
}

function normalizeContent(input: unknown): RawRound[] {
  const rounds = (input as { rounds?: RawRound[] } | null)?.rounds;
  if (!Array.isArray(rounds)) throw new Error("Filen skal have formatet { rounds: [...] }");
  return rounds.map((r, i) => ({ ...r, number: i + 1, questions: (r.questions ?? []).map((q) => ({ ...q, key: q.key || newKey() })) }));
}

/** "quiz.json rounds[1].questions[0]: …" → "Runde 2, spørgsmål 1: …" */
function friendlyError(msg: string) {
  return msg
    .replace(/quiz\.json rounds\[(\d+)\]\.questions\[(\d+)\]/g, (_, r, q) => `Runde ${Number(r) + 1}, spørgsmål ${Number(q) + 1}`)
    .replace(/quiz\.json rounds\[(\d+)\]/g, (_, r) => `Runde ${Number(r) + 1}`);
}

const numList = (s: string) =>
  s
    .split(/[,;\s]+/)
    .map((x) => Number(x.replace(",", ".")))
    .filter((n) => Number.isFinite(n));

// ───────────── editor ─────────────

export function QuizEditor({ initial }: { initial: unknown }) {
  const [rounds, setRounds] = useState<RawRound[]>(() => normalizeContent(initial));
  const [sel, setSel] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [saving, startSave] = useTransition();
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const update = (fn: (rs: RawRound[]) => RawRound[]) => {
    setRounds((rs) => fn(structuredClone(rs)).map((r, i) => ({ ...r, number: i + 1 })));
    setDirty(true);
    setMsg(null);
  };
  const round = rounds[sel];
  const totalQ = rounds.reduce((n, r) => n + r.questions.length, 0);

  const save = () =>
    startSave(async () => {
      const content = { rounds: rounds.map((r, i) => ({ ...r, number: i + 1 })) };
      const res = await saveQuiz(content);
      if (res.ok) {
        setDirty(false);
        setMsg({ kind: "ok", text: `Gemt ✓ – ${res.data} spørgsmål. Nye spil bruger den nye quiz med det samme.` });
      } else setMsg({ kind: "error", text: friendlyError(res.error) });
    });

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ rounds }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `quiz-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importJson = async (file: File) => {
    try {
      const next = normalizeContent(JSON.parse(await file.text()));
      if (!window.confirm(`Erstat hele quizzen med ${file.name}? (${next.length} runder) – husk at gemme bagefter.`)) return;
      setRounds(next);
      setSel(0);
      setDirty(true);
      setMsg({ kind: "ok", text: "Importeret – tryk “Gem quiz” for at gemme." });
    } catch (e) {
      setMsg({ kind: "error", text: `Kunne ikke importere: ${(e as Error).message}` });
    }
  };

  return (
    <main className="mx-auto max-w-[1400px] p-4 sm:p-6">
      <header className="sticky top-0 z-[1000] -mx-4 mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-gold/15 bg-pine-950/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex items-center gap-4">
          <a href="/admin" className="btn btn-ghost" onClick={(e) => dirty && !window.confirm("Du har ændringer, der ikke er gemt. Forlad siden?") && e.preventDefault()}>
            ← Kontrolpanel
          </a>
          <div>
            <Wordmark size="sm" />
            <p className="mt-1 text-xs text-cream/50">
              Quiz-editor · {rounds.length} runder · {totalQ} spørgsmål {dirty && <span className="text-gold">· ikke gemt</span>}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-ghost" onClick={exportJson}>Eksportér JSON</button>
          <button className="btn btn-ghost" onClick={() => importRef.current?.click()}>Importér JSON</button>
          <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
          <button className="btn btn-gold px-6" disabled={saving || !dirty} onClick={save}>
            {saving ? "Gemmer…" : "Gem quiz"}
          </button>
        </div>
      </header>

      {msg && (
        <p className={`mb-4 rounded-xl px-4 py-3 text-sm ${msg.kind === "ok" ? "bg-emerald-400/15 text-emerald-200" : "border border-alarm/40 bg-alarm/10 text-[#ffc9ca]"}`}>{msg.text}</p>
      )}

      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        {/* rounds */}
        <aside className="space-y-2">
          {rounds.map((r, i) => (
            <div
              key={i}
              role="button"
              tabIndex={0}
              onClick={() => setSel(i)}
              onKeyDown={(e) => e.key === "Enter" && setSel(i)}
              className={`group cursor-pointer rounded-xl border p-3 transition ${i === sel ? "border-gold bg-gold/10" : "border-gold/15 bg-pine-900/60 hover:border-gold/40"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-gold">Runde {i + 1}</p>
                  <p className="truncate font-semibold">{r.title || "Uden titel"}</p>
                  <p className="text-xs text-cream/50">
                    {TYPE_LABEL[r.answerType]} · {r.questions.length} spm.
                    {(r.pointMultiplier ?? 1) > 1 && <span className="text-gold"> · ×{r.pointMultiplier}</span>}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col gap-1 opacity-60 group-hover:opacity-100">
                  <IconBtn label="Flyt op" disabled={i === 0} onClick={(e) => (e.stopPropagation(), update((rs) => swap(rs, i, i - 1)), setSel(i - 1))}>▲</IconBtn>
                  <IconBtn label="Flyt ned" disabled={i === rounds.length - 1} onClick={(e) => (e.stopPropagation(), update((rs) => swap(rs, i, i + 1)), setSel(i + 1))}>▼</IconBtn>
                </div>
              </div>
            </div>
          ))}
          <button className="btn btn-ghost w-full" onClick={() => (update((rs) => [...rs, newRound(rs.length + 1)]), setSel(rounds.length))}>
            + Tilføj runde
          </button>
        </aside>

        {/* selected round */}
        {round ? (
          <section className="space-y-5">
            <RoundSettings
              key={`${sel}-${round.answerType}-${round.scoring ?? ""}`}
              round={round}
              onChange={(patch, coerce) =>
                update((rs) => {
                  const r = { ...rs[sel], ...patch };
                  if (coerce) r.questions = r.questions.map((q) => ({ ...q, answer: coerceAnswer(q, r) }));
                  rs[sel] = r;
                  return rs;
                })
              }
              onDelete={() => {
                if (!window.confirm(`Slet runde ${sel + 1} “${round.title}” med ${round.questions.length} spørgsmål?`)) return;
                update((rs) => rs.filter((_, i) => i !== sel));
                setSel(Math.max(0, sel - 1));
              }}
            />
            {round.questions.map((q, qi) => (
              <QuestionCard
                key={q.key}
                round={round}
                q={q}
                index={qi}
                count={round.questions.length}
                onChange={(patch) =>
                  update((rs) => {
                    rs[sel].questions[qi] = { ...rs[sel].questions[qi], ...patch };
                    return rs;
                  })
                }
                onMove={(d) => update((rs) => ((rs[sel].questions = swap(rs[sel].questions, qi, qi + d)), rs))}
                onDuplicate={() => update((rs) => (rs[sel].questions.splice(qi + 1, 0, { ...structuredClone(q), key: newKey() }), rs))}
                onDelete={() => window.confirm(`Slet spørgsmål ${qi + 1}?`) && update((rs) => ((rs[sel].questions = rs[sel].questions.filter((_, i) => i !== qi)), rs))}
              />
            ))}
            <button className="btn btn-ghost w-full py-3" onClick={() => update((rs) => (rs[sel].questions.push(newQuestion(null, rs[sel])), rs))}>
              + Tilføj spørgsmål til runde {sel + 1}
            </button>
          </section>
        ) : (
          <p className="text-cream/50">Ingen runder – tilføj en runde.</p>
        )}
      </div>
    </main>
  );
}

function swap<T>(xs: T[], a: number, b: number): T[] {
  if (b < 0 || b >= xs.length) return xs;
  const out = [...xs];
  [out[a], out[b]] = [out[b], out[a]];
  return out;
}

function IconBtn({ label, children, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" aria-label={label} title={label} className="h-6 w-6 rounded text-[10px] text-gold hover:bg-gold/15 disabled:opacity-20" {...p}>
      {children}
    </button>
  );
}

function Field({ label, hint, children, className = "" }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block space-y-1.5 ${className}`}>
      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">{label}</span>
      {children}
      {hint && <span className="block text-xs text-cream/40">{hint}</span>}
    </label>
  );
}

const input = "field py-2";

function RoundSettings({ round, onChange, onDelete }: { round: RawRound; onChange: (patch: Partial<RawRound>, coerceAnswers?: boolean) => void; onDelete: () => void }) {
  const [partsText, setPartsText] = useState((round.parts ?? []).join(", "));
  return (
    <div className="card-dark space-y-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-3xl">Runde {round.number}</h2>
        <button className="btn btn-danger" onClick={onDelete}>Slet runde</button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Titel" className="sm:col-span-2">
          <input className={input} value={round.title} onChange={(e) => onChange({ title: e.target.value })} />
        </Field>
        <Field label="Svartype">
          <select
            className={input}
            value={round.answerType}
            onChange={(e) => {
              const t = e.target.value as AnswerType;
              const patch: Partial<RawRound> = { answerType: t };
              if (t === "draw" && !round.scoring) patch.scoring = "manual";
              if (t === "true-false" && !round.labels) patch.labels = LABEL_PRESETS[0];
              onChange(patch, true);
            }}
          >
            {(Object.keys(TYPE_LABEL) as AnswerType[]).map((t) => (
              <option key={t} value={t}>{TYPE_LABEL[t]}</option>
            ))}
          </select>
        </Field>
        <Field label="Point-gange" hint="2 = DOBBELT POINT">
          <select className={input} value={round.pointMultiplier ?? 1} onChange={(e) => onChange({ pointMultiplier: Number(e.target.value) })}>
            {[1, 2, 3, 4, 5].map((m) => (
              <option key={m} value={m}>×{m}</option>
            ))}
          </select>
        </Field>
        <Field label="Standard-timer (sek.)" hint="Tom = typens standard">
          <NumberInput value={round.defaultTimerSeconds} onChange={(n) => onChange({ defaultTimerSeconds: n ?? undefined })} integer />
        </Field>

        {round.answerType === "draw" && (
          <>
            <Field label="Pointgivning" className="sm:col-span-2">
              <select className={input} value={round.scoring ?? "manual"} onChange={(e) => onChange({ scoring: e.target.value as Scoring }, true)}>
                {(Object.keys(SCORING_LABEL) as Scoring[]).map((s) => (
                  <option key={s} value={s}>{SCORING_LABEL[s]}</option>
                ))}
              </select>
            </Field>
            {round.scoring === "closest" && (
              <>
                <Field label="Standard-enhed" hint="Kan ændres pr. spørgsmål">
                  <input className={input} value={round.unit ?? ""} onChange={(e) => onChange({ unit: e.target.value })} />
                </Field>
                <Field label="Point pr. placering" hint="1., 2., 3. plads …">
                  <input className={input} defaultValue={(round.pointsByRank ?? [3, 2, 1]).join(", ")} onBlur={(e) => onChange({ pointsByRank: numList(e.target.value) })} />
                </Field>
              </>
            )}
            {round.scoring === "manual-parts" && (
              <>
                <Field label="Dele" hint="Kommasepareret, fx Sang, Kunstner">
                  <input
                    className={input}
                    value={partsText}
                    onChange={(e) => setPartsText(e.target.value)}
                    onBlur={() => onChange({ parts: partsText.split(",").map((s) => s.trim()).filter(Boolean) })}
                  />
                </Field>
                <Field label="Point pr. rigtig del">
                  <NumberInput value={round.pointsCorrect ?? 1} onChange={(n) => onChange({ pointsCorrect: n ?? 1 })} integer />
                </Field>
              </>
            )}
            {round.scoring === "manual" && (
              <Field label="Point-knapper" hint="fx 0, 1, 2">
                <input className={input} defaultValue={(round.manualPoints ?? [0, 1, 2]).join(", ")} onBlur={(e) => onChange({ manualPoints: numList(e.target.value) })} />
              </Field>
            )}
          </>
        )}

        {round.answerType === "geo" && (
          <Field label="Point pr. placering" hint="Tætteste nål: 1., 2., 3. plads …" className="sm:col-span-2">
            <input className={input} defaultValue={(round.pointsByRank ?? [3, 2, 1]).join(", ")} onBlur={(e) => onChange({ pointsByRank: numList(e.target.value) })} />
          </Field>
        )}

        {round.answerType === "true-false" && (
          <>
            <Field label="Knap for SAND">
              <input className={input} value={round.labels?.true ?? ""} onChange={(e) => onChange({ labels: { true: e.target.value.toUpperCase(), false: round.labels?.false ?? "" } })} />
            </Field>
            <Field label="Knap for FALSK">
              <input className={input} value={round.labels?.false ?? ""} onChange={(e) => onChange({ labels: { true: round.labels?.true ?? "", false: e.target.value.toUpperCase() } })} />
            </Field>
            <div className="flex flex-wrap items-end gap-2 sm:col-span-2">
              {LABEL_PRESETS.map((p) => (
                <button key={p.true} type="button" className="btn btn-ghost px-3 py-1.5 text-xs" onClick={() => onChange({ labels: p })}>
                  {p.true} / {p.false}
                </button>
              ))}
            </div>
            <Toggle label="Satsning 1–3 point (forkert svar koster)" checked={round.wagerEnabled === true} onChange={(v) => onChange({ wagerEnabled: v })} />
            {!round.wagerEnabled && (
              <Field label="Point for rigtigt svar">
                <NumberInput value={round.pointsCorrect ?? 1} onChange={(n) => onChange({ pointsCorrect: n ?? 1 })} integer />
              </Field>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 self-end py-2 text-sm">
      <span className={`relative h-6 w-11 rounded-full transition ${checked ? "bg-gold" : "bg-pine-700"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-cream transition-all ${checked ? "left-[22px]" : "left-0.5"}`} />
      </span>
      <input type="checkbox" className="sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

/** Danish number parsing: "50,73%" → 50.73 · "1.200 kr." → 1200 · "-31,2" → -31.2 (units are ignored). */
export function parseDanishNumber(text: string): number | null {
  const raw = text
    .replace(/[^\d,.\-]/g, "") // drop units, spaces, %
    .replace(/\.(?=\d{3}(\D|$))/g, "") // thousands separators
    .replace(",", ".");
  if (!raw || raw === "-" || raw === ".") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function NumberInput({ value, onChange, integer = false, placeholder }: { value: number | undefined | null; onChange: (n: number | null) => void; integer?: boolean; placeholder?: string }) {
  const [text, setText] = useState(value === undefined || value === null ? "" : String(value).replace(".", ","));
  const [bad, setBad] = useState(false);
  return (
    <>
      <input
        className={`${input} tabular ${bad ? "border-alarm" : ""}`}
        inputMode={integer ? "numeric" : "decimal"}
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value);
          setBad(false);
        }}
        onBlur={() => {
          if (!text.trim()) return onChange(null);
          const p = parseDanishNumber(text);
          if (p === null) return setBad(true);
          const n = integer ? Math.round(p) : p;
          onChange(n);
          setText(String(n).replace(".", ","));
        }}
      />
      {bad && <span className="block text-xs text-[#ffb4b6]">Skriv kun et tal (fx 50,73) – enheden skrives i feltet “Enhed”</span>}
    </>
  );
}

function QuestionCard({
  round,
  q,
  index,
  count,
  onChange,
  onMove,
  onDuplicate,
  onDelete,
}: {
  round: RawRound;
  q: RawQuestion;
  index: number;
  count: number;
  onChange: (patch: Partial<RawQuestion>) => void;
  onMove: (d: -1 | 1) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="card-dark space-y-4 p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-widest text-gold">Spørgsmål {index + 1}</h3>
        <div className="flex gap-1">
          <button className="btn btn-ghost px-2 py-1 text-xs" disabled={index === 0} onClick={() => onMove(-1)}>▲</button>
          <button className="btn btn-ghost px-2 py-1 text-xs" disabled={index === count - 1} onClick={() => onMove(1)}>▼</button>
          <button className="btn btn-ghost px-2 py-1 text-xs" onClick={onDuplicate}>Kopiér</button>
          <button className="btn btn-danger px-2 py-1 text-xs" onClick={onDelete}>Slet</button>
        </div>
      </div>

      <Field label="Spørgsmål" hint={round.answerType === "draw" && round.scoring === "manual" ? "Fx anmeldelsen – slå “vis på holdskærm” til, hvis den er lang" : undefined}>
        <textarea className={`${input} min-h-20 text-lg`} value={q.text} onChange={(e) => onChange({ text: e.target.value })} placeholder="Skriv spørgsmålet…" />
      </Field>

      <div className="grid gap-4 md:grid-cols-2">
        <MediaField
          label={round.answerType === "geo" ? "Street View-screenshot (påkrævet)" : "Medie (billede / lyd / video)"}
          url={q.mediaUrl}
          mediaType={q.mediaType}
          onChange={(url, kind) => onChange({ mediaUrl: url, mediaType: url ? kind : "none" })}
        />
        <div className="space-y-4">
          <AnswerField round={round} q={q} onChange={onChange} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Timer (sek.)" hint={`Tom = ${round.defaultTimerSeconds ?? "standard"}`}>
              <NumberInput value={q.timerSeconds} onChange={(n) => onChange({ timerSeconds: n ?? undefined })} integer />
            </Field>
            <Toggle label="Vis teksten på holdskærm" checked={q.showTextOnPlay === true} onChange={(v) => onChange({ showTextOnPlay: v })} />
          </div>
        </div>
      </div>

      <CountryField value={typeof q.country === "string" ? q.country : null} onChange={(c) => onChange({ country: c ?? undefined })} />

      <Field label="Forklaring (valgfri)" hint="Vises under facit på storskærmen og holdenes skærme – fx loven bag svaret">
        <textarea
          className={`${input} min-h-16`}
          value={typeof q.explanation === "string" ? q.explanation : ""}
          maxLength={800}
          placeholder="Fx: Ifølge færdselsloven skal cykler have lys tændt i mørke – bøden er 700 kr."
          onChange={(e) => onChange({ explanation: e.target.value || undefined })}
        />
      </Field>

      <Field label="Kilde (valgfri)" hint="Vises under facit på storskærmen, fx “Danmarks Statistik, 2025”">
        <input className={input} value={typeof q.source === "string" ? q.source : ""} maxLength={200} onChange={(e) => onChange({ source: e.target.value || undefined })} />
      </Field>

      <details className="rounded-xl bg-pine-950/40 p-3">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-widest text-cream/50">Ekstra: medie efter facit</summary>
        <div className="mt-3">
          <MediaField
            label="Vises/afspilles efter facit (fx den rigtige artikel eller originalsangen)"
            url={q.revealMediaUrl ?? null}
            mediaType={guessKind(q.revealMediaUrl)}
            onChange={(url) => onChange({ revealMediaUrl: url })}
          />
        </div>
      </details>
    </div>
  );
}

function AnswerField({ round, q, onChange }: { round: RawRound; q: RawQuestion; onChange: (patch: Partial<RawQuestion>) => void }) {
  if (round.answerType === "true-false") {
    const labels = round.labels ?? LABEL_PRESETS[0];
    return (
      <Field label="Facit">
        <div className="grid grid-cols-2 gap-2">
          {[true, false].map((v) => (
            <button
              key={String(v)}
              type="button"
              onClick={() => onChange({ answer: v })}
              className={`rounded-xl border-2 py-3 font-black tracking-wider ${q.answer === v ? (v ? "border-emerald-300 bg-emerald-400 text-ink" : "border-[#ff8a8d] bg-alarm") : "border-gold/25 text-cream/70"}`}
            >
              {v ? labels.true || "SAND" : labels.false || "FALSK"}
            </button>
          ))}
        </div>
      </Field>
    );
  }
  if (round.answerType === "geo") return <GeoAnswer q={q} onChange={onChange} />;
  if (round.scoring === "closest") {
    const unit = typeof q.unit === "string" ? q.unit : (round.unit ?? "");
    return (
      <div className="grid grid-cols-[1fr_8rem] gap-3">
        <Field label={`Facit (tal${unit ? `, ${unit}` : ""})`}>
          <NumberInput value={typeof q.answer === "number" ? q.answer : null} onChange={(n) => onChange({ answer: n ?? 0 })} />
        </Field>
        <Field label="Enhed" hint={round.unit ? `Tom = rundens “${round.unit}”` : "fx %, kr. eller tom"}>
          <input
            className={input}
            value={typeof q.unit === "string" ? q.unit : ""}
            placeholder={round.unit ?? ""}
            onChange={(e) => onChange({ unit: e.target.value === "" ? undefined : e.target.value })}
          />
        </Field>
      </div>
    );
  }
  return (
    <Field label="Facit (vises ved reveal)" hint={round.scoring === "manual-parts" ? `Fx: Titel · Kunstner (dele: ${(round.parts ?? []).join(", ")})` : undefined}>
      <input className={input} value={typeof q.answer === "string" ? q.answer : ""} onChange={(e) => onChange({ answer: e.target.value })} />
    </Field>
  );
}

function GeoAnswer({ q, onChange }: { q: RawQuestion; onChange: (patch: Partial<RawQuestion>) => void }) {
  const a = (q.answer ?? {}) as { lat?: number; lng?: number; label?: string };
  const facit = typeof a.lat === "number" && typeof a.lng === "number" ? { lat: a.lat, lng: a.lng, label: a.label ?? "" } : null;
  const [view, setView] = useState<MapView | null>(null);
  const start = useMemo(() => q.mapStart ?? (facit ? { lat: facit.lat, lng: facit.lng, zoom: 5 } : WORLD), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [coordText, setCoordText] = useState("");
  const [coordErr, setCoordErr] = useState(false);
  const [focus, setFocus] = useState<{ lat: number; lng: number; n: number } | null>(null);
  const applyCoords = () => {
    if (!coordText.trim()) return;
    const p = parseCoordinates(coordText);
    if (!p) return setCoordErr(true);
    setCoordErr(false);
    onChange({ answer: { ...a, lat: p.lat, lng: p.lng } });
    setFocus((f) => ({ ...p, n: (f?.n ?? 0) + 1 }));
    setCoordText("");
  };
  return (
    <div className="space-y-2">
      <Field label="Facit – stedets navn">
        <input className={input} value={a.label ?? ""} placeholder="fx Ribe, Danmark" onChange={(e) => onChange({ answer: { ...a, label: e.target.value } })} />
      </Field>
      <Field
        label="Indsæt koordinater"
        hint="Fx 55.3277, 8.7600 – i Google Maps: højreklik på stedet og klik på tallene øverst for at kopiere. Grader (55°19'39.7&quot;N …) og Google Maps-links virker også."
      >
        <div className="flex gap-2">
          <input
            className={`${input} min-w-0 flex-1 ${coordErr ? "border-alarm" : ""}`}
            value={coordText}
            placeholder="55.3277, 8.7600"
            onChange={(e) => {
              setCoordText(e.target.value);
              setCoordErr(false);
            }}
            onPaste={(e) => {
              // pasting is the common case → apply right away
              const p = parseCoordinates(e.clipboardData.getData("text"));
              if (p) {
                e.preventDefault();
                onChange({ answer: { ...a, lat: p.lat, lng: p.lng } });
                setFocus((f) => ({ ...p, n: (f?.n ?? 0) + 1 }));
                setCoordText("");
                setCoordErr(false);
              }
            }}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), applyCoords())}
          />
          <button type="button" className="btn btn-ghost px-4" onClick={applyCoords}>
            Sæt
          </button>
        </div>
        {coordErr && <span className="block text-xs text-[#ffb4b6]">Kunne ikke læse koordinaterne – prøv formatet 55.3277, 8.7600</span>}
      </Field>
      <p className="text-xs text-cream/50">…eller klik på kortet for at sætte facit (træk i nålen for at justere).</p>
      <div className="h-64 overflow-hidden rounded-xl ring-1 ring-gold/25">
        <EditorMap
          start={start}
          facit={facit}
          focus={focus}
          onPick={(p) => onChange({ answer: { ...a, lat: round6(p.lat), lng: round6(p.lng) } })}
          onView={setView}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-cream/60">
        {facit && <span className="tabular">{facit.lat.toFixed(4)}, {facit.lng.toFixed(4)}</span>}
        <button type="button" className="btn btn-ghost ml-auto px-3 py-1.5 text-xs" disabled={!view} onClick={() => view && onChange({ mapStart: view })}>
          Holdenes kort starter her
        </button>
        {q.mapStart ? (
          <button type="button" className="btn btn-ghost px-3 py-1.5 text-xs" onClick={() => onChange({ mapStart: undefined })}>
            Start: zoom {q.mapStart.zoom} · nulstil (verden)
          </button>
        ) : (
          <span>Start: verdenskort</span>
        )}
      </div>
    </div>
  );
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

const COUNTRIES = typeof Intl !== "undefined" ? countryList() : [];

/** Country picker: type the Danish name (datalist), shows the flag. */
function CountryField({ value, onChange }: { value: string | null; onChange: (code: string | null) => void }) {
  const [text, setText] = useState(value ? countryName(value) : "");
  const [bad, setBad] = useState(false);
  const commit = (t: string) => {
    const v = t.trim();
    if (!v) {
      setBad(false);
      return onChange(null);
    }
    const hit =
      COUNTRIES.find((c) => c.name.toLowerCase() === v.toLowerCase()) ??
      COUNTRIES.find((c) => c.code === v.toUpperCase()) ??
      (COUNTRIES.filter((c) => c.name.toLowerCase().startsWith(v.toLowerCase())).length === 1
        ? COUNTRIES.find((c) => c.name.toLowerCase().startsWith(v.toLowerCase()))
        : undefined);
    if (!hit) return setBad(true);
    setBad(false);
    setText(hit.name);
    onChange(hit.code);
  };
  return (
    <Field label="Land (valgfrit)" hint="Vises med flag på storskærm og holdskærme – fx til “Er det lovligt?”, hvor loven afhænger af landet">
      <div className="flex items-center gap-3">
        {value ? <Flag code={value} className="h-9" /> : <span className="grid h-9 w-[54px] place-items-center rounded bg-pine-950/60 text-xs text-cream/30">flag</span>}
        <input
          className={`${input} min-w-0 flex-1 ${bad ? "border-alarm" : ""}`}
          list="country-list"
          value={text}
          placeholder="Skriv et land, fx Singapore"
          onChange={(e) => {
            setText(e.target.value);
            setBad(false);
            // picking from the list fills the exact name → apply right away
            if (COUNTRIES.some((c) => c.name === e.target.value)) commit(e.target.value);
          }}
          onBlur={() => commit(text)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), commit(text))}
        />
        {value && (
          <button
            type="button"
            className="btn btn-ghost px-3 py-1.5 text-xs"
            onClick={() => {
              setText("");
              onChange(null);
            }}
          >
            Fjern
          </button>
        )}
      </div>
      {bad && <span className="block text-xs text-[#ffb4b6]">Kender ikke det land – vælg fra listen</span>}
      <datalist id="country-list">
        {COUNTRIES.map((c) => (
          <option key={c.code} value={c.name} />
        ))}
      </datalist>
    </Field>
  );
}

function guessKind(url: string | null | undefined): Media {
  if (!url) return "none";
  if (/\.(mp3|wav|ogg|oga|m4a|aac|flac)(\?|$)/i.test(url)) return "audio";
  if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(url)) return "video";
  return "image";
}

const looksLikeUrl = (u: string) => /^(https?:\/\/\S+|\/\S+)$/.test(u.trim());

function MediaField({ label, url, mediaType, onChange }: { label: string; url: string | null; mediaType: Media; onChange: (url: string | null, kind: Media) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [urlText, setUrlText] = useState(url ?? "");
  const [seenUrl, setSeenUrl] = useState(url);
  if (url !== seenUrl) {
    // the url changed from outside (upload / remove) → show it
    setSeenUrl(url);
    setUrlText(url ?? "");
  }
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    setBusy(true);
    setErr(null);
    try {
      const kind: Media = file.type.startsWith("audio/") ? "audio" : file.type.startsWith("video/") ? "video" : file.type.startsWith("image/") ? "image" : "none";
      if (kind === "none") throw new Error("Kun billede, lyd eller video");
      if (file.size > 50 * 1024 * 1024) throw new Error("Filen er større end 50 MB");
      const r = await createMediaUpload(file.name);
      if (!r.ok || !r.data) throw new Error(r.ok ? "Ukendt fejl" : r.error);
      const { error } = await getSupabase().storage.from(r.data.bucket).uploadToSignedUrl(r.data.path, r.data.token, file, { contentType: file.type });
      if (error) throw new Error(error.message);
      onChange(r.data.publicUrl, kind);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const kind = url ? (mediaType !== "none" ? mediaType : guessKind(url)) : "none";
  return (
    <div className="space-y-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">{label}</span>
      <div
        className="grid min-h-40 place-items-center overflow-hidden rounded-xl border border-dashed border-gold/30 bg-pine-950/50"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) upload(f);
        }}
      >
        {busy ? (
          <span className="text-sm text-cream/60">Uploader…</span>
        ) : !url ? (
          <button type="button" className="p-6 text-center text-sm text-cream/50" onClick={() => fileRef.current?.click()}>
            Træk en fil hertil eller <span className="text-gold underline">vælg fil</span>
          </button>
        ) : kind === "audio" ? (
          <audio controls src={url} className="w-[90%]" />
        ) : kind === "video" ? (
          <video controls src={url} className="max-h-56 w-full" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="max-h-56 w-full object-contain" />
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*,audio/*,video/*" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      <div className="flex items-center gap-2">
        <input
          className="field min-w-0 flex-1 py-1.5 text-xs"
          placeholder="…eller indsæt en URL (https://…)"
          value={urlText}
          onChange={(e) => {
            setUrlText(e.target.value);
            setErr(null);
          }}
          onBlur={() => {
            const v = urlText.trim();
            if (!v) return onChange(null, "none");
            if (!looksLikeUrl(v)) return setErr("Det er ikke en adresse. Er det en kilde (fx “YouGov, 2021”)? Så skriv den i feltet “Kilde” længere nede.");
            onChange(v, guessKind(v));
          }}
        />
        {url && (
          <button type="button" className="btn btn-ghost px-3 py-1.5 text-xs" onClick={() => fileRef.current?.click()}>
            Skift
          </button>
        )}
        {url && (
          <button type="button" className="btn btn-danger px-3 py-1.5 text-xs" onClick={() => onChange(null, "none")}>
            Fjern
          </button>
        )}
      </div>
      {err && <p className="text-xs text-[#ffb4b6]">{err}</p>}
    </div>
  );
}
