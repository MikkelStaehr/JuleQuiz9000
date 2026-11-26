// Map view defaults (pure – safe to import anywhere; maps.tsx itself is client-only).
export interface MapView {
  lat: number;
  lng: number;
  zoom: number;
}
export const WORLD: MapView = { lat: 30, lng: 10, zoom: 2 };
