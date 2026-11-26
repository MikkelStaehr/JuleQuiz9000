// A question may have a headline + body text (e.g. a news story: "Due fanget af fartkamera" + the article). Pure.

export interface SplitText {
  headline: string | null;
  body: string;
}

/** Text that starts with one short line followed by a blank line: the first line is a headline. */
export function detectHeadline(text: string): SplitText | null {
  const m = text.match(/^\s*([^\n]{1,140})\n\s*\n([\s\S]+)$/);
  return m ? { headline: m[1].trim(), body: m[2].trim() } : null;
}

/** The explicit headline field wins; otherwise a "headline + blank line" text is split automatically. */
export function splitHeadline(text: string, headline: unknown): SplitText {
  if (typeof headline === "string" && headline.trim()) return { headline: headline.trim(), body: text.trim() };
  return detectHeadline(text) ?? { headline: null, body: text };
}
