export function Star({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="currentColor"
        d="M12 1.5l2.6 7.1 7.4.3-5.8 4.6 2 7.2L12 16.6l-6.2 4.1 2-7.2L2 8.9l7.4-.3z"
      />
    </svg>
  );
}

/** "DEN KÆMPE STORE ELITE JULE QUIZ" wordmark. */
export function Wordmark({ size = "md" }: { size?: "sm" | "md" | "xl" }) {
  const cls =
    size === "xl"
      ? "text-[3.9vw] tracking-[0.14em]"
      : size === "sm"
        ? "text-[13px] tracking-[0.2em]"
        : "text-xl tracking-[0.16em] sm:text-2xl";
  return (
    <div className="flex items-center justify-center gap-[0.6em] text-gold">
      <Star className={size === "xl" ? "h-[2.4vw] w-[2.4vw]" : size === "sm" ? "h-3 w-3" : "h-5 w-5"} />
      <span className={`font-display font-semibold uppercase leading-none text-balance text-center ${cls}`}>Den kæmpe store elite jule quiz</span>
      <Star className={size === "xl" ? "h-[2.4vw] w-[2.4vw]" : size === "sm" ? "h-3 w-3" : "h-5 w-5"} />
    </div>
  );
}

export function RoundLabel({
  round,
  totalRounds,
  index,
  roundSize,
  className = "",
}: {
  round: number;
  totalRounds: number;
  index?: number;
  roundSize?: number;
  className?: string;
}) {
  return (
    <div className={`tabular font-semibold uppercase tracking-[0.25em] text-gold ${className}`}>
      Runde {round} / {totalRounds}
      {index !== undefined && roundSize !== undefined && (
        <>
          <span className="mx-[0.6em] text-gold/50">·</span>
          Spørgsmål {index} / {roundSize}
        </>
      )}
    </div>
  );
}
