// "Hvad har de anmeldt?" – show a question as a review card. Pure – used by the quiz loader (server) and the card (client).

export type ReviewSite = "google" | "tripadvisor";
export const REVIEW_SITES: ReviewSite[] = ["google", "tripadvisor"];

/** What goes into public_payload.review (never contains the facit). */
export interface ReviewInfo {
  site: ReviewSite;
  author: string;
  /** 1–5 */
  rating: number;
  /** Free text, e.g. "for 2 uger siden" or "december 2025" */
  date: string;
  /** Headline (Tripadvisor style) */
  title: string | null;
  /** Number of reviews the author has written ("Lokalguide · 37 anmeldelser") */
  count: number;
}

const NAMES = ["Birthe Kjær", "Henning Lauridsen", "Lone Mikkelsen", "Kurt Bøgh", "Jette Thomsen", "Poul Erik Dam", "Gitte Hvid", "Bent Juhl", "Hanne Skov", "Svend Aage Ravn"];
const DATES = ["for 2 uger siden", "for en måned siden", "for 3 dage siden", "for et år siden", "for 5 måneder siden", "i går"];

function hash(s: string) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** Star characters at the end of the text ("… ★★☆☆☆") become the rating and are removed from the text. */
export function splitStars(text: string): { text: string; rating: number | null } {
  const m = text.match(/\s*([★☆]+)\s*$/);
  if (!m) return { text, rating: null };
  const filled = [...m[1]].filter((c) => c === "★").length;
  return { text: text.slice(0, m.index).trim(), rating: Math.min(5, Math.max(1, filled)) };
}

/** Strip surrounding quotes – a review card doesn't need them. */
export const reviewBody = (text: string) => splitStars(text).text.replace(/^[“"„«»]+|[”"“«»]+$/g, "").trim();

/**
 * Resolve the review for a question. round.reviewStyle turns it on; question.review { author, rating, date, title }
 * fills it in – missing fields get playful defaults (stable per question key). Throws on invalid values.
 */
export function resolveReview(style: unknown, raw: unknown, key: string, text: string): ReviewInfo | null {
  if (style === undefined || style === null || style === "" || style === "none") return null;
  if (!REVIEW_SITES.includes(style as ReviewSite)) throw new Error(`reviewStyle skal være ${REVIEW_SITES.join(" | ")}`);
  const r = (raw ?? {}) as Record<string, unknown>;
  if (typeof r !== "object" || Array.isArray(r)) throw new Error("review skal være { author, rating, date, title }");
  const rating = r.rating ?? splitStars(text).rating ?? 1 + (hash(key) % 5);
  if (!Number.isInteger(rating) || (rating as number) < 1 || (rating as number) > 5) throw new Error("review.rating skal være 1–5");
  const h = hash(key);
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 80) : null);
  return {
    site: style as ReviewSite,
    author: str(r.author) ?? NAMES[h % NAMES.length],
    rating: rating as number,
    date: str(r.date) ?? DATES[(h >>> 4) % DATES.length],
    title: str(r.title),
    count: 3 + ((h >>> 8) % 140),
  };
}

export function asReview(v: unknown): ReviewInfo | null {
  const r = v as ReviewInfo | null | undefined;
  return r && REVIEW_SITES.includes(r.site) && typeof r.author === "string" ? r : null;
}
