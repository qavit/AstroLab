import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";

/** Any object carrying cartesian components, so callers can pass plain science-layer vectors. */
export type Point3 = { x: number; y: number; z: number };

const TAU = Math.PI * 2;
const LABEL_FONT = "600 48px 'PingFang TC','Noto Sans TC','Microsoft JhengHei',sans-serif";

export function makeLine(points: THREE.Vector3[], color: number, opacity = 1, dashed = false) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = dashed
    ? new THREE.LineDashedMaterial({ color, transparent: true, opacity, dashSize: 0.055, gapSize: 0.035 })
    : new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  const line = new THREE.Line(geometry, material);
  if (dashed) line.computeLineDistances();
  return line;
}

/**
 * A screen-space-thick line. Its material needs the viewport resolution to stay the intended
 * width, so callers collect the materials and update them whenever the viewport resizes.
 */
export function makeWideLine(
  points: THREE.Vector3[],
  color: number,
  opacity: number,
  dashed: boolean,
  materials: LineMaterial[],
) {
  const geometry = new LineGeometry();
  geometry.setPositions(points.flatMap((point) => [point.x, point.y, point.z]));
  const material = new LineMaterial({
    color,
    transparent: true,
    opacity,
    linewidth: 1.5,
    dashed,
    dashSize: 0.055,
    gapSize: 0.035,
  });
  const line = new Line2(geometry, material);
  if (dashed) line.computeLineDistances();
  materials.push(material);
  return line;
}

/** A circle parallel to the xy plane, raised to height z. */
export function circle(radius = 1, z = 0, count = 180) {
  return Array.from({ length: count + 1 }, (_, index) => {
    const angle = (TAU * index) / count;
    return new THREE.Vector3(radius * Math.cos(angle), radius * Math.sin(angle), z);
  });
}

export function textSprite(text: string, color = "#ffffff", scale = 0.16, depthTest = false) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext("2d")!;
  context.font = LABEL_FONT;
  context.fillStyle = color;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, 256, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest, depthWrite: false }),
  );
  sprite.scale.set(scale * 4, scale, 1);
  return sprite;
}

export function capsuleBetween(
  start: THREE.Vector3,
  end: THREE.Vector3,
  radius: number,
  material: THREE.Material,
) {
  const length = start.distanceTo(end);
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(radius, Math.max(0.001, length - radius * 2), 6, 10),
    material,
  );
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize());
  return mesh;
}

/** A shaft-and-cone arrow starting at `from` and pointing along `direction`. */
export function arrowGroup(
  from: Point3,
  direction: Point3,
  length: number,
  color: number,
  opacity = 1,
  headSize = 0.09,
  shaftRadius = 0.016,
) {
  const group = new THREE.Group();
  const dir = new THREE.Vector3(direction.x, direction.y, direction.z).normalize();
  const origin = new THREE.Vector3(from.x, from.y, from.z);
  const to = origin.clone().addScaledVector(dir, length);
  const shaftEnd = origin.clone().addScaledVector(dir, length - headSize * 1.7);
  const shaftLength = origin.distanceTo(shaftEnd);
  if (shaftLength > 0.001) {
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(shaftRadius, shaftRadius, shaftLength, 10),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity }),
    );
    shaft.position.copy(origin).add(shaftEnd).multiplyScalar(0.5);
    shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    group.add(shaft);
  }
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(headSize * 0.55, headSize * 1.7, 12),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity }),
  );
  cone.position.copy(shaftEnd).add(to).multiplyScalar(0.5);
  cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  group.add(cone);
  return group;
}

/** Releases every geometry and material below `object`, including nested groups. */
export function disposeObject(object: THREE.Object3D) {
  object.traverse((node) => {
    const renderable = node as THREE.Mesh;
    renderable.geometry?.dispose?.();
    const material = renderable.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
    else material?.dispose();
  });
}

export function clearGroup(group: THREE.Group) {
  for (const item of [...group.children]) {
    group.remove(item);
    disposeObject(item);
  }
}
