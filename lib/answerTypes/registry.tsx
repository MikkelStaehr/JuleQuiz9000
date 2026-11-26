"use client";

// Answer-type registry (client): type → PlayInput / Reveal / AdminView (+ optional DisplayQuestion).
// Pure logic lives next to it: meta.ts (defaults, payloads, reveal steps) and scoring.ts (score.ts per type).
import type { ComponentType } from "react";
import DrawAdminView from "./draw/AdminView";
import DrawPlayInput from "./draw/PlayInput";
import DrawReveal from "./draw/Reveal";
import GeoAdminView from "./geo/AdminView";
import GeoPlayInput from "./geo/PlayInput";
import GeoReveal from "./geo/Reveal";
import TrueFalseAdminView from "./true-false/AdminView";
import { TrueFalseDisplayQuestion } from "./true-false/components";
import TrueFalsePlayInput from "./true-false/PlayInput";
import TrueFalseReveal from "./true-false/Reveal";
import type { AnswerTypeId } from "./types";
import type { AdminViewProps, DisplayQuestionProps, PlayInputProps, RevealProps } from "./ui";

export interface AnswerTypeUI {
  PlayInput: ComponentType<PlayInputProps>;
  Reveal: ComponentType<RevealProps>;
  AdminView: ComponentType<AdminViewProps>;
  /** Extra content under the question on the display */
  DisplayQuestion?: ComponentType<DisplayQuestionProps>;
  /** The answer is produced at lock (draw: export + upload the canvas) instead of saved on every change */
  submitOnLock?: boolean;
  /** The PlayInput shows the question's image itself (geo) */
  playShowsMedia?: boolean;
}

export const REGISTRY: Record<AnswerTypeId, AnswerTypeUI> = {
  draw: { PlayInput: DrawPlayInput, Reveal: DrawReveal, AdminView: DrawAdminView, submitOnLock: true },
  geo: { PlayInput: GeoPlayInput, Reveal: GeoReveal, AdminView: GeoAdminView, playShowsMedia: true },
  "true-false": {
    PlayInput: TrueFalsePlayInput,
    Reveal: TrueFalseReveal,
    AdminView: TrueFalseAdminView,
    DisplayQuestion: TrueFalseDisplayQuestion,
  },
};
