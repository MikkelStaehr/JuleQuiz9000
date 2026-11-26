import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCoordinates } from "./coords.ts";

const near = (p: { lat: number; lng: number } | null, lat: number, lng: number) => {
  assert.ok(p, "expected a point");
  assert.ok(Math.abs(p!.lat - lat) < 1e-4 && Math.abs(p!.lng - lng) < 1e-4, JSON.stringify(p));
};

test("decimal (Google Maps copy)", () => {
  near(parseCoordinates("55.3277, 8.76"), 55.3277, 8.76);
  near(parseCoordinates("  55.3277 8.76 "), 55.3277, 8.76);
  near(parseCoordinates("(-33.8568, 151.2153)"), -33.8568, 151.2153);
});

test("Danish decimal commas", () => {
  near(parseCoordinates("55,3277 8,76"), 55.3277, 8.76);
  near(parseCoordinates("55,3277; 8,76"), 55.3277, 8.76);
});

test("degrees/minutes/seconds", () => {
  near(parseCoordinates(`55°19'39.7"N 8°45'36.0"E`), 55.327694, 8.76);
  near(parseCoordinates(`33°51'24.5"S 151°12'55.1"E`), -33.856806, 151.215306);
  near(parseCoordinates(`8°45'36"E 55°19'39.7"N`), 55.327694, 8.76); // order swapped
});

test("Google Maps links", () => {
  near(parseCoordinates("https://www.google.com/maps/@55.3277,8.76,15z"), 55.3277, 8.76);
  near(
    parseCoordinates("https://www.google.com/maps/place/Ribe/@55.32,8.70,13z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d55.3277!4d8.76"),
    55.3277,
    8.76,
  ); // the place pin (!3d!4d) wins over the map centre (@)
  near(parseCoordinates("https://maps.google.com/?q=55.3277,8.76"), 55.3277, 8.76);
});

test("rejects garbage and out-of-range values", () => {
  assert.equal(parseCoordinates(""), null);
  assert.equal(parseCoordinates("Ribe"), null);
  assert.equal(parseCoordinates("95.0, 8.0"), null);
  assert.equal(parseCoordinates("55.3, 8.7, 3"), null);
});
