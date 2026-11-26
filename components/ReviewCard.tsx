import { reviewBody, type ReviewInfo } from "@/lib/review";

/**
 * A question shown as a review from a review site (Google Maps-like or Tripadvisor-like look, no logos).
 * All sizes are in em – set the card's size with `fontSize` (e.g. "min(2.2vw,3.4vh)" on the big screen).
 */
export function ReviewCard({
  review,
  text,
  fontSize,
  compact = false,
  className = "",
}: {
  review: ReviewInfo;
  text: string;
  fontSize: string;
  /** Smaller, body clamped to two lines (reveal header) */
  compact?: boolean;
  className?: string;
}) {
  const body = reviewBody(text);
  const Card = review.site === "tripadvisor" ? Tripadvisor : Google;
  return (
    <div
      className={`animate-pop w-full max-w-[42em] rounded-[0.9em] bg-white text-left text-[#202124] shadow-[0_1.2em_3em_-1em_rgba(0,0,0,0.75)] ${className}`}
      style={{ fontSize, fontFamily: "Roboto, 'Segoe UI', Arial, Helvetica, sans-serif" }}
    >
      <Card review={review} body={body} compact={compact} />
    </div>
  );
}

const AVATAR_COLORS = ["#1a73e8", "#d93025", "#188038", "#e37400", "#9334e6", "#007b83", "#c5221f", "#e8710a"];
function Avatar({ name, size = "2.6em" }: { name: string; size?: string }) {
  const color = AVATAR_COLORS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length];
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full font-medium text-white"
      style={{ width: size, height: size, background: color, fontSize: "1em" }}
    >
      <span style={{ fontSize: "1.2em" }}>{name.trim()[0]?.toUpperCase()}</span>
    </span>
  );
}

const clamp = (compact: boolean): React.CSSProperties =>
  compact ? { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" } : {};

// ───────────── Google Maps-like ─────────────

function Google({ review, body, compact }: { review: ReviewInfo; body: string; compact: boolean }) {
  return (
    <div className={compact ? "px-[1.1em] py-[0.8em]" : "px-[1.5em] py-[1.3em]"}>
      <div className="flex items-center gap-[0.8em]">
        <Avatar name={review.author} size={compact ? "2em" : "2.6em"} />
        <div className="min-w-0 leading-tight">
          <p className="truncate font-medium">{review.author}</p>
          <p className="truncate text-[0.78em] text-[#70757a]">
            Lokalguide · {review.count} anmeldelser · {review.count * 3 + 7} billeder
          </p>
        </div>
        <span className="ml-auto text-[1.3em] leading-none text-[#70757a]">⋮</span>
      </div>
      <div className={`flex items-center gap-[0.6em] ${compact ? "mt-[0.4em]" : "mt-[0.8em]"}`}>
        <span className="flex gap-[0.05em] text-[1.05em] leading-none">
          {[1, 2, 3, 4, 5].map((i) => (
            <span key={i} style={{ color: i <= review.rating ? "#fbbc04" : "#dadce0" }}>★</span>
          ))}
        </span>
        <span className="text-[0.82em] text-[#70757a]">{review.date}</span>
        {!compact && <span className="rounded-[0.3em] bg-[#e8f0fe] px-[0.4em] py-[0.05em] text-[0.68em] font-medium text-[#1967d2]">NY</span>}
      </div>
      {review.title && <p className={`font-medium ${compact ? "mt-[0.3em]" : "mt-[0.6em]"}`}>{review.title}</p>}
      <p className={`whitespace-pre-line leading-[1.45] ${compact ? "mt-[0.3em]" : "mt-[0.5em]"}`} style={clamp(compact)}>
        {body}
      </p>
      {!compact && (
        <div className="mt-[1em] flex items-center gap-[1.6em] text-[0.82em] text-[#5f6368]">
          <span className="flex items-center gap-[0.4em] rounded-full border border-[#dadce0] px-[0.9em] py-[0.3em]">
            <ThumbIcon /> Nyttig
          </span>
          <span className="flex items-center gap-[0.4em] rounded-full border border-[#dadce0] px-[0.9em] py-[0.3em]">
            <ShareIcon /> Del
          </span>
        </div>
      )}
    </div>
  );
}

// ───────────── Tripadvisor-like ─────────────

function Bubbles({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-[0.18em]">
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className="block rounded-full"
          style={{ width: "0.85em", height: "0.85em", border: "0.12em solid #00aa6c", background: i <= rating ? "#00aa6c" : "transparent" }}
        />
      ))}
    </span>
  );
}

function Tripadvisor({ review: r, body, compact }: { review: ReviewInfo; body: string; compact: boolean }) {
  return (
    <div className={compact ? "px-[1.1em] py-[0.8em]" : "px-[1.5em] py-[1.3em]"}>
      <div className="flex items-center gap-[0.8em]">
        <Avatar name={r.author} size={compact ? "2em" : "2.6em"} />
        <div className="min-w-0 leading-tight">
          <p className="truncate font-bold">{r.author}</p>
          <p className="truncate text-[0.78em] text-[#545454]">Danmark · {r.count} bidrag · {Math.max(1, Math.round(r.count / 4))} hjælpsomme stemmer</p>
        </div>
        <span className="ml-auto text-[1.3em] leading-none text-[#545454]">⋯</span>
      </div>
      <div className={compact ? "mt-[0.4em]" : "mt-[0.9em]"}>
        <Bubbles rating={r.rating} />
      </div>
      {r.title && <p className={`font-bold leading-tight ${compact ? "mt-[0.3em]" : "mt-[0.5em] text-[1.15em]"}`}>{r.title}</p>}
      <p className={`whitespace-pre-line leading-[1.45] ${compact ? "mt-[0.3em]" : "mt-[0.5em]"}`} style={clamp(compact)}>
        {body}
      </p>
      {!compact && (
        <>
          <p className="mt-[0.9em] text-[0.82em]">
            <span className="font-bold">Besøgsdato:</span> {r.date}
          </p>
          <p className="mt-[0.7em] border-t border-[#e0e0e0] pt-[0.7em] text-[0.68em] leading-snug text-[#767676]">
            Denne anmeldelse er anmelderens subjektive mening – ikke quizmasterens.
          </p>
        </>
      )}
    </div>
  );
}

function ThumbIcon() {
  return (
    <svg viewBox="0 0 24 24" width="1.1em" height="1.1em" fill="currentColor" aria-hidden>
      <path d="M2 20h2V9H2v11zm20-10c0-1.1-.9-2-2-2h-6.3l1-4.6v-.3c0-.4-.2-.8-.4-1.1L13.2 1 6.6 7.6C6.2 8 6 8.5 6 9v10c0 1.1.9 2 2 2h9c.8 0 1.5-.5 1.8-1.2l3-7.1c.1-.2.2-.5.2-.7v-2z" />
    </svg>
  );
}
function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" width="1.1em" height="1.1em" fill="currentColor" aria-hidden>
      <path d="M18 16.1c-.8 0-1.4.3-2 .8l-7.1-4.2c.1-.2.1-.5.1-.7s0-.5-.1-.7L16 7.2c.5.5 1.2.8 2 .8 1.7 0 3-1.3 3-3s-1.3-3-3-3-3 1.3-3 3c0 .2 0 .5.1.7L8 9.8C7.5 9.3 6.8 9 6 9c-1.7 0-3 1.3-3 3s1.3 3 3 3c.8 0 1.5-.3 2-.8l7.1 4.2c-.1.2-.1.4-.1.6 0 1.6 1.3 2.9 2.9 2.9s2.9-1.3 2.9-2.9-1.3-2.9-2.8-2.9z" />
    </svg>
  );
}
