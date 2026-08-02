import * as THREE from "three";
import { degrees, solarDeclination, TAU } from "@/lib/science/solar";
import { hourAngleForTime, type SolarLabState } from "@/models/solar";

/**
 * The geometry both views need for one instant, computed once so the geocentric sphere and the
 * observer's sky can never drift out of step.
 */
export type SolarFrame = {
  declination: number;
  /** Radians, zero at local noon. */
  hourAngle: number;
  /** Observer latitude in radians. */
  phi: number;
  /** The sun on the celestial sphere, radius 3, in the equatorial frame. */
  eclipticSun: THREE.Vector3;
  sunRightAscension: number;
  /** Longitude of the observer's meridian, which is what the earth's rotation is drawn from. */
  observerLongitude: number;
};

export function solarFrame(state: SolarLabState): SolarFrame {
  const declination = solarDeclination(state.day);
  const hourAngle = hourAngleForTime(state.time);
  const phi = degrees(state.latitude);
  const lambda = (TAU * (state.day - 80)) / 365;
  const eclipticSun = new THREE.Vector3()
    .set(3 * Math.cos(lambda), 3 * Math.sin(lambda), 0)
    .applyAxisAngle(new THREE.Vector3(1, 0, 0), degrees(23.44));
  const sunRightAscension = Math.atan2(eclipticSun.y, eclipticSun.x);
  return {
    declination,
    hourAngle,
    phi,
    eclipticSun,
    sunRightAscension,
    observerLongitude: sunRightAscension + hourAngle,
  };
}
