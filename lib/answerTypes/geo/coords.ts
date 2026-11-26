// Parse pasted coordinates (pure – unit tested in coords.test.mts).
// Accepts: "55.3277, 8.76" · "55,3277 8,76" · DMS "55°19'39.7"N 8°45'36.0"E" · Google Maps links (@lat,lng / !3d…!4d… / q=lat,lng).

export interface LatLngPoint {
  lat: number;
  lng: number;
}

const valid = (lat: number, lng: number): LatLngPoint | null =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
    ? { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 }
    : null;

function dms(text: string): LatLngPoint | null {
  // 55°19'39.7"N 8°45'36.0"E  (also with ′ ″ and decimal commas, minutes/seconds optional)
  const re = /(\d{1,3}(?:[.,]\d+)?)\s*°\s*(?:(\d{1,2}(?:[.,]\d+)?)\s*['′’]\s*)?(?:(\d{1,2}(?:[.,]\d+)?)\s*(?:"|″|''|”)\s*)?([NSEWØV])/gi;
  const parts = [...text.matchAll(re)];
  if (parts.length !== 2) return null;
  const toDeg = (m: RegExpMatchArray) => {
    const n = (s?: string) => (s ? Number(s.replace(",", ".")) : 0);
    const v = n(m[1]) + n(m[2]) / 60 + n(m[3]) / 3600;
    return /[SWV]/i.test(m[4]) ? -v : v;
  };
  const [a, b] = parts;
  const aIsLat = /[NS]/i.test(a[4]);
  return aIsLat ? valid(toDeg(a), toDeg(b)) : valid(toDeg(b), toDeg(a));
}

export function parseCoordinates(input: string): LatLngPoint | null {
  const text = input.trim();
  if (!text) return null;

  // Google Maps links
  const d34 = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(text); // exact place pin
  if (d34) return valid(Number(d34[1]), Number(d34[2]));
  const at = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(text); // map centre
  if (at) return valid(Number(at[1]), Number(at[2]));
  const q = /[?&](?:q|query|ll|center)=(-?\d+(?:\.\d+)?)(?:,|%2C)\s*(-?\d+(?:\.\d+)?)/i.exec(text);
  if (q) return valid(Number(q[1]), Number(q[2]));

  if (/°/.test(text)) return dms(text);

  // Danish decimal commas: "55,3277 8,76" or "55,3277; 8,76"
  const dk = /^(-?\d{1,3}),(\d+)\s*[;\s]\s*(-?\d{1,3}),(\d+)$/.exec(text);
  if (dk) return valid(Number(`${dk[1]}.${dk[2]}`), Number(`${dk[3]}.${dk[4]}`));

  // Plain decimals: "55.3277, 8.76" / "55.3277 8.76" / "(55.3277, 8.76)"
  const nums = text.replace(/[()[\]]/g, " ").match(/-?\d+(?:\.\d+)?/g);
  if (nums && nums.length === 2) return valid(Number(nums[0]), Number(nums[1]));
  return null;
}
