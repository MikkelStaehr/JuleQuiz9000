import type { AnswerTypeId, MediaType, PublicQuestion } from "./answerTypes/types";

export type Phase = "idle" | "question" | "countdown" | "locked" | "reveal" | "scoreboard" | "finished";
export type MediaCommand = "play" | "pause" | "stop";
export type ScoreSource = "auto" | "approved" | "manual";

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
  point_multiplier: number;
  answer_type: AnswerTypeId;
  // shown question (no facit) – copied in by the quizmaster
  question_text: string | null;
  media_type: MediaType;
  media_url: string | null;
  show_text_on_play: boolean;
  public_payload: Record<string, unknown>;
  // reveal
  answer_text: string | null;
  reveal_payload: Record<string, unknown> | null;
  reveal_step: number;
  // timer + media
  timer_seconds: number | null;
  timer_ends_at: string | null;
  media_command: MediaCommand;
  media_command_at: string | null;
  media_seek: number | null;
  updated_at: string;
}

/** What clients may read: THAT a team answered – never the value (until revealed_answers()). */
export interface AnswerStatus {
  id: string;
  game_id: string;
  team_id: string;
  question_key: string;
  submitted_at: string;
}

/** Full answer (revealed_answers() after reveal, or server-side for the quizmaster). */
export interface AnswerValue {
  team_id: string;
  value: unknown;
  wager: number | null;
  /** Quizmaster's judgment of a drawing: {read, invalid} · {parts} · {points} */
  judgment?: Record<string, unknown> | null;
  submitted_at: string;
}

export interface Score {
  game_id: string;
  team_id: string;
  question_key: string;
  round: number | null;
  points: number;
  detail: Record<string, unknown> | null;
  source: ScoreSource;
}

export const TEAM_COLUMNS = "id, game_id, slot, name, joined_at, is_demo";
export const ANSWER_COLUMNS = "id, game_id, team_id, question_key, submitted_at";
export const SCORE_COLUMNS = "game_id, team_id, question_key, round, points, detail, source";

export function publicQuestion(s: GameState): PublicQuestion {
  return {
    key: s.question_key,
    answerType: s.answer_type,
    text: s.question_text ?? "",
    mediaType: s.media_type,
    mediaUrl: s.media_url,
    showTextOnPlay: s.show_text_on_play,
    payload: s.public_payload ?? {},
  };
}

export function multiplierLabel(m: number) {
  return m === 2 ? "Dobbelt point" : m === 3 ? "Tredobbelt point" : `×${m} point`;
}

/** 8 distinct team colours (by slot), readable on dark green; gold is reserved for the facit. */
export const TEAM_COLORS = ["#ff6b6b", "#4dabf7", "#ffa94d", "#b197fc", "#38d9a9", "#f783ac", "#a9e34b", "#f8f9fa"];
export const teamColor = (slot: number) => TEAM_COLORS[(slot - 1) % TEAM_COLORS.length];

export const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);
