/**
 * Conversions between the three coordinate frames AstroLab teaches, written out explicitly
 * rather than delegated, so the chain a student is shown on screen is the chain the code runs.
 *
 * Every angle in this module is in DEGREES, in and out. (`solar.ts` predates this convention
 * and works in radians; the two are not interchangeable without conversion.)
 *
 * Frames:
 * - ecliptic:   longitude measured along the ecliptic from the vernal equinox, latitude toward
 *               the ecliptic pole.
 * - equatorial: right ascension along the celestial equator from the vernal equinox,
 *               declination toward the celestial pole.
 * - horizontal: azimuth measured from north through east, altitude above the horizon.
 */

/** Mean obliquity of the ecliptic at J2000, in degrees. */
export const MEAN_OBLIQUITY_J2000 = 23.4392911;

const DEG = Math.PI / 180;

export const toRadians = (degrees: number) => degrees * DEG;
export const toDegrees = (radians: number) => radians / DEG;

/** Wraps an angle into [0, 360). */
export function normalizeDegrees(angle: number) {
  return ((angle % 360) + 360) % 360;
}

/** Wraps an angle into (-180, 180], the form a difference of two longitudes should take. */
export function signedDegrees(angle: number) {
  const wrapped = normalizeDegrees(angle);
  return wrapped > 180 ? wrapped - 360 : wrapped;
}

/** Angular separation between two directions given as longitude/latitude pairs, in degrees. */
export function angularSeparation(
  longitudeA: number,
  latitudeA: number,
  longitudeB: number,
  latitudeB: number,
) {
  const [la, ba, lb, bb] = [longitudeA, latitudeA, longitudeB, latitudeB].map(toRadians);
  const cosine =
    Math.sin(ba) * Math.sin(bb) + Math.cos(ba) * Math.cos(bb) * Math.cos(la - lb);
  return toDegrees(Math.acos(Math.max(-1, Math.min(1, cosine))));
}

export type Spherical = { longitude: number; latitude: number };
export type Equatorial = { rightAscension: number; declination: number };
export type Horizontal = { azimuth: number; altitude: number };
export type Cartesian = { x: number; y: number; z: number };

/** Right-handed cartesian components of a direction, with z toward the frame's pole. */
export function sphericalToCartesian(longitude: number, latitude: number, radius = 1): Cartesian {
  const lon = toRadians(longitude);
  const lat = toRadians(latitude);
  return {
    x: radius * Math.cos(lat) * Math.cos(lon),
    y: radius * Math.cos(lat) * Math.sin(lon),
    z: radius * Math.sin(lat),
  };
}

export function cartesianToSpherical(vector: Cartesian): Spherical & { radius: number } {
  const radius = Math.hypot(vector.x, vector.y, vector.z);
  if (radius === 0) return { longitude: 0, latitude: 0, radius: 0 };
  return {
    longitude: normalizeDegrees(toDegrees(Math.atan2(vector.y, vector.x))),
    latitude: toDegrees(Math.asin(vector.z / radius)),
    radius,
  };
}

export function eclipticToEquatorial(
  longitude: number,
  latitude: number,
  obliquity = MEAN_OBLIQUITY_J2000,
): Equatorial {
  const lon = toRadians(longitude);
  const lat = toRadians(latitude);
  const eps = toRadians(obliquity);
  const declination = Math.asin(
    Math.sin(lat) * Math.cos(eps) + Math.cos(lat) * Math.sin(eps) * Math.sin(lon),
  );
  const rightAscension = Math.atan2(
    Math.sin(lon) * Math.cos(eps) - Math.tan(lat) * Math.sin(eps),
    Math.cos(lon),
  );
  return {
    rightAscension: normalizeDegrees(toDegrees(rightAscension)),
    declination: toDegrees(declination),
  };
}

export function equatorialToEcliptic(
  rightAscension: number,
  declination: number,
  obliquity = MEAN_OBLIQUITY_J2000,
): Spherical {
  const ra = toRadians(rightAscension);
  const dec = toRadians(declination);
  const eps = toRadians(obliquity);
  const latitude = Math.asin(
    Math.sin(dec) * Math.cos(eps) - Math.cos(dec) * Math.sin(eps) * Math.sin(ra),
  );
  const longitude = Math.atan2(
    Math.sin(ra) * Math.cos(eps) + Math.tan(dec) * Math.sin(eps),
    Math.cos(ra),
  );
  return { longitude: normalizeDegrees(toDegrees(longitude)), latitude: toDegrees(latitude) };
}

/**
 * `hourAngle` is the local hour angle in degrees, zero on the meridian and increasing westward,
 * i.e. local sidereal time minus right ascension.
 */
export function equatorialToHorizontal(
  hourAngle: number,
  declination: number,
  latitude: number,
): Horizontal {
  const ha = toRadians(hourAngle);
  const dec = toRadians(declination);
  const phi = toRadians(latitude);
  const altitude = Math.asin(
    Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(ha),
  );
  const azimuth = Math.atan2(
    Math.sin(ha),
    Math.cos(ha) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi),
  );
  // atan2 above measures from south; AstroLab measures azimuth from north through east.
  return {
    azimuth: normalizeDegrees(toDegrees(azimuth) + 180),
    altitude: toDegrees(altitude),
  };
}

export function horizontalToEquatorial(
  azimuth: number,
  altitude: number,
  latitude: number,
): { hourAngle: number; declination: number } {
  const az = toRadians(normalizeDegrees(azimuth) - 180);
  const alt = toRadians(altitude);
  const phi = toRadians(latitude);
  const declination = Math.asin(
    Math.sin(phi) * Math.sin(alt) - Math.cos(phi) * Math.cos(alt) * Math.cos(az),
  );
  const hourAngle = Math.atan2(
    Math.sin(az),
    Math.cos(az) * Math.sin(phi) + Math.tan(alt) * Math.cos(phi),
  );
  return {
    hourAngle: normalizeDegrees(toDegrees(hourAngle)),
    declination: toDegrees(declination),
  };
}

/**
 * Direction from the earth to a body, given both bodies' heliocentric positions. This is the
 * step that turns the orrery's god's-eye view into what an observer on earth actually sees.
 */
export function heliocentricToGeocentric(body: Cartesian, earth: Cartesian): Cartesian {
  return { x: body.x - earth.x, y: body.y - earth.y, z: body.z - earth.z };
}
