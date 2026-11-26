// Countries for questions like "Er det lovligt?" – ISO 3166-1 alpha-2 codes; Danish names come from Intl.

const CODES = (
  "AD AE AF AG AL AM AO AR AT AU AZ BA BB BD BE BF BG BH BI BJ BN BO BR BS BT BW BY BZ CA CD CF CG CH CI CL CM CN CO CR CU CV CY CZ " +
  "DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FM FO FR GA GB GD GE GH GL GM GN GQ GR GT GW GY HK HN HR HT HU ID IE IL IN IQ IR IS IT " +
  "JM JO JP KE KG KH KI KM KN KP KR KW KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MG MH MK ML MM MN MO MR MT MU MV MW MX MY MZ " +
  "NA NE NG NI NL NO NP NR NZ OM PA PE PG PH PK PL PS PT PW PY QA RO RS RU RW SA SB SC SD SE SG SI SK SL SM SN SO SR SS ST SV SY SZ " +
  "TD TG TH TJ TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VN VU WS XK YE ZA ZM ZW"
).split(" ");

let names: Intl.DisplayNames | null = null;
function displayNames() {
  try {
    names ??= new Intl.DisplayNames(["da"], { type: "region" });
  } catch {
    names = null;
  }
  return names;
}

export const isCountryCode = (c: unknown): c is string => typeof c === "string" && /^[A-Z]{2}$/.test(c);

/** "SG" → "Singapore" (Danish). */
export function countryName(code: string): string {
  if (code === "XK") return "Kosovo";
  return displayNames()?.of(code) ?? code;
}

/** All countries, sorted by Danish name (for pickers). */
export function countryList(): { code: string; name: string }[] {
  return CODES.map((code) => ({ code, name: countryName(code) })).sort((a, b) => a.name.localeCompare(b.name, "da"));
}

// Islands take "på" in Danish (på Island, på Færøerne …)
const PAA = new Set(["FO", "GL", "IS", "MT", "CY", "CU", "JM", "MV", "MU", "SC", "FJ", "BS", "BB", "LC", "GD", "DM", "TT", "HT"]);

/** "I Singapore" / "På Island" */
export const inCountry = (code: string) => `${PAA.has(code) ? "På" : "I"} ${countryName(code)}`;

/** Flag image (SVG) – flag emojis don't render on Windows. */
export const flagUrl = (code: string) => `https://flagcdn.com/${code.toLowerCase()}.svg`;
