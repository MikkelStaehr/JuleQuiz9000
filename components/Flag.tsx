"use client";

import { countryName, flagUrl, inCountry } from "@/lib/countries";

/** A flag (optionally waving) – with the country name next to it. */
export function Flag({ code, className = "", wave = false }: { code: string; className?: string; wave?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={flagUrl(code)}
      alt={`Flag: ${countryName(code)}`}
      className={`inline-block rounded-[0.12em] object-cover shadow-[0_0.15em_0.5em_rgba(0,0,0,0.45)] ring-1 ring-black/20 ${wave ? "fun-flag-wave" : ""} ${className}`}
      style={{ aspectRatio: "3 / 2" }}
    />
  );
}

/** "🇸🇬 I Singapore" banner above a question. */
export function CountryBanner({ code, size = "lg" }: { code: string; size?: "sm" | "md" | "lg" }) {
  const s =
    size === "lg"
      ? { flag: "h-[min(9vw,13vh)]", text: "text-[min(4vw,6vh)]", gap: "gap-[2vw]" }
      : size === "md"
        ? { flag: "h-[min(4.5vw,6.5vh)]", text: "text-[min(2.4vw,3.4vh)]", gap: "gap-[1.2vw]" }
        : { flag: "h-7", text: "text-lg", gap: "gap-2.5" };
  return (
    <div className={`flex items-center justify-center ${s.gap}`}>
      <Flag code={code} wave={size !== "sm"} className={s.flag} />
      <span className={`font-display font-semibold text-gold-soft ${s.text}`}>
        {inCountry(code)}
      </span>
    </div>
  );
}
