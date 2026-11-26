// Props contracts for the per-type UI components (client).
import type { Ref } from "react";
import type { DrawingCanvasHandle } from "@/components/DrawingCanvas";
import type { AnswerValue, Score, Team } from "../types";
import type { PublicQuestion, Question } from "./types";

export interface PlayInputProps {
  q: PublicQuestion;
  value: unknown | null;
  wager: number | null;
  /** Called on every change; the container debounces + saves (changeable until the timer locks). */
  onChange(value: unknown, wager?: number | null): void;
  disabled: boolean;
  /** Team colour */
  color: string;
  /** draw: the canvas (the container exports + uploads the PNG at lock) */
  canvasRef?: Ref<DrawingCanvasHandle>;
  /** draw: localStorage key so a refresh keeps the drawing */
  persistKey?: string | null;
}

export interface RevealProps {
  q: PublicQuestion;
  reveal: Record<string, unknown>;
  answerText: string;
  /** 1…revealSteps – advanced by the quizmaster */
  step: number;
  teams: Team[];
  answers: AnswerValue[];
  scoreFor(teamId: string): Score | undefined;
  totals: Map<string, number>;
}

export interface AdminViewProps {
  q: Question;
  teams: Team[];
  /** Live answer values (read server-side) */
  answers: AnswerValue[];
  scoreFor(teamId: string): Score | undefined;
  /** Quizmaster judgment of one team's answer (draw: read value / invalid / parts / points). */
  onJudge?(teamId: string, judgment: Record<string, unknown>): void;
  pending: boolean;
}

export interface DisplayQuestionProps {
  q: PublicQuestion;
  compact: boolean;
}
