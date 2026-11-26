export type Phase = "idle" | "question" | "countdown" | "locked" | "reveal" | "scoreboard" | "finished";
export type MediaType = "none" | "image" | "audio" | "video";
export type MediaCommand = "play" | "pause" | "stop";

export type Scoring = "manual" | "closest";
export type CanvasBackground = "blank" | "scale";

/** One question in /data/quiz.json (`questions`). */
export interface QuizQuestion {
  round: number;
  roundTitle: string;
  index: number;
  text: string;
  mediaType: MediaType;
  mediaUrl: string | null;
  answer: string;
  timerSeconds: number;
  /** Only "draw" for now – teams can only draw. */
  answerType: "draw";
  /** "scale" when scaleMin/scaleMax/unit are given, otherwise "blank" (can be overridden). */
  canvasBackground: CanvasBackground;
  scaleMin: number | null;
  scaleMax: number | null;
  unit: string | null;
  /** Numeric facit for scale questions (used for the reveal marker and "closest" scoring). */
  answerValue: number | null;
  /** Resolved from the round (question may override). */
  scoring: Scoring;
  pointMultiplier: number;
  /** Base points for 1st/2nd/3rd closest (before multiplier). */
  closestPoints: number[];
}

/** Optional per-round settings in /data/quiz.json (`rounds`). */
export interface RoundConfig {
  round: number;
  title?: string;
  scoring?: Scoring;
  pointMultiplier?: number;
  closestPoints?: number[];
}

export interface Game {
  id: string;
  name: string;
  active: boolean;
  is_demo: boolean;
  created_at: string;
}

/** Public team columns (join_code / auth_uid are not readable by clients). */
export interface Team {
  id: string;
  game_id: string;
  slot: number;
  name: string | null;
  joined_at: string | null;
  is_demo: boolean;
}

export interface TeamWithCode extends Team {
  join_code: string;
}

export interface GameState {
  game_id: string;
  phase: Phase;
  current_round: number;
  current_index: number;
  question_key: string;
  total_rounds: number;
  round_size: number;
  round_title: string | null;
  question_text: string | null;
  media_type: MediaType;
  media_url: string | null;
  answer_text: string | null;
  timer_seconds: number | null;
  timer_ends_at: string | null;
  media_command: MediaCommand;
  media_command_at: string | null;
  updated_at: string;
  scoring: Scoring;
  point_multiplier: number;
  canvas_background: CanvasBackground;
  scale_min: number | null;
  scale_max: number | null;
  scale_unit: string | null;
  answer_value: number | null;
}

export interface Scale {
  min: number;
  max: number;
  unit: string;
}

export function stateScale(s: Pick<GameState, "canvas_background" | "scale_min" | "scale_max" | "scale_unit"> | null): Scale | null {
  if (!s || s.canvas_background !== "scale" || s.scale_min === null || s.scale_max === null) return null;
  return { min: s.scale_min, max: s.scale_max, unit: s.scale_unit ?? "" };
}

export function formatScaleValue(v: number, scale: Scale) {
  const range = Math.abs(scale.max - scale.min);
  const decimals = range <= 10 ? 1 : 0;
  const n = v.toLocaleString("da-DK", { maximumFractionDigits: decimals, minimumFractionDigits: 0 });
  return scale.unit ? `${n} ${scale.unit}` : n;
}

export function multiplierLabel(m: number) {
  return m === 2 ? "Dobbelt point" : m === 3 ? "Tredobbelt point" : `×${m} point`;
}

/** 8 distinct team colours (by slot), readable on dark green; gold is reserved for the facit. */
export const TEAM_COLORS = ["#ff6b6b", "#4dabf7", "#ffa94d", "#b197fc", "#38d9a9", "#f783ac", "#a9e34b", "#f8f9fa"];
export const teamColor = (slot: number) => TEAM_COLORS[(slot - 1) % TEAM_COLORS.length];

export interface Answer {
  id: string;
  game_id: string;
  team_id: string;
  question_key: string;
  image_path: string;
  submitted_at: string;
  scale_value: number | null;
}

export interface Score {
  game_id: string;
  team_id: string;
  question_key: string;
  points: number;
}

export const TEAM_COLUMNS = "id, game_id, slot, name, joined_at, is_demo";

export function questionKey(round: number, index: number) {
  return `r${round}-q${index}`;
}

export function answerPath(gameId: string, qKey: string, teamId: string) {
  return `${gameId}/${qKey}/${teamId}.png`;
}
