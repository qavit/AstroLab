import * as THREE from "three";
import type { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { capsuleBetween, makeLine, makeWideLine } from "@/lib/render/primitives";
import { degrees, sunHorizontal, TAU } from "@/lib/science/solar";

/** A vertical semicircle from the horizon to the zenith at one azimuth. */
export function horizonArc(radius: number, azimuth: number, count = 90) {
  return Array.from({ length: count + 1 }, (_, index) => {
    const altitude = degrees((90 * index) / count);
    return new THREE.Vector3(
      radius * Math.cos(altitude) * Math.sin(degrees(azimuth)),
      radius * Math.cos(altitude) * Math.cos(degrees(azimuth)),
      radius * Math.sin(altitude),
    );
  });
}

/** Its mirror below the horizon, for the part of the sky the observer cannot see. */
export function belowHorizonArc(radius: number, azimuth: number, count = 90) {
  return Array.from({ length: count + 1 }, (_, index) => {
    const altitude = degrees((-90 * index) / count);
    return new THREE.Vector3(
      radius * Math.cos(altitude) * Math.sin(degrees(azimuth)),
      radius * Math.cos(altitude) * Math.cos(degrees(azimuth)),
      radius * Math.sin(altitude),
    );
  });
}

/** A simplified standing figure, giving the observer position a readable sense of scale and up. */
export function chibiPerson(height: number, color = 0xffb09d) {
  const person = new THREE.Group();
  const material = new THREE.MeshPhongMaterial({ color, shininess: 22 });
  const point = (x: number, y: number, z: number) => new THREE.Vector3(x * height, y * height, z * height);
  const head = new THREE.Mesh(new THREE.SphereGeometry(height * 0.19, 18, 12), material);
  head.position.copy(point(0, 0, 0.79));
  const torso = capsuleBetween(point(0, 0, 0.34), point(0, 0, 0.61), height * 0.14, material);
  const leftArm = capsuleBetween(point(-0.1, 0, 0.57), point(-0.3, 0, 0.31), height * 0.052, material);
  const rightArm = capsuleBetween(point(0.1, 0, 0.57), point(0.3, 0, 0.31), height * 0.052, material);
  const leftLeg = capsuleBetween(point(-0.075, 0, 0.31), point(-0.105, 0, 0.075), height * 0.066, material);
  const rightLeg = capsuleBetween(point(0.075, 0, 0.31), point(0.105, 0, 0.075), height * 0.066, material);
  person.add(head, torso, leftArm, rightArm, leftLeg, rightLeg);
  return person;
}

/**
 * The sun's daily path for one declination, split where it crosses the horizon so the visible
 * arc and the hidden arc can be drawn differently — solid above, faint and dashed below.
 */
export function pathSegments(
  group: THREE.Group,
  latitude: number,
  declination: number,
  color: number,
  faded = false,
  belowHorizon = true,
  wide = false,
  wideMaterials: LineMaterial[] = [],
) {
  let points: THREE.Vector3[] = [];
  let above: boolean | null = null;
  const flush = () => {
    if (points.length > 1 && above !== null && (above || belowHorizon)) {
      const opacity = above ? (faded ? 0.76 : 1) : 0.22;
      group.add(wide ? makeWideLine(points, color, opacity, !above, wideMaterials) : makeLine(points, color, opacity, !above));
    }
    points = [];
  };
  for (let index = 0; index <= 480; index += 1) {
    const vector = sunHorizontal(latitude, declination, -Math.PI + (TAU * index) / 480);
    const nextAbove = vector.z >= 0;
    if (above === null) above = nextAbove;
    if (nextAbove !== above) {
      flush();
      above = nextAbove;
    }
    points.push(new THREE.Vector3(vector.x, vector.y, vector.z));
  }
  flush();
}

/** Which grid labels survive at a given angular spacing, so dense grids thin out when zoomed out. */
export function labelInterval(angle: number) {
  return angle % 90 === 0 ? 90 : angle % 30 === 0 ? 30 : 15;
}
