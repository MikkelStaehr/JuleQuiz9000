"use client";

import { publicImageUrl } from "@/lib/supabase/browser";
import type { Answer } from "@/lib/types";

/** White answer card: drawing + team name + total points (+ points for this question). */
export function AnswerCard({
  teamName,
  answer,
  total,
  questionPoints,
  size = "lg",
  delay = 0,
}: {
  teamName: string;
  answer: Answer | undefined;
  total: number;
  questionPoints?: number;
  size?: "sm" | "lg";
  delay?: number;
}) {
  const lg = size === "lg";
  return (
    <figure
      className="animate-pop flex min-h-0 flex-col overflow-hidden rounded-[1.1vmin] bg-cream text-ink shadow-[0_2vmin_5vmin_-2vmin_rgba(0,0,0,0.7)]"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="relative aspect-[10/7] w-full bg-white">
        {answer ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={publicImageUrl(answer.image_path, answer.submitted_at)}
            alt={`Tegning fra ${teamName}`}
            className="absolute inset-0 h-full w-full object-contain"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-ink/35">
            <span className={lg ? "text-[1.6vw] italic" : "text-sm italic"}>Intet svar</span>
          </div>
        )}
        {questionPoints !== undefined && (
          <span
            className={`animate-pop absolute right-[4%] top-[5%] rounded-full font-bold tabular shadow-md ${
              questionPoints > 0 ? "bg-gold text-ink" : "bg-ink/80 text-cream"
            } ${lg ? "px-[0.8vw] py-[0.3vw] text-[1.5vw]" : "px-2 py-0.5 text-xs"}`}
          >
            +{questionPoints}
          </span>
        )}
      </div>
      <figcaption
        className={`flex items-center justify-between gap-3 border-t border-ink/10 ${lg ? "px-[1.1vw] py-[0.7vw]" : "px-3 py-2"}`}
      >
        <span className={`truncate font-semibold ${lg ? "text-[1.55vw]" : "text-sm"}`}>{teamName}</span>
        <span className={`tabular shrink-0 font-bold text-gold-deep ${lg ? "text-[1.55vw]" : "text-sm"}`}>
          {total} p
        </span>
      </figcaption>
    </figure>
  );
}
