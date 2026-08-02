/**
 * The single point of contact with `astronomy-engine`.
 *
 * Nothing else in AstroLab imports that package. Everything here takes a Julian Day and
 * AstroLab's own plain types, and returns the same, so the rest of the platform stays
 * independent of the ephemeris source and a future precision/approximation switch is a change
 * to one file.
 *
 * Angles are in DEGREES and distances in AU unless a name says otherwise.
 */

import {
  AngleFromSun,
  Body,
  Ecliptic,
  Elongation,
  Equator,
  EquatorFromVector,
  GeoVector,
  HelioVector,
  Horizon,
  Illumination,
  MakeTime,
  MoonPhase,
  Observer,
  RotateVector,
  Rotation_EQJ_EQD,
  SearchMaxElongation,
  SearchMoonNode,
  SearchMoonPhase,
  SearchMoonQuarter,
  SearchLunarEclipse,
  SearchGlobalSolarEclipse,
  Seasons,
  type AstroTime,
} from "astronomy-engine";
import { j2000DaysFromJulianDay, julianDayFromJ2000Days } from "./time.ts";
import type { Cartesian } from "./frames.ts";

/** The bodies AstroLab draws. Deliberately narrower than the ephemeris supports. */
export type OrreryBody =
  | "sun"
  | "moon"
  | "mercury"
  | "venus"
  | "earth"
  | "mars"
  | "jupiter"
  | "saturn"
  | "uranus"
  | "neptune";

/** The planets, in orbital order — the sun, moon, and earth are handled separately. */
export const PLANETS = ["mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune"] as const;

const BODIES: Record<OrreryBody, Body> = {
  sun: Body.Sun,
  moon: Body.Moon,
  mercury: Body.Mercury,
  venus: Body.Venus,
  earth: Body.Earth,
  mars: Body.Mars,
  jupiter: Body.Jupiter,
  saturn: Body.Saturn,
  uranus: Body.Uranus,
  neptune: Body.Neptune,
};

export type EclipticPosition = {
  /** Ecliptic longitude of date, degrees, measured from the vernal equinox. */
  longitude: number;
  /** Ecliptic latitude, degrees. */
  latitude: number;
  /** Distance from the frame's origin, AU. */
  distance: number;
  /** The same position as a right-handed cartesian vector in the ecliptic plane, AU. */
  vector: Cartesian;
};

export type EquatorialPosition = {
  /** Right ascension in DEGREES — not the hours the ephemeris reports. */
  rightAscension: number;
  declination: number;
  distance: number;
};

export type HorizontalPosition = { azimuth: number; altitude: number };

export type MoonPhaseInfo = {
  /** Moon minus sun ecliptic longitude, degrees: 0 new, 90 first quarter, 180 full. */
  phase: number;
  /** Sun-moon-earth angle, degrees. */
  phaseAngle: number;
  /** Fraction of the disc lit, 0 to 1. */
  illuminated: number;
  /** Days since the previous new moon. */
  age: number;
  /** Sun-earth-moon angle, degrees. Near 0 or 180 an eclipse becomes possible. */
  elongation: number;
};

export type MoonQuarterName = "new" | "firstQuarter" | "full" | "lastQuarter";
export type EclipseKindName = "penumbral" | "partial" | "annular" | "total";
export type NodeKindName = "ascending" | "descending";

export type TimedEvent = { julianDay: number };
export type MoonQuarterEvent = TimedEvent & { quarter: MoonQuarterName };
export type EclipseEvent = TimedEvent & { kind: EclipseKindName };
export type SolarEclipseEvent = EclipseEvent & {
  /** Where the axis of the moon's shadow meets the earth, if it does. */
  latitude?: number;
  longitude?: number;
};
export type NodeEvent = TimedEvent & { kind: NodeKindName };

const QUARTER_NAMES: MoonQuarterName[] = ["new", "firstQuarter", "full", "lastQuarter"];

const time = (julianDay: number): AstroTime => MakeTime(j2000DaysFromJulianDay(julianDay));
const julianDay = (value: AstroTime) => julianDayFromJ2000Days(value.ut);

function eclipticFrom(vectorEqj: ReturnType<typeof HelioVector>): EclipticPosition {
  const ecliptic = Ecliptic(vectorEqj);
  const { x, y, z } = ecliptic.vec;
  return {
    longitude: ecliptic.elon,
    latitude: ecliptic.elat,
    distance: Math.hypot(x, y, z),
    vector: { x, y, z },
  };
}

/** Position relative to the sun. This is the frame the orrery's planetary view is drawn in. */
export function heliocentric(body: OrreryBody, jd: number): EclipticPosition {
  return eclipticFrom(HelioVector(BODIES[body], time(jd)));
}

/**
 * Position relative to the earth, corrected for light travel time and aberration — this is
 * where the body is *seen*, which is what the observer views must draw.
 */
export function geocentric(body: OrreryBody, jd: number): EclipticPosition {
  return eclipticFrom(GeoVector(BODIES[body], time(jd), true));
}

// The ephemeris reports right ascension in sidereal hours; AstroLab works in degrees.
const HOURS_TO_DEGREES = 15;

/**
 * Apparent equatorial coordinates of date, as printed in an almanac: measured from the centre
 * of the earth, so they do not depend on where the observer stands.
 */
export function geocentricEquatorial(body: OrreryBody, jd: number): EquatorialPosition {
  const astroTime = time(jd);
  const equatorOfDate = RotateVector(Rotation_EQJ_EQD(astroTime), GeoVector(BODIES[body], astroTime, true));
  const result = EquatorFromVector(equatorOfDate);
  return { rightAscension: result.ra * HOURS_TO_DEGREES, declination: result.dec, distance: result.dist };
}

/**
 * The same, measured from a point on the earth's surface. For the moon this differs from the
 * geocentric position by up to about a degree — diurnal parallax — because the moon is close
 * enough for the observer's own displacement from the earth's centre to matter.
 */
export function topocentricEquatorial(
  body: OrreryBody,
  jd: number,
  latitude: number,
  longitude: number,
): EquatorialPosition {
  const observer = new Observer(latitude, longitude, 0);
  const result = Equator(BODIES[body], time(jd), observer, true, true);
  return { rightAscension: result.ra * HOURS_TO_DEGREES, declination: result.dec, distance: result.dist };
}

/** Where the body sits in the observer's sky. Atmospheric refraction is NOT applied. */
export function horizontal(
  body: OrreryBody,
  jd: number,
  latitude: number,
  longitude: number,
): HorizontalPosition {
  const observer = new Observer(latitude, longitude, 0);
  const astroTime = time(jd);
  const eq = Equator(BODIES[body], astroTime, observer, true, true);
  const result = Horizon(astroTime, observer, eq.ra, eq.dec);
  return { azimuth: result.azimuth, altitude: result.altitude };
}

/** Sun-earth-body angle, degrees. Zero at conjunction, 180 at opposition. */
export function elongation(body: OrreryBody, jd: number) {
  return AngleFromSun(BODIES[body], time(jd));
}

/** Elongation plus whether the body is currently a morning or an evening object. */
export function elongationDetail(body: OrreryBody, jd: number) {
  const event = Elongation(BODIES[body], time(jd));
  return {
    elongation: event.elongation,
    visibility: event.visibility as "morning" | "evening",
    eclipticSeparation: event.ecliptic_separation,
  };
}

/**
 * Days since the new moon at or before `jd`. A forward search from a month back lands on the
 * *previous* new moon, so step forward while the next one still falls at or before the instant
 * in question — otherwise the age reads 29.5 days at the very moment it should read zero.
 */
function daysSinceNewMoon(astroTime: AstroTime, jd: number) {
  let found = SearchMoonPhase(0, astroTime.AddDays(-40), 41);
  if (!found) return Number.NaN;
  for (;;) {
    const next = SearchMoonPhase(0, found.AddDays(1), 40);
    if (!next || julianDay(next) > jd + 1e-9) break;
    found = next;
  }
  return jd - julianDay(found);
}

export function moonPhase(jd: number): MoonPhaseInfo {
  const astroTime = time(jd);
  const illumination = Illumination(Body.Moon, astroTime);
  return {
    phase: MoonPhase(astroTime),
    phaseAngle: illumination.phase_angle,
    illuminated: illumination.phase_fraction,
    age: daysSinceNewMoon(astroTime, jd),
    elongation: AngleFromSun(Body.Moon, astroTime),
  };
}

export function nextMoonQuarter(jd: number): MoonQuarterEvent {
  const quarter = SearchMoonQuarter(time(jd));
  return { julianDay: julianDay(quarter.time), quarter: QUARTER_NAMES[quarter.quarter] };
}

/**
 * The next crossing of the moon's orbit through the ecliptic plane. Eclipses are only possible
 * when a new or full moon falls close to one of these, which is what makes eclipse seasons.
 */
export function nextMoonNode(jd: number): NodeEvent {
  const node = SearchMoonNode(time(jd));
  return { julianDay: julianDay(node.time), kind: node.kind === 1 ? "ascending" : "descending" };
}

export function nextLunarEclipse(jd: number): EclipseEvent {
  const eclipse = SearchLunarEclipse(time(jd));
  return { julianDay: julianDay(eclipse.peak), kind: eclipse.kind as EclipseKindName };
}

export function nextSolarEclipse(jd: number): SolarEclipseEvent {
  const eclipse = SearchGlobalSolarEclipse(time(jd));
  return {
    julianDay: julianDay(eclipse.peak),
    kind: eclipse.kind as EclipseKindName,
    latitude: eclipse.latitude,
    longitude: eclipse.longitude,
  };
}

/** Greatest angular distance from the sun — when Mercury and Venus are easiest to see. */
export function nextMaxElongation(body: "mercury" | "venus", jd: number) {
  const event = SearchMaxElongation(BODIES[body], time(jd));
  return {
    julianDay: julianDay(event.time),
    elongation: event.elongation,
    visibility: event.visibility as "morning" | "evening",
  };
}

/** The four instants that anchor the seasons, as Julian Days. */
export function seasonJulianDays(year: number) {
  const seasons = Seasons(year);
  return {
    marchEquinox: julianDay(seasons.mar_equinox),
    juneSolstice: julianDay(seasons.jun_solstice),
    septemberEquinox: julianDay(seasons.sep_equinox),
    decemberSolstice: julianDay(seasons.dec_solstice),
  };
}
