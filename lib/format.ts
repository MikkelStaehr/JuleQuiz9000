// Danish number formatting for inputs ("1200,5" → "1.200,5").

export function formatDanishInput(raw: string, allowNegative = false): { text: string; n: number | null } {
  const neg = allowNegative && raw.trim().startsWith("-");
  const cleaned = raw.replace(/[^\d,]/g, "");
  const [intPart = "", ...decParts] = cleaned.split(",");
  const dec = decParts.join("").slice(0, 2);
  const intDigits = intPart.replace(/^0+(?=\d)/, "").slice(0, 12);
  const grouped = intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const text = (neg ? "-" : "") + grouped + (cleaned.includes(",") ? `,${dec}` : "");
  if (!intDigits && !dec) return { text: neg ? "-" : text, n: null };
  const n = Number(`${neg ? "-" : ""}${intDigits || "0"}.${dec || "0"}`);
  return { text, n: Number.isFinite(n) ? n : null };
}

export const formatDa = (n: number) => n.toLocaleString("da-DK", { maximumFractionDigits: 2 });
