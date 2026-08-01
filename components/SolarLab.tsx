"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  FolderOpen,
  Info,
  Layers3,
  MousePointer2,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  X,
} from "lucide-react";
import {
  compassLabel,
  dateFromDay,
  degrees,
  formatLatitude,
  formatTime,
  horizontalAngles,
  radians,
  shadowForUnitGnomon,
  solarDeclination,
  sunHorizontal,
  TAU,
} from "@/lib/science/solar";

type LabState = { latitude: number; day: number; time: number };
type ObserverMode = "person" | "dot" | "gnomon";
type ExportTarget = "global" | "local" | "shadow";
type ExportMode = "color" | "grayscale" | "line";
type AppearanceState = {
  globalObserver: ObserverMode;
  localObserver: ObserverMode;
  directManipulation: boolean;
  earthOpaque: boolean;
  compassPoints: 4 | 8 | 16;
};
type LayerState = {
  celestialSphere: boolean;
  rightAscensionLines: boolean;
  declinationLines: boolean;
  rightAscensionLabels: boolean;
  declinationLabels: boolean;
  celestialEquator: boolean;
  ecliptic: boolean;
  eclipticLongitudeLines: boolean;
  eclipticLatitudeLines: boolean;
  eclipticLongitudeLabels: boolean;
  eclipticLatitudeLabels: boolean;
  seasonalMarkers: boolean;
  solarTermLabels: boolean;
  apsides: boolean;
  celestialAxis: boolean;
  observer: boolean;
  tangentPlane: boolean;
  geographicGrid: boolean;
  observerLatitude: boolean;
  observerMeridian: boolean;
  subsolarPoint: boolean;
  compassLabels: boolean;
  horizontalAltitudeLines: boolean;
  horizontalAzimuthLines: boolean;
  horizontalAltitudeLabels: boolean;
  horizontalAzimuthLabels: boolean;
  meridianCircle: boolean;
  primeVertical: boolean;
  seasonalPaths: boolean;
  currentPath: boolean;
  belowHorizon: boolean;
  shadow: boolean;
};
type SceneApi = {
  update: (state: LabState, layers: LayerState, appearance: AppearanceState) => void;
  reset: () => void;
  capture: (target: ExportTarget, mode: ExportMode, lineWidth: number) => string;
  dispose: () => void;
};

const seasons = [
  { label: "夏至", declination: degrees(23.44), color: 0xf2c86b },
  { label: "春／秋分", declination: 0, color: 0x9ddbe4 },
  { label: "冬至", declination: degrees(-23.44), color: 0x6e9ed8 },
];

const latitudePresets = [
  ["北極", 90], ["北極圈", 66.5], ["北回歸線", 23.5], ["赤道", 0],
  ["南回歸線", -23.5], ["南極圈", -66.5], ["南極", -90],
] as const;

const datePresets = [
  ["春分", 80], ["夏至", 172], ["秋分", 266], ["冬至", 355],
] as const;

const solarTerms = [
  "春分", "清明", "穀雨", "立夏", "小滿", "芒種", "夏至", "小暑", "大暑", "立秋", "處暑", "白露",
  "秋分", "寒露", "霜降", "立冬", "小雪", "大雪", "冬至", "小寒", "大寒", "立春", "雨水", "驚蟄",
] as const;

type DirectoryHandle = {
  name: string;
  getFileHandle: (name: string, options: { create: boolean }) => Promise<{
    createWritable: () => Promise<{ write: (blob: Blob) => Promise<void>; close: () => Promise<void> }>;
  }>;
};

function makeLine(points: THREE.Vector3[], color: number, opacity = 1, dashed = false) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = dashed
    ? new THREE.LineDashedMaterial({ color, transparent: true, opacity, dashSize: 0.055, gapSize: 0.035 })
    : new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  const line = new THREE.Line(geometry, material);
  if (dashed) line.computeLineDistances();
  return line;
}

function circle(radius = 1, z = 0, count = 180) {
  return Array.from({ length: count + 1 }, (_, index) => {
    const angle = (TAU * index) / count;
    return new THREE.Vector3(radius * Math.cos(angle), radius * Math.sin(angle), z);
  });
}

function horizonArc(radius: number, azimuth: number, count = 90) {
  return Array.from({ length: count + 1 }, (_, index) => {
    const altitude = degrees((90 * index) / count);
    return new THREE.Vector3(
      radius * Math.cos(altitude) * Math.sin(degrees(azimuth)),
      radius * Math.cos(altitude) * Math.cos(degrees(azimuth)),
      radius * Math.sin(altitude),
    );
  });
}

function textSprite(text: string, color = "#ffffff", scale = 0.16, depthTest = false) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext("2d")!;
  context.font = "600 48px 'PingFang TC','Noto Sans TC','Microsoft JhengHei',sans-serif";
  context.fillStyle = color;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, 256, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest, depthWrite: false }));
  sprite.scale.set(scale * 4, scale, 1);
  return sprite;
}

function capsuleBetween(start: THREE.Vector3, end: THREE.Vector3, radius: number, material: THREE.Material) {
  const length = start.distanceTo(end);
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(radius, Math.max(0.001, length - radius * 2), 6, 10),
    material,
  );
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize());
  return mesh;
}

function chibiPerson(height: number, color = 0xffb09d) {
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

const compassPoints = [
  [0, "北"], [22.5, "北北東"], [45, "東北"], [67.5, "東北東"],
  [90, "東"], [112.5, "東南東"], [135, "東南"], [157.5, "南南東"],
  [180, "南"], [202.5, "南南西"], [225, "西南"], [247.5, "西南西"],
  [270, "西"], [292.5, "西北西"], [315, "西北"], [337.5, "北北西"],
] as const;

function clearGroup(group: THREE.Group) {
  for (const item of [...group.children]) {
    group.remove(item);
    const renderable = item as THREE.Line;
    renderable.geometry?.dispose();
    if (Array.isArray(renderable.material)) renderable.material.forEach((material) => material.dispose());
    else renderable.material?.dispose();
  }
}

function pathSegments(
  group: THREE.Group,
  latitude: number,
  declination: number,
  color: number,
  faded = false,
  belowHorizon = true,
) {
  let points: THREE.Vector3[] = [];
  let above: boolean | null = null;
  const flush = () => {
    if (points.length > 1 && above !== null && (above || belowHorizon)) {
      group.add(makeLine(points, color, above ? (faded ? 0.64 : 1) : 0.22, !above));
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

function setupScenes(
  globalHost: HTMLDivElement,
  localHost: HTMLDivElement,
  onStateChange: (patch: Partial<LabState>) => void,
): SceneApi {
  const makeRenderer = (host: HTMLDivElement) => {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);
    return renderer;
  };

  const globalScene = new THREE.Scene();
  const globalCamera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
  globalCamera.position.set(4.6, 3.15, 4.6);
  globalCamera.up.set(0, 0, 1);
  const globalRenderer = makeRenderer(globalHost);
  const globalControls = new OrbitControls(globalCamera, globalRenderer.domElement);
  globalControls.enableDamping = true;
  globalScene.add(new THREE.AmbientLight(0x8aa6bf, 0.34));
  const light = new THREE.DirectionalLight(0xfff4d6, 3.4);
  light.position.set(5, 7, 4);
  globalScene.add(light);

  const earthRotationGroup = new THREE.Group();
  const earthMaterial = new THREE.MeshPhongMaterial({ color: 0x245a83, emissive: 0x020a12, shininess: 18 });
  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(1, 64, 32),
    earthMaterial,
  );
  earthRotationGroup.add(earth);
  globalScene.add(earthRotationGroup);

  const geographicGrid = new THREE.Group();
  for (let latitude = -60; latitude <= 60; latitude += 30) {
    const radius = 1.006 * Math.cos(degrees(latitude));
    const z = 1.006 * Math.sin(degrees(latitude));
    geographicGrid.add(makeLine(circle(radius, z), 0x78a8c9, latitude === 0 ? 0.75 : 0.48));
  }
  for (let longitude = 0; longitude < 360; longitude += 30) {
    const points = Array.from({ length: 181 }, (_, index) => {
      const latitude = degrees(-90 + index);
      return new THREE.Vector3(
        1.006 * Math.cos(latitude) * Math.cos(degrees(longitude)),
        1.006 * Math.cos(latitude) * Math.sin(degrees(longitude)),
        1.006 * Math.sin(latitude),
      );
    });
    geographicGrid.add(makeLine(points, 0x78a8c9, 0.42));
  }
  earthRotationGroup.add(geographicGrid);

  const observerLatitude = new THREE.Group();
  globalScene.add(observerLatitude);
  const observerMeridian = new THREE.Group();
  const observerMeridianPoints = Array.from({ length: 361 }, (_, index) => {
    const latitude = degrees(-90 + index / 2);
    return new THREE.Vector3(1.018 * Math.cos(latitude), 0, 1.018 * Math.sin(latitude));
  });
  observerMeridian.add(makeLine(observerMeridianPoints, 0xffa086, 0.96));
  earthRotationGroup.add(observerMeridian);
  const subsolarPoint = new THREE.Mesh(
    new THREE.CircleGeometry(0.0225, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd66f, side: THREE.DoubleSide }),
  );
  globalScene.add(subsolarPoint);
  const subsolarLabel = textSprite("日下點", "#ffe39a", 0.11, true);
  globalScene.add(subsolarLabel);

  // Equatorial coordinates: independent declination parallels and right-ascension hour circles.
  const declinationLines = new THREE.Group();
  for (const declination of [-60, -30, 30, 60]) {
    const radius = 3 * Math.cos(degrees(declination));
    const z = 3 * Math.sin(degrees(declination));
    declinationLines.add(makeLine(circle(radius, z), 0xc98080, 0.3));
  }
  const rightAscensionLines = new THREE.Group();
  for (let rightAscension = 0; rightAscension < 360; rightAscension += 15) {
    const points = Array.from({ length: 241 }, (_, index) => {
      const declination = degrees(-90 + (180 * index) / 240);
      return new THREE.Vector3(
        3 * Math.cos(declination) * Math.cos(degrees(rightAscension)),
        3 * Math.cos(declination) * Math.sin(degrees(rightAscension)),
        3 * Math.sin(declination),
      );
    });
    rightAscensionLines.add(makeLine(points, 0xb96f72, 0.22));
  }
  globalScene.add(rightAscensionLines, declinationLines);

  const axis = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.018, 6.6, 12),
    new THREE.MeshBasicMaterial({ color: 0xc4ddef }),
  );
  axis.rotation.x = Math.PI / 2;
  globalScene.add(axis);
  const celestial = new THREE.Mesh(
    new THREE.SphereGeometry(3, 30, 16),
    new THREE.MeshBasicMaterial({ color: 0x4c7794, transparent: true, opacity: 0.035, wireframe: false, side: THREE.DoubleSide, depthWrite: false }),
  );
  globalScene.add(celestial);
  const celestialEquator = makeLine(circle(3), 0xe08282, 0.94);
  globalScene.add(celestialEquator);
  const ecliptic = makeLine(circle(3), 0xf2c86b, 0.96);
  ecliptic.rotation.x = degrees(23.44);
  globalScene.add(ecliptic);

  const eclipticPoint = (longitude: number, latitude = 0, radius = 3) => {
    const lon = degrees(longitude);
    const lat = degrees(latitude);
    return new THREE.Vector3(
      radius * Math.cos(lat) * Math.cos(lon),
      radius * Math.cos(lat) * Math.sin(lon),
      radius * Math.sin(lat),
    ).applyAxisAngle(new THREE.Vector3(1, 0, 0), degrees(23.44));
  };

  const eclipticLatitudeLines = new THREE.Group();
  for (const latitude of [-60, -30, 30, 60]) {
    const radius = 3 * Math.cos(degrees(latitude));
    const z = 3 * Math.sin(degrees(latitude));
    const latitudeCircle = makeLine(circle(radius, z), 0xcaa94e, 0.22);
    latitudeCircle.rotation.x = degrees(23.44);
    eclipticLatitudeLines.add(latitudeCircle);
  }
  const eclipticLongitudeLines = new THREE.Group();
  for (let longitude = 0; longitude < 360; longitude += 15) {
    const points = Array.from({ length: 181 }, (_, index) => {
      const latitude = -90 + index;
      return eclipticPoint(longitude, latitude);
    });
    eclipticLongitudeLines.add(makeLine(points, 0xcaa94e, 0.18));
  }
  globalScene.add(eclipticLongitudeLines, eclipticLatitudeLines);

  const rightAscensionLabels = new THREE.Group();
  const declinationLabels = new THREE.Group();
  const eclipticLongitudeLabels = new THREE.Group();
  const eclipticLatitudeLabels = new THREE.Group();
  const solarTermLabels = new THREE.Group();
  const seasonalMarkers = new THREE.Group();
  const labelInterval = (angle: number) => angle % 90 === 0 ? 90 : angle % 30 === 0 ? 30 : 15;

  for (let longitude = 0; longitude < 360; longitude += 15) {
    const ra = textSprite(`${longitude}°`, "#efb3b3", 0.1, true);
    ra.position.set(3.13 * Math.cos(degrees(longitude)), 3.13 * Math.sin(degrees(longitude)), 0);
    ra.userData.interval = labelInterval(longitude);
    rightAscensionLabels.add(ra);

    const eclipticLongitude = textSprite(`${longitude}°`, "#f2d889", 0.1, true);
    eclipticLongitude.position.copy(eclipticPoint(longitude, 0, 3.15));
    eclipticLongitude.userData.interval = labelInterval(longitude);
    eclipticLongitudeLabels.add(eclipticLongitude);
  }
  for (let latitude = -60; latitude <= 60; latitude += 15) {
    if (latitude === 0) continue;
    const dec = textSprite(`${latitude > 0 ? "+" : ""}${latitude}°`, "#e9a8a8", 0.09, true);
    dec.position.set(3.12 * Math.cos(degrees(latitude)), 0, 3.12 * Math.sin(degrees(latitude)));
    dec.userData.interval = Math.abs(latitude) % 30 === 0 ? 30 : 15;
    declinationLabels.add(dec);

    const eclipticLatitude = textSprite(`${latitude > 0 ? "+" : ""}${latitude}°`, "#e9cb70", 0.09, true);
    eclipticLatitude.position.copy(eclipticPoint(8, latitude, 3.13));
    eclipticLatitude.userData.interval = Math.abs(latitude) % 30 === 0 ? 30 : 15;
    eclipticLatitudeLabels.add(eclipticLatitude);
  }

  solarTerms.forEach((name, index) => {
    const term = textSprite(name, "#f3d67d", 0.105, true);
    term.position.copy(eclipticPoint(index * 15, 0, 3.28));
    term.userData.interval = labelInterval(index * 15);
    solarTermLabels.add(term);
  });
  const cardinalPoints = [
    [0, "♈︎", "春分點"], [90, "♋︎", "夏至點"], [180, "♎︎", "秋分點"], [270, "♑︎", "冬至點"],
  ] as const;
  cardinalPoints.forEach(([longitude, symbol, name]) => {
    const marker = new THREE.Mesh(
      new THREE.CircleGeometry(0.0064, 12),
      new THREE.MeshBasicMaterial({ color: 0xffd66f, side: THREE.DoubleSide }),
    );
    marker.position.copy(eclipticPoint(longitude, 0, 3.018));
    marker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), marker.position.clone().normalize());
    const label = textSprite(`${symbol} ${name}`, "#ffe29a", 0.13, true);
    label.position.copy(eclipticPoint(longitude, 0, 3.3));
    seasonalMarkers.add(marker, label);
  });
  const apsides = new THREE.Group();
  [[284, "近日點"], [104, "遠日點"]].forEach(([longitude, name]) => {
    const marker = new THREE.Mesh(
      new THREE.CircleGeometry(0.014, 14),
      new THREE.MeshBasicMaterial({ color: 0xf0bd52, side: THREE.DoubleSide }),
    );
    marker.position.copy(eclipticPoint(longitude as number, 0, 3.018));
    marker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), marker.position.clone().normalize());
    const label = textSprite(name as string, "#f5cf73", 0.105, true);
    label.position.copy(eclipticPoint(longitude as number, 0, 3.2));
    apsides.add(marker, label);
  });
  globalScene.add(
    rightAscensionLabels,
    declinationLabels,
    eclipticLongitudeLabels,
    eclipticLatitudeLabels,
    solarTermLabels,
    seasonalMarkers,
    apsides,
  );
  const globalLabels = new THREE.Group();
  const eclipticLabel = textSprite("黃道", "#f5d685", 0.16, true);
  eclipticLabel.position.set(-2.25, 0.65, 0.8);
  const northLabel = textSprite("北天極／地軸", "#cbe0ef", 0.14, true);
  northLabel.position.set(0, 0, 3.42);
  globalLabels.add(eclipticLabel, northLabel);
  globalScene.add(globalLabels);

  const sunMaterial = new THREE.MeshBasicMaterial({ color: 0xffd66f });
  const globalSun = new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 16), sunMaterial);
  globalScene.add(globalSun);
  const globalSunDragProxy = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 12, 8),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  );
  globalScene.add(globalSunDragProxy);
  const observer = new THREE.Group();
  const observerVisuals = new THREE.Group();
  const observerDot = new THREE.Mesh(
    new THREE.CircleGeometry(0.0275, 24),
    new THREE.MeshBasicMaterial({ color: 0xff8f75, side: THREE.DoubleSide }),
  );
  observerDot.position.z = 0.006;
  const globalPerson = chibiPerson(0.17);
  const globalGnomon = new THREE.Group();
  const globalRod = makeLine([new THREE.Vector3(), new THREE.Vector3(0, 0, 0.16)], 0xf4f8fa, 1);
  const globalShadow = makeLine([new THREE.Vector3(), new THREE.Vector3()], 0x02070b, 1);
  globalGnomon.add(globalRod, globalShadow);
  const observerDragProxy = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 12, 8),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  );
  const tangent = new THREE.Mesh(
    new THREE.CircleGeometry(0.42, 48),
    new THREE.MeshBasicMaterial({ color: 0x8ec9db, transparent: true, opacity: 0.24, side: THREE.DoubleSide }),
  );
  const observerDome = new THREE.Mesh(
    new THREE.SphereGeometry(0.42, 24, 12, 0, TAU, 0, Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x4c87a3, transparent: true, opacity: 0.09, wireframe: false, side: THREE.DoubleSide, depthWrite: false }),
  );
  observerDome.rotation.x = Math.PI / 2;
  const observerHorizonLine = makeLine(circle(0.42), 0x8dd0a7, 0.82);
  const observerAltitudeLines = new THREE.Group();
  for (const altitude of [30, 60]) {
    observerAltitudeLines.add(
      makeLine(
        circle(0.42 * Math.cos(degrees(altitude)), 0.42 * Math.sin(degrees(altitude)), 120),
        0x71bd91,
        0.42,
      ),
    );
  }
  const observerAzimuthLines = new THREE.Group();
  for (let azimuth = 0; azimuth < 360; azimuth += 30) {
    if (azimuth % 90 === 0) continue;
    observerAzimuthLines.add(makeLine(horizonArc(0.42, azimuth, 60), 0x62ad83, 0.34));
  }
  const observerMeridianCircle = new THREE.Group();
  observerMeridianCircle.add(
    makeLine(horizonArc(0.42, 0, 60), 0xa3dfb8, 0.78),
    makeLine(horizonArc(0.42, 180, 60), 0xa3dfb8, 0.78),
  );
  const observerPrimeVertical = new THREE.Group();
  observerPrimeVertical.add(
    makeLine(horizonArc(0.42, 90, 60), 0x8ed3a8, 0.72),
    makeLine(horizonArc(0.42, 270, 60), 0x8ed3a8, 0.72),
  );
  const observerCompassLabels = new THREE.Group();
  const observerAltitudeLabels = new THREE.Group();
  const observerAzimuthLabels = new THREE.Group();
  compassPoints.forEach(([azimuth, name]) => {
    const label = textSprite(name, "#b9ebcc", 0.052, true);
    label.position.set(0.48 * Math.sin(degrees(azimuth)), 0.48 * Math.cos(degrees(azimuth)), 0.012);
    label.userData.points = azimuth % 90 === 0 ? 4 : azimuth % 45 === 0 ? 8 : 16;
    observerCompassLabels.add(label);
  });
  for (let altitude = 15; altitude <= 75; altitude += 15) {
    const label = textSprite(`${altitude}°`, "#9dddb6", 0.045, true);
    label.position.set(
      0.44 * Math.cos(degrees(altitude)) * Math.sin(degrees(118)),
      0.44 * Math.cos(degrees(altitude)) * Math.cos(degrees(118)),
      0.44 * Math.sin(degrees(altitude)),
    );
    label.userData.interval = altitude % 30 === 0 ? 30 : 15;
    observerAltitudeLabels.add(label);
  }
  for (let azimuth = 0; azimuth < 360; azimuth += 15) {
    const label = textSprite(`${azimuth}°`, "#8fd0a8", 0.04, true);
    label.position.set(0.44 * Math.sin(degrees(azimuth)), 0.44 * Math.cos(degrees(azimuth)), 0.055);
    label.userData.interval = labelInterval(azimuth);
    observerAzimuthLabels.add(label);
  }
  observerVisuals.add(observerDot, globalPerson, globalGnomon, observerDragProxy);
  observer.add(
    observerVisuals,
    tangent,
    observerDome,
    observerHorizonLine,
    observerAltitudeLines,
    observerAzimuthLines,
    observerMeridianCircle,
    observerPrimeVertical,
    observerCompassLabels,
    observerAltitudeLabels,
    observerAzimuthLabels,
  );
  globalScene.add(observer);

  const localScene = new THREE.Scene();
  const localCamera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
  localCamera.position.set(2.65, 2.15, 2.4);
  localCamera.up.set(0, 0, 1);
  const localRenderer = makeRenderer(localHost);
  const localControls = new OrbitControls(localCamera, localRenderer.domElement);
  localControls.enableDamping = true;
  localControls.target.set(0, 0, 0.42);
  localScene.add(new THREE.AmbientLight(0xbcd7e8, 1.8));
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(1.28, 80),
    new THREE.MeshPhongMaterial({ color: 0x173b58, transparent: true, opacity: 0.94, side: THREE.DoubleSide }),
  );
  localScene.add(floor);
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(1, 36, 18, 0, TAU, 0, Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x4e87a7, transparent: true, opacity: 0.045, wireframe: false, side: THREE.DoubleSide, depthWrite: false }),
  );
  dome.rotation.x = Math.PI / 2;
  localScene.add(dome);

  // Horizontal coordinates: independent altitude circles, azimuth semicircles, and labels.
  const localHorizonLine = makeLine(circle(1), 0x9bddb3, 0.84);
  const horizontalAltitudeLines = new THREE.Group();
  for (const altitude of [30, 60]) {
    horizontalAltitudeLines.add(makeLine(circle(Math.cos(degrees(altitude)), Math.sin(degrees(altitude))), 0x71bd91, 0.4));
  }
  const horizontalAzimuthLines = new THREE.Group();
  for (let azimuth = 0; azimuth < 360; azimuth += 30) {
    if (azimuth % 90 === 0) continue;
    horizontalAzimuthLines.add(makeLine(horizonArc(1, azimuth), 0x62ad83, 0.34));
  }
  const localMeridianCircle = new THREE.Group();
  localMeridianCircle.add(
    makeLine(horizonArc(1, 0), 0xa3dfb8, 0.82),
    makeLine(horizonArc(1, 180), 0xa3dfb8, 0.82),
  );
  const localPrimeVertical = new THREE.Group();
  localPrimeVertical.add(
    makeLine(horizonArc(1, 90), 0x8ed3a8, 0.76),
    makeLine(horizonArc(1, 270), 0x8ed3a8, 0.76),
  );
  const zenithAxis = makeLine(
    [new THREE.Vector3(0, 0, -0.16), new THREE.Vector3(0, 0, 1.18)],
    0xb5e5c6,
    0.78,
  );
  localScene.add(localHorizonLine, horizontalAltitudeLines, horizontalAzimuthLines, localMeridianCircle, localPrimeVertical, zenithAxis);

  const localCompassLabels = new THREE.Group();
  const localAltitudeLabels = new THREE.Group();
  const localAzimuthLabels = new THREE.Group();
  compassPoints.forEach(([azimuth, name]) => {
    const label = textSprite(name, "#d4f3df", 0.1);
    label.position.set(1.12 * Math.sin(degrees(azimuth)), 1.12 * Math.cos(degrees(azimuth)), 0.018);
    label.userData.points = azimuth % 90 === 0 ? 4 : azimuth % 45 === 0 ? 8 : 16;
    localCompassLabels.add(label);
  });
  const zenith = textSprite("天頂", "#ffffff", 0.12);
  zenith.position.set(0, 0, 1.12);
  for (let altitude = 15; altitude <= 75; altitude += 15) {
    const label = textSprite(`${altitude}°`, "#a9e2bd", 0.085);
    label.position.set(
      1.04 * Math.cos(degrees(altitude)) * Math.sin(degrees(118)),
      1.04 * Math.cos(degrees(altitude)) * Math.cos(degrees(118)),
      1.04 * Math.sin(degrees(altitude)),
    );
    label.userData.interval = altitude % 30 === 0 ? 30 : 15;
    localAltitudeLabels.add(label);
  }
  for (let azimuth = 0; azimuth < 360; azimuth += 15) {
    const label = textSprite(`${azimuth}°`, "#98d9af", 0.072);
    label.position.set(1.03 * Math.sin(degrees(azimuth)), 1.03 * Math.cos(degrees(azimuth)), 0.13);
    label.userData.interval = labelInterval(azimuth);
    localAzimuthLabels.add(label);
  }
  localScene.add(localCompassLabels, localAltitudeLabels, localAzimuthLabels, zenith);

  const localDot = new THREE.Mesh(
    new THREE.CircleGeometry(0.0275, 24),
    new THREE.MeshBasicMaterial({ color: 0xff8f75, side: THREE.DoubleSide }),
  );
  localDot.position.z = 0.008;
  const localPerson = chibiPerson(0.3);
  localScene.add(localDot, localPerson);

  const currentPath = new THREE.Group();
  const comparisonPaths = new THREE.Group();
  localScene.add(currentPath, comparisonPaths);
  const localSun = new THREE.Mesh(new THREE.SphereGeometry(0.058, 20, 14), sunMaterial.clone());
  localScene.add(localSun);
  const localSunDragProxy = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 12, 8),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  );
  localScene.add(localSunDragProxy);
  const rodHeight = 0.28;
  const shadowGroup = new THREE.Group();
  const gnomon = new THREE.Mesh(
    new THREE.CylinderGeometry(0.014, 0.014, rodHeight, 12),
    new THREE.MeshBasicMaterial({ color: 0xf1f6f7 }),
  );
  gnomon.position.z = rodHeight / 2;
  gnomon.rotation.x = Math.PI / 2;
  const shadow = makeLine([new THREE.Vector3(), new THREE.Vector3()], 0x02070b, 1);
  const shadowBar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.018, 1, 10),
    new THREE.MeshBasicMaterial({ color: 0x02070b }),
  );
  const ray = makeLine([new THREE.Vector3(0, 0, rodHeight), new THREE.Vector3()], 0xffd66f, 0.62, true);
  shadowGroup.add(gnomon, shadow, shadowBar, ray);
  localScene.add(shadowGroup);

  const resize = () => {
    const pairs: [HTMLDivElement, THREE.WebGLRenderer, THREE.PerspectiveCamera][] = [
      [globalHost, globalRenderer, globalCamera],
      [localHost, localRenderer, localCamera],
    ];
    pairs.forEach(([host, renderer, camera]) => {
      const width = host.clientWidth;
      const height = host.clientHeight;
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
    });
  };
  let resizeFrame = 0;
  const observerResize = new ResizeObserver(() => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(resize);
  });
  observerResize.observe(globalHost);
  observerResize.observe(localHost);
  resize();

  let activeLayers: LayerState | null = null;
  let activeAppearance: AppearanceState | null = null;
  let activeState: LabState = { latitude: 23.5, day: 172, time: 12 };
  let globalDrag: "observer" | "sun" | null = null;
  let localDrag: "sun" | "path" | null = null;
  let pathDragStart = { y: 0, day: 172 };
  const globalRaycaster = new THREE.Raycaster();
  const localRaycaster = new THREE.Raycaster();
  localRaycaster.params.Line!.threshold = 0.065;

  const pointerNdc = (event: PointerEvent, element: HTMLCanvasElement) => {
    const rect = element.getBoundingClientRect();
    return new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
  };
  const beginGlobalDrag = (event: PointerEvent) => {
    if (!activeAppearance?.directManipulation) return;
    globalRaycaster.setFromCamera(pointerNdc(event, globalRenderer.domElement), globalCamera);
    if (globalRaycaster.intersectObject(observerDragProxy, false).length) globalDrag = "observer";
    else if (globalRaycaster.intersectObject(globalSunDragProxy, false).length) globalDrag = "sun";
    if (globalDrag) globalRenderer.domElement.setPointerCapture(event.pointerId);
  };
  const moveGlobalDrag = (event: PointerEvent) => {
    if (!globalDrag) return;
    globalRaycaster.setFromCamera(pointerNdc(event, globalRenderer.domElement), globalCamera);
    if (globalDrag === "observer") {
      const hit = globalRaycaster.ray.intersectSphere(new THREE.Sphere(new THREE.Vector3(), 1), new THREE.Vector3());
      if (hit) onStateChange({ latitude: Math.max(-90, Math.min(90, radians(Math.asin(hit.z / hit.length())))) });
    } else {
      const tilt = degrees(23.44);
      const plane = new THREE.Plane(new THREE.Vector3(0, -Math.sin(tilt), Math.cos(tilt)), 0);
      const hit = globalRaycaster.ray.intersectPlane(plane, new THREE.Vector3());
      if (hit) {
        hit.applyAxisAngle(new THREE.Vector3(1, 0, 0), -tilt);
        const longitude = (Math.atan2(hit.y, hit.x) + TAU) % TAU;
        onStateChange({ day: ((longitude / TAU) * 365 + 80 - 1) % 365 + 1 });
      }
    }
  };
  const endGlobalDrag = () => { globalDrag = null; };

  const beginLocalDrag = (event: PointerEvent) => {
    if (!activeAppearance?.directManipulation) return;
    localRaycaster.setFromCamera(pointerNdc(event, localRenderer.domElement), localCamera);
    if (localRaycaster.intersectObject(localSunDragProxy, false).length) localDrag = "sun";
    else if (localRaycaster.intersectObject(currentPath, true).length) {
      localDrag = "path";
      pathDragStart = { y: event.clientY, day: activeState.day };
    }
    if (localDrag) localRenderer.domElement.setPointerCapture(event.pointerId);
  };
  const moveLocalDrag = (event: PointerEvent) => {
    if (!localDrag) return;
    if (localDrag === "path") {
      const rect = localRenderer.domElement.getBoundingClientRect();
      const day = ((pathDragStart.day - ((event.clientY - pathDragStart.y) / rect.height) * 365 - 1) % 365 + 365) % 365 + 1;
      onStateChange({ day });
      return;
    }
    localRaycaster.setFromCamera(pointerNdc(event, localRenderer.domElement), localCamera);
    const hit = localRaycaster.ray.intersectSphere(new THREE.Sphere(new THREE.Vector3(), 1), new THREE.Vector3());
    if (!hit) return;
    hit.normalize();
    const declination = solarDeclination(activeState.day);
    let bestHourAngle = -Math.PI;
    let bestDot = -Infinity;
    for (let index = 0; index <= 720; index += 1) {
      const hourAngle = -Math.PI + (TAU * index) / 720;
      const vector = sunHorizontal(activeState.latitude, declination, hourAngle);
      const dot = vector.x * hit.x + vector.y * hit.y + vector.z * hit.z;
      if (dot > bestDot) {
        bestDot = dot;
        bestHourAngle = hourAngle;
      }
    }
    onStateChange({ time: ((12 + radians(bestHourAngle) / 15) % 24 + 24) % 24 });
  };
  const endLocalDrag = () => { localDrag = null; };
  globalRenderer.domElement.addEventListener("pointerdown", beginGlobalDrag);
  globalRenderer.domElement.addEventListener("pointermove", moveGlobalDrag);
  globalRenderer.domElement.addEventListener("pointerup", endGlobalDrag);
  globalRenderer.domElement.addEventListener("pointercancel", endGlobalDrag);
  localRenderer.domElement.addEventListener("pointerdown", beginLocalDrag);
  localRenderer.domElement.addEventListener("pointermove", moveLocalDrag);
  localRenderer.domElement.addEventListener("pointerup", endLocalDrag);
  localRenderer.domElement.addEventListener("pointercancel", endLocalDrag);

  let animation = 0;
  const draw = () => {
    animation = requestAnimationFrame(draw);
    const globalDistance = globalCamera.position.distanceTo(globalControls.target);
    const globalMinimum = globalDistance > 7 ? 90 : globalDistance > 5 ? 30 : 15;
    const localDistance = localCamera.position.distanceTo(localControls.target);
    const localMinimum = localDistance > 4 ? 45 : localDistance > 2.8 ? 30 : 15;
    const adaptive = (group: THREE.Group, enabled: boolean, minimum: number) => {
      group.children.forEach((label) => { label.visible = enabled && label.userData.interval >= minimum; });
    };
    adaptive(rightAscensionLabels, Boolean(activeLayers?.rightAscensionLabels), globalMinimum);
    adaptive(declinationLabels, Boolean(activeLayers?.declinationLabels), globalMinimum);
    adaptive(eclipticLongitudeLabels, Boolean(activeLayers?.eclipticLongitudeLabels), globalMinimum);
    adaptive(eclipticLatitudeLabels, Boolean(activeLayers?.eclipticLatitudeLabels), globalMinimum);
    adaptive(observerAltitudeLabels, Boolean(activeLayers?.horizontalAltitudeLabels), globalMinimum);
    adaptive(observerAzimuthLabels, Boolean(activeLayers?.horizontalAzimuthLabels), globalMinimum);
    adaptive(localAltitudeLabels, Boolean(activeLayers?.horizontalAltitudeLabels), localMinimum);
    adaptive(localAzimuthLabels, Boolean(activeLayers?.horizontalAzimuthLabels), localMinimum);
    solarTermLabels.children.forEach((label) => {
      label.visible = Boolean(activeLayers?.solarTermLabels && label.userData.interval >= globalMinimum);
    });
    observerCompassLabels.children.forEach((label) => {
      label.visible = Boolean(activeLayers?.compassLabels && label.userData.points <= (activeAppearance?.compassPoints ?? 4));
    });
    localCompassLabels.children.forEach((label) => {
      label.visible = Boolean(activeLayers?.compassLabels && label.userData.points <= (activeAppearance?.compassPoints ?? 4));
    });
    globalControls.update();
    localControls.update();
    globalRenderer.render(globalScene, globalCamera);
    localRenderer.render(localScene, localCamera);
  };
  draw();

  let lastObserverLatitude = Number.NaN;
  let lastCurrentPathKey = "";
  let lastSeasonPathKey = "";

  return {
    update(state, layers, appearance) {
      activeLayers = layers;
      activeAppearance = appearance;
      activeState = state;
      celestial.visible = layers.celestialSphere;
      rightAscensionLines.visible = layers.rightAscensionLines;
      declinationLines.visible = layers.declinationLines;
      celestialEquator.visible = layers.celestialEquator;
      ecliptic.visible = layers.ecliptic;
      eclipticLongitudeLines.visible = layers.eclipticLongitudeLines;
      eclipticLatitudeLines.visible = layers.eclipticLatitudeLines;
      seasonalMarkers.visible = layers.seasonalMarkers;
      apsides.visible = layers.apsides;
      axis.visible = layers.celestialAxis;
      observerVisuals.visible = layers.observer;
      tangent.visible = layers.tangentPlane;
      geographicGrid.visible = layers.geographicGrid;
      observerLatitude.visible = layers.observerLatitude;
      observerMeridian.visible = layers.observerMeridian;
      subsolarPoint.visible = layers.subsolarPoint;
      subsolarLabel.visible = layers.subsolarPoint;
      observerAltitudeLines.visible = layers.horizontalAltitudeLines;
      observerAzimuthLines.visible = layers.horizontalAzimuthLines;
      observerMeridianCircle.visible = layers.meridianCircle;
      observerPrimeVertical.visible = layers.primeVertical;
      horizontalAltitudeLines.visible = layers.horizontalAltitudeLines;
      horizontalAzimuthLines.visible = layers.horizontalAzimuthLines;
      localMeridianCircle.visible = layers.meridianCircle;
      localPrimeVertical.visible = layers.primeVertical;
      observerHorizonLine.visible = layers.compassLabels || layers.horizontalAltitudeLines || layers.horizontalAzimuthLines;
      localHorizonLine.visible = observerHorizonLine.visible;
      observerDome.visible = observerHorizonLine.visible;
      dome.visible = observerHorizonLine.visible;
      floor.visible = layers.tangentPlane;
      zenith.visible = layers.compassLabels;
      zenithAxis.visible = layers.horizontalAzimuthLines;
      northLabel.visible = layers.celestialAxis;
      eclipticLabel.visible = layers.ecliptic;
      currentPath.visible = layers.currentPath;
      comparisonPaths.visible = layers.seasonalPaths;
      shadowGroup.visible = layers.shadow;
      observerDot.visible = layers.observer && appearance.globalObserver === "dot";
      globalPerson.visible = layers.observer && appearance.globalObserver === "person";
      globalGnomon.visible = layers.observer && appearance.globalObserver === "gnomon";
      localDot.visible = layers.observer && appearance.localObserver === "dot";
      localPerson.visible = layers.observer && appearance.localObserver === "person";
      shadowGroup.visible = appearance.localObserver === "gnomon" && (layers.observer || layers.shadow);
      gnomon.visible = layers.observer && appearance.localObserver === "gnomon";
      earthMaterial.transparent = !appearance.earthOpaque;
      earthMaterial.opacity = appearance.earthOpaque ? 1 : 0.3;
      earthMaterial.depthWrite = appearance.earthOpaque;
      globalControls.enabled = !appearance.directManipulation;
      localControls.enabled = !appearance.directManipulation;
      globalRenderer.domElement.style.cursor = appearance.directManipulation ? "grab" : "move";
      localRenderer.domElement.style.cursor = appearance.directManipulation ? "grab" : "move";

      const declination = solarDeclination(state.day);
      const lambda = (TAU * (state.day - 80)) / 365;
      const eclipticSun = new THREE.Vector3()
        .set(3 * Math.cos(lambda), 3 * Math.sin(lambda), 0)
        .applyAxisAngle(new THREE.Vector3(1, 0, 0), degrees(23.44));
      globalSun.position.copy(eclipticSun);
      globalSunDragProxy.position.copy(eclipticSun);
      light.position.copy(eclipticSun).normalize().multiplyScalar(8);
      const subsolarNormal = eclipticSun.clone().normalize();
      subsolarPoint.position.copy(subsolarNormal).multiplyScalar(1.045);
      subsolarPoint.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), subsolarNormal);
      subsolarLabel.position.copy(subsolarNormal).multiplyScalar(1.18);

      const phi = degrees(state.latitude);
      const hourAngle = degrees(15 * (state.time - 12));
      const sunRightAscension = Math.atan2(eclipticSun.y, eclipticSun.x);
      const observerLongitude = sunRightAscension + hourAngle;
      earthRotationGroup.rotation.z = observerLongitude;
      const normal = new THREE.Vector3(
        Math.cos(phi) * Math.cos(observerLongitude),
        Math.cos(phi) * Math.sin(observerLongitude),
        Math.sin(phi),
      );
      const east = new THREE.Vector3(-Math.sin(observerLongitude), Math.cos(observerLongitude), 0);
      const north = new THREE.Vector3(
        -Math.sin(phi) * Math.cos(observerLongitude),
        -Math.sin(phi) * Math.sin(observerLongitude),
        Math.cos(phi),
      );
      observer.position.copy(normal.clone().multiplyScalar(1.01));
      observer.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(east, north, normal));
      const globalSunLocal = eclipticSun.clone().normalize().applyQuaternion(observer.quaternion.clone().invert());
      globalShadow.visible = layers.shadow && appearance.globalObserver === "gnomon" && globalSunLocal.z > 0.002;
      if (globalSunLocal.z > 0.002) {
        const scale = 0.16 / globalSunLocal.z;
        globalShadow.geometry.setFromPoints([
          new THREE.Vector3(),
          new THREE.Vector3(-globalSunLocal.x * scale, -globalSunLocal.y * scale, 0),
        ]);
      }

      if (lastObserverLatitude !== state.latitude) {
        lastObserverLatitude = state.latitude;
        clearGroup(observerLatitude);
        const radius = 1.018 * Math.cos(phi);
        const z = 1.018 * Math.sin(phi);
        observerLatitude.add(makeLine(circle(radius, z), 0xff8f75, 0.98));
      }

      const currentPathKey = `${state.latitude}:${state.day.toFixed(2)}:${layers.currentPath}:${layers.belowHorizon}`;
      if (currentPathKey !== lastCurrentPathKey) {
        lastCurrentPathKey = currentPathKey;
        clearGroup(currentPath);
        if (layers.currentPath) {
          pathSegments(currentPath, state.latitude, declination, 0xff8f75, false, layers.belowHorizon);
        }
      }
      const seasonPathKey = `${state.latitude}:${layers.seasonalPaths}:${layers.belowHorizon}`;
      if (seasonPathKey !== lastSeasonPathKey) {
        lastSeasonPathKey = seasonPathKey;
        clearGroup(comparisonPaths);
        if (layers.seasonalPaths) {
          seasons.forEach((season) => {
            pathSegments(
              comparisonPaths,
              state.latitude,
              season.declination,
              season.color,
              true,
              layers.belowHorizon,
            );
          });
        }
      }

      const vector = sunHorizontal(state.latitude, declination, hourAngle);
      localSun.position.set(vector.x, vector.y, vector.z);
      localSunDragProxy.position.copy(localSun.position);
      (localSun.material as THREE.MeshBasicMaterial).opacity = vector.z >= 0 ? 1 : 0.25;
      (localSun.material as THREE.MeshBasicMaterial).transparent = true;
      const cast = shadowForUnitGnomon(vector);
      shadow.visible = shadowBar.visible = ray.visible = Boolean(cast) && layers.shadow && appearance.localObserver === "gnomon";
      if (cast) {
        const tip = new THREE.Vector3(cast.x * rodHeight, cast.y * rodHeight, 0);
        shadow.geometry.setFromPoints([new THREE.Vector3(), tip]);
        const direction = tip.clone();
        const length = direction.length();
        shadowBar.position.copy(tip).multiplyScalar(0.5);
        shadowBar.position.z = 0.012;
        shadowBar.scale.set(1, length, 1);
        shadowBar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
        ray.geometry.setFromPoints([new THREE.Vector3(0, 0, rodHeight), tip]);
        ray.computeLineDistances();
      }
    },
    reset() {
      globalCamera.position.set(4.6, 3.15, 4.6);
      globalControls.target.set(0, 0, 0);
      localCamera.position.set(2.65, 2.15, 2.4);
      localControls.target.set(0, 0, 0.42);
      globalControls.update();
      localControls.update();
    },
    capture(target, mode, lineWidth) {
      const scene = target === "global" ? globalScene : localScene;
      const renderer = target === "global" ? globalRenderer : localRenderer;
      const snapshots: Array<{
        material: THREE.Material & { color?: THREE.Color };
        color?: number;
        opacity: number;
        transparent: boolean;
      }> = [];
      const visibilitySnapshots = new Map<THREE.Object3D, boolean>();
      const originalBackground = scene.background;
      const originalAlpha = renderer.getClearAlpha();
      const originalColor = renderer.getClearColor(new THREE.Color()).getHex();
      const originalEarthMaterial = earth.material;
      let printEarthMaterial: THREE.MeshBasicMaterial | null = null;

      [globalSunDragProxy, observerDragProxy, localSunDragProxy].forEach((object) => {
        visibilitySnapshots.set(object, object.visible);
        object.visible = false;
      });

      if (target === "shadow") {
        [
          horizontalAltitudeLines,
          horizontalAzimuthLines,
          localMeridianCircle,
          localPrimeVertical,
          localHorizonLine,
          dome,
          currentPath,
          comparisonPaths,
          localCompassLabels,
          localAltitudeLabels,
          localAzimuthLabels,
          zenith,
          localSun,
          localDot,
          localPerson,
        ].forEach((object) => {
          visibilitySnapshots.set(object, object.visible);
          object.visible = false;
        });
        visibilitySnapshots.set(shadowGroup, shadowGroup.visible);
        shadowGroup.visible = true;
      }

      if (mode === "line") {
        scene.background = new THREE.Color(0xffffff);
        renderer.setClearColor(0xffffff, 1);
        if (target === "global") {
          printEarthMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
          earth.material = printEarthMaterial;
        }
        scene.traverse((object) => {
          const renderable = object as THREE.Mesh | THREE.Line | THREE.Sprite;
          const materials = renderable.material
            ? Array.isArray(renderable.material) ? renderable.material : [renderable.material]
            : [];
          materials.forEach((material) => {
            const printable = material as THREE.Material & { color?: THREE.Color };
            snapshots.push({
              material: printable,
              color: printable.color?.getHex(),
              opacity: printable.opacity,
              transparent: printable.transparent,
            });
            if (printable.color) printable.color.set(0x111111);
            if (object === floor || object === dome || object === celestial || object === observerDome) printable.opacity = 0;
            else if (object === localSun || object === globalSun || object === globalSunDragProxy || object === localSunDragProxy) printable.opacity = 1;
            else printable.opacity = Math.max(printable.opacity, 0.48);
          });
        });
      }

      renderer.render(scene, target === "global" ? globalCamera : localCamera);
      const source = renderer.domElement;
      const output = document.createElement("canvas");
      output.width = source.width;
      output.height = source.height;
      const context = output.getContext("2d")!;
      context.fillStyle = mode === "line" ? "#ffffff" : "#061b2b";
      context.fillRect(0, 0, output.width, output.height);
      if (mode === "grayscale") context.filter = "grayscale(1)";
      context.drawImage(source, 0, 0);
      context.filter = "none";
      if (mode === "line") {
        const image = context.getImageData(0, 0, output.width, output.height);
        const binary = context.createImageData(output.width, output.height);
        binary.data.fill(255);
        const radius = Math.max(0, Math.round(lineWidth) - 1);
        for (let y = 0; y < output.height; y += 1) {
          for (let x = 0; x < output.width; x += 1) {
            const index = (y * output.width + x) * 4;
            const luminance = image.data[index] * 0.2126 + image.data[index + 1] * 0.7152 + image.data[index + 2] * 0.0722;
            if (luminance > 205) continue;
            for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
              for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
                const targetX = x + offsetX;
                const targetY = y + offsetY;
                if (targetX < 0 || targetY < 0 || targetX >= output.width || targetY >= output.height) continue;
                const targetIndex = (targetY * output.width + targetX) * 4;
                binary.data[targetIndex] = 17;
                binary.data[targetIndex + 1] = 17;
                binary.data[targetIndex + 2] = 17;
                binary.data[targetIndex + 3] = 255;
              }
            }
          }
        }
        context.putImageData(binary, 0, 0);
        const inset = Math.max(8, Math.round(output.width * 0.012));
        context.strokeStyle = "#111111";
        context.lineWidth = Math.max(2, Math.round(output.width * 0.003));
        context.strokeRect(inset, inset, output.width - inset * 2, output.height - inset * 2);
      }

      snapshots.forEach(({ material, color, opacity, transparent }) => {
        if (color !== undefined && material.color) material.color.set(color);
        material.opacity = opacity;
        material.transparent = transparent;
      });
      if (printEarthMaterial) {
        earth.material = originalEarthMaterial;
        printEarthMaterial.dispose();
      }
      visibilitySnapshots.forEach((visible, object) => { object.visible = visible; });
      scene.background = originalBackground;
      renderer.setClearColor(originalColor, originalAlpha);
      renderer.render(scene, target === "global" ? globalCamera : localCamera);
      return output.toDataURL("image/png");
    },
    dispose() {
      cancelAnimationFrame(animation);
      cancelAnimationFrame(resizeFrame);
      globalRenderer.domElement.removeEventListener("pointerdown", beginGlobalDrag);
      globalRenderer.domElement.removeEventListener("pointermove", moveGlobalDrag);
      globalRenderer.domElement.removeEventListener("pointerup", endGlobalDrag);
      globalRenderer.domElement.removeEventListener("pointercancel", endGlobalDrag);
      localRenderer.domElement.removeEventListener("pointerdown", beginLocalDrag);
      localRenderer.domElement.removeEventListener("pointermove", moveLocalDrag);
      localRenderer.domElement.removeEventListener("pointerup", endLocalDrag);
      localRenderer.domElement.removeEventListener("pointercancel", endLocalDrag);
      observerResize.disconnect();
      globalControls.dispose();
      localControls.dispose();
      globalRenderer.dispose();
      localRenderer.dispose();
      globalRenderer.domElement.remove();
      localRenderer.domElement.remove();
    },
  };
}

export default function SolarLab() {
  const globalRef = useRef<HTMLDivElement>(null);
  const localRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SceneApi | null>(null);
  const directoryRef = useRef<DirectoryHandle | null>(null);
  const [state, setState] = useState<LabState>({ latitude: 23.5, day: 172, time: 12 });
  const [playing, setPlaying] = useState<"day" | "year" | null>(null);
  const [showLayers, setShowLayers] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportTarget, setExportTarget] = useState<ExportTarget>("local");
  const [exportMode, setExportMode] = useState<ExportMode>("color");
  const [lineWidth, setLineWidth] = useState(1);
  const [exportPreview, setExportPreview] = useState("");
  const [directoryName, setDirectoryName] = useState("瀏覽器下載資料夾");
  const [appearance, setAppearance] = useState<AppearanceState>({
    globalObserver: "dot",
    localObserver: "gnomon",
    directManipulation: false,
    earthOpaque: true,
    compassPoints: 4,
  });
  const [layers, setLayers] = useState<LayerState>({
    celestialSphere: true,
    rightAscensionLines: true,
    declinationLines: true,
    rightAscensionLabels: true,
    declinationLabels: true,
    celestialEquator: true,
    ecliptic: true,
    eclipticLongitudeLines: false,
    eclipticLatitudeLines: false,
    eclipticLongitudeLabels: false,
    eclipticLatitudeLabels: false,
    seasonalMarkers: true,
    solarTermLabels: false,
    apsides: true,
    celestialAxis: true,
    observer: true,
    tangentPlane: true,
    geographicGrid: true,
    observerLatitude: true,
    observerMeridian: true,
    subsolarPoint: true,
    compassLabels: true,
    horizontalAltitudeLines: true,
    horizontalAzimuthLines: true,
    horizontalAltitudeLabels: true,
    horizontalAzimuthLabels: false,
    meridianCircle: true,
    primeVertical: true,
    seasonalPaths: true,
    currentPath: true,
    belowHorizon: true,
    shadow: true,
  });

  useEffect(() => {
    if (!globalRef.current || !localRef.current) return;
    sceneRef.current = setupScenes(globalRef.current, localRef.current, (patch) => {
      setPlaying(null);
      setState((current) => ({ ...current, ...patch }));
    });
    return () => sceneRef.current?.dispose();
  }, []);

  useEffect(() => sceneRef.current?.update(state, layers, appearance), [state, layers, appearance]);

  useEffect(() => {
    if (!exportOpen) return;
    const frame = requestAnimationFrame(() => {
      const preview = sceneRef.current?.capture(exportTarget, exportMode, lineWidth);
      if (preview) setExportPreview(preview);
    });
    return () => cancelAnimationFrame(frame);
  }, [exportOpen, exportTarget, exportMode, lineWidth, state, layers, appearance]);

  useEffect(() => {
    if (!playing) return;
    let previous = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const delta = Math.min(0.05, (now - previous) / 1000);
      previous = now;
      setState((current) => {
        if (playing === "year") {
          return {
            ...current,
            day: ((current.day - 1 + delta * 6) % 365) + 1,
            time: (current.time + delta * 144) % 24,
          };
        }
        return { ...current, time: (current.time + delta * 2.2) % 24 };
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  const declination = solarDeclination(state.day);
  const vector = sunHorizontal(state.latitude, declination, degrees(15 * (state.time - 12)));
  const angles = horizontalAngles(vector);
  const cast = shadowForUnitGnomon(vector);
  const noonAltitude = 90 - Math.abs(state.latitude - radians(declination));

  const setNumber = useCallback((key: keyof LabState, value: string) => {
    setState((current) => ({ ...current, [key]: Number(value) }));
  }, []);

  const toggleLayer = useCallback((key: keyof LayerState) => {
    setLayers((current) => {
      const next = { ...current, [key]: !current[key] };
      if (key === "solarTermLabels" && next.solarTermLabels) next.seasonalMarkers = false;
      if (key === "seasonalMarkers" && next.seasonalMarkers) next.solarTermLabels = false;
      return next;
    });
  }, []);

  const chooseDirectory = async () => {
    const picker = (window as typeof window & { showDirectoryPicker?: () => Promise<DirectoryHandle> }).showDirectoryPicker;
    if (!picker) {
      setDirectoryName("此瀏覽器使用預設下載資料夾");
      return;
    }
    try {
      const handle = await picker();
      directoryRef.current = handle;
      setDirectoryName(handle.name);
    } catch {
      // The user can cancel without changing the current destination.
    }
  };

  const saveExport = async () => {
    const dataUrl = sceneRef.current?.capture(exportTarget, exportMode, lineWidth);
    if (!dataUrl) return;
    const filename = `astrolab-${exportTarget}-${Math.round(state.latitude)}-${Math.round(state.day)}-${exportMode}.png`;
    const blob = await fetch(dataUrl).then((response) => response.blob());
    if (directoryRef.current) {
      const file = await directoryRef.current.getFileHandle(filename, { create: true });
      const writable = await file.createWritable();
      await writable.write(blob);
      await writable.close();
    } else {
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = filename;
      link.click();
    }
  };

  const status = cast
    ? {
        length: cast.length > 40 ? "極長" : `${cast.length.toFixed(2)} 倍`,
        direction: `${compassLabel(cast.azimuth)}（${cast.azimuth.toFixed(0)}°）`,
      }
    : { length: "看不見", direction: "夜晚" };

  return (
    <main className="lab-shell">
      <header className="topbar">
        <div>
          <div className="eyebrow"><span className="live-dot" /> AstroLab · 模型 01</div>
          <h1>太陽、天球與竿影</h1>
        </div>
        <div className="header-actions">
          <button className={appearance.directManipulation ? "active" : ""} onClick={() => setAppearance((current) => ({ ...current, directManipulation: !current.directManipulation }))}><MousePointer2 size={15} />直接操控</button>
          <button className={showLayers ? "active" : ""} onClick={() => setShowLayers((value) => !value)}><Layers3 size={15} />圖層</button>
          <button className={showControls ? "active" : ""} onClick={() => setShowControls((value) => !value)}><Settings2 size={15} />控制台</button>
          <button onClick={() => sceneRef.current?.reset()} aria-label="重設視角"><RotateCcw size={15} />重設</button>
          <Link className="toolbar-link" href="/about"><Info size={15} />模型說明</Link>
          <button className="primary-action" onClick={() => setExportOpen(true)}><Download size={15} />匯出</button>
        </div>
      </header>

      <section className="stage-grid">
        <article className="viewport-card global-card">
          <div className="card-label"><span>01</span><div><strong>地心模型</strong><small>地球、天球赤道與黃道</small></div></div>
          <div className="canvas-host" ref={globalRef} />
          <div className="legend globe-legend"><i className="light" />赤經／赤緯<i className="earth-grid" />地理經緯線<i className="ecliptic-line" />黃道<i className="sun" />太陽<i className="observer" />觀察者</div>
        </article>

        <div className="right-column">
          <article className="viewport-card local-card">
            <div className="card-label"><span>02</span><div><strong>觀察者模型</strong><small>{formatLatitude(state.latitude)}的天空</small></div></div>
            <div className="canvas-host" ref={localRef} />
            <div className="season-key"><span><i className="current" />當日</span><span><i className="summer" />夏至</span><span><i className="equinox" />春／秋分</span><span><i className="winter" />冬至</span></div>
          </article>

          <section className="metrics" aria-label="計算結果">
            <div><span>太陽赤緯</span><strong>{Math.abs(radians(declination)).toFixed(1)}°{declination >= 0 ? " N" : " S"}</strong></div>
            <div><span>正午高度角</span><strong>{noonAltitude.toFixed(1)}°</strong></div>
            <div><span>目前高度／方位</span><strong>{angles.altitude.toFixed(1)}° / {angles.azimuth.toFixed(0)}°</strong></div>
            <div><span>影長（竿高 = 1）</span><strong>{status.length}</strong></div>
            <div><span>竿影指向</span><strong>{status.direction}</strong></div>
          </section>
        </div>
      </section>

      <aside className={`layer-drawer ${showLayers ? "open" : ""}`} aria-hidden={!showLayers}>
        <header><div><Layers3 size={18} /><strong>視圖圖層</strong></div><button onClick={() => setShowLayers(false)} aria-label="關閉圖層"><X size={17} /></button></header>
        <div className="drawer-scroll">
          <details open><summary>天球與赤道坐標</summary><div className="layer-list coordinate-controls">
            <label><input type="checkbox" checked={layers.celestialSphere} onChange={() => toggleLayer("celestialSphere")} />天球外框</label>
            <div className="coordinate-row"><strong>赤經</strong><label><input type="checkbox" checked={layers.rightAscensionLines} onChange={() => toggleLayer("rightAscensionLines")} />線</label><label><input type="checkbox" checked={layers.rightAscensionLabels} onChange={() => toggleLayer("rightAscensionLabels")} />標籤</label></div>
            <div className="coordinate-row"><strong>赤緯</strong><label><input type="checkbox" checked={layers.declinationLines} onChange={() => toggleLayer("declinationLines")} />線</label><label><input type="checkbox" checked={layers.declinationLabels} onChange={() => toggleLayer("declinationLabels")} />標籤</label></div>
            <label><input type="checkbox" checked={layers.celestialEquator} onChange={() => toggleLayer("celestialEquator")} />天赤道</label>
            <label><input type="checkbox" checked={layers.celestialAxis} onChange={() => toggleLayer("celestialAxis")} />天軸</label>
          </div></details>
          <details open><summary>黃道坐標與節氣</summary><div className="layer-list coordinate-controls">
            <label><input type="checkbox" checked={layers.ecliptic} onChange={() => toggleLayer("ecliptic")} />黃道</label>
            <div className="coordinate-row"><strong>黃經</strong><label><input type="checkbox" checked={layers.eclipticLongitudeLines} onChange={() => toggleLayer("eclipticLongitudeLines")} />線</label><label><input type="checkbox" checked={layers.eclipticLongitudeLabels} onChange={() => toggleLayer("eclipticLongitudeLabels")} />標籤</label></div>
            <div className="coordinate-row"><strong>黃緯</strong><label><input type="checkbox" checked={layers.eclipticLatitudeLines} onChange={() => toggleLayer("eclipticLatitudeLines")} />線</label><label><input type="checkbox" checked={layers.eclipticLatitudeLabels} onChange={() => toggleLayer("eclipticLatitudeLabels")} />標籤</label></div>
            <label><input type="checkbox" checked={layers.seasonalMarkers} onChange={() => toggleLayer("seasonalMarkers")} />分至點</label>
            <label><input type="checkbox" checked={layers.solarTermLabels} onChange={() => toggleLayer("solarTermLabels")} />節氣</label>
            <label><input type="checkbox" checked={layers.apsides} onChange={() => toggleLayer("apsides")} />近日點／遠日點</label>
          </div></details>
          <details open><summary>地球與觀察者</summary><div className="layer-list">
            <span className="field-label">地球外觀</span><select value={appearance.earthOpaque ? "opaque" : "transparent"} onChange={(event) => setAppearance((current) => ({ ...current, earthOpaque: event.target.value === "opaque" }))}><option value="opaque">不透明</option><option value="transparent">透明</option></select>
            <label><input type="checkbox" checked={layers.geographicGrid} onChange={() => toggleLayer("geographicGrid")} />一般經緯線</label>
            <label><input type="checkbox" checked={layers.observerLatitude} onChange={() => toggleLayer("observerLatitude")} />觀察者緯線</label>
            <label><input type="checkbox" checked={layers.observerMeridian} onChange={() => toggleLayer("observerMeridian")} />觀察者經線</label>
            <label><input type="checkbox" checked={layers.subsolarPoint} onChange={() => toggleLayer("subsolarPoint")} />日下點</label>
            <label><input type="checkbox" checked={layers.observer} onChange={() => toggleLayer("observer")} />觀察者</label>
            <label><input type="checkbox" checked={layers.tangentPlane} onChange={() => toggleLayer("tangentPlane")} />切平面</label>
            <span className="field-label">地心模型觀察者</span><select disabled={!layers.observer} value={appearance.globalObserver} onChange={(event) => setAppearance((current) => ({ ...current, globalObserver: event.target.value as ObserverMode }))}><option value="person">人形</option><option value="dot">圓形點</option><option value="gnomon">竿與影</option></select>
          </div></details>
          <details open><summary>地平坐標與觀察者天空</summary><div className="layer-list coordinate-controls">
            <label><input type="checkbox" checked={layers.compassLabels} onChange={() => toggleLayer("compassLabels")} />方位</label>
            <select aria-label="方位數量" disabled={!layers.compassLabels} value={appearance.compassPoints} onChange={(event) => setAppearance((current) => ({ ...current, compassPoints: Number(event.target.value) as 4 | 8 | 16 }))}><option value="4">4 方位</option><option value="8">8 方位</option><option value="16">16 方位</option></select>
            <div className="coordinate-row"><strong>高度角</strong><label><input type="checkbox" checked={layers.horizontalAltitudeLines} onChange={() => toggleLayer("horizontalAltitudeLines")} />線</label><label><input type="checkbox" checked={layers.horizontalAltitudeLabels} onChange={() => toggleLayer("horizontalAltitudeLabels")} />標籤</label></div>
            <div className="coordinate-row"><strong>方位角</strong><label><input type="checkbox" checked={layers.horizontalAzimuthLines} onChange={() => toggleLayer("horizontalAzimuthLines")} />線</label><label><input type="checkbox" checked={layers.horizontalAzimuthLabels} onChange={() => toggleLayer("horizontalAzimuthLabels")} />標籤</label></div>
            <label><input type="checkbox" checked={layers.meridianCircle} onChange={() => toggleLayer("meridianCircle")} />子午圈</label>
            <label><input type="checkbox" checked={layers.primeVertical} onChange={() => toggleLayer("primeVertical")} />酉卯圈</label>
            <label><input type="checkbox" checked={layers.currentPath} onChange={() => toggleLayer("currentPath")} />當日太陽週日運動軌跡</label>
            <label><input type="checkbox" checked={layers.seasonalPaths} onChange={() => toggleLayer("seasonalPaths")} />二分二至太陽週日運動軌跡</label>
            <label><input type="checkbox" checked={layers.belowHorizon} onChange={() => toggleLayer("belowHorizon")} />地平線以下</label>
            <label><input type="checkbox" checked={layers.shadow} onChange={() => toggleLayer("shadow")} />竿與影線</label>
            <span className="field-label">觀察者模型中心</span><select disabled={!layers.observer} value={appearance.localObserver} onChange={(event) => setAppearance((current) => ({ ...current, localObserver: event.target.value as ObserverMode }))}><option value="person">人形</option><option value="dot">圓形點</option><option value="gnomon">竿與影</option></select>
          </div></details>
        </div>
      </aside>

      <section className="control-panel" aria-label="同步控制台">
        <header className="control-panel-heading"><div><Settings2 size={17} /><strong>同步控制台</strong></div><button onClick={() => setShowControls((value) => !value)} aria-expanded={showControls} aria-label={showControls ? "收合同步控制台" : "展開同步控制台"}>{showControls ? <ChevronUp size={17} /> : <ChevronDown size={17} />}</button></header>
        {showControls && <div className="control-deck">
          <label><span>緯度 <b>{formatLatitude(state.latitude)}</b></span><input type="range" min="-90" max="90" step="0.5" value={state.latitude} onChange={(event) => setNumber("latitude", event.target.value)} /><div className="preset-row latitude-presets">{latitudePresets.map(([label, latitude]) => <button type="button" key={label} className={state.latitude === latitude ? "selected" : ""} onClick={() => { setPlaying(null); setState((current) => ({ ...current, latitude })); }}>{label}</button>)}</div></label>
          <label><span>日期 <b>{dateFromDay(state.day)}</b></span><input type="range" min="1" max="365" step="0.1" value={state.day} onChange={(event) => setNumber("day", event.target.value)} /><div className="preset-row">{datePresets.map(([label, day]) => <button type="button" key={label} className={Math.round(state.day) === day ? "selected" : ""} onClick={() => { setPlaying(null); setState((current) => ({ ...current, day })); }}>{label}</button>)}</div><select className="term-select" value="" onChange={(event) => { const index = Number(event.target.value); if (Number.isNaN(index)) return; const day = ((80 + index * 365 / 24 - 1) % 365) + 1; setPlaying(null); setState((current) => ({ ...current, day })); }}><option value="">24 節氣…</option>{solarTerms.map((term, index) => <option key={term} value={index}>{term}</option>)}</select></label>
          <label><span>地方太陽時 <b>{formatTime(state.time)}</b></span><input type="range" min="0" max="24" step="0.05" value={state.time} onChange={(event) => setNumber("time", event.target.value)} /></label>
          <div className="play-actions"><button className={playing === "day" ? "active" : ""} onClick={() => setPlaying((value) => value === "day" ? null : "day")}>{playing === "day" ? <Pause size={14} /> : <Play size={14} />}一天</button><button className={playing === "year" ? "active year-play" : "year-play"} onClick={() => setPlaying((value) => value === "year" ? null : "year")}>{playing === "year" ? <Pause size={14} /> : <Play size={14} />}一年</button><button onClick={() => { setPlaying(null); setState((current) => ({ ...current, time: 12 })); }}>正午</button></div>
        </div>}
      </section>

      {exportOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setExportOpen(false); }}>
        <section className="export-modal" role="dialog" aria-modal="true" aria-labelledby="export-title">
          <header><div><Download size={19} /><strong id="export-title">匯出教材圖</strong></div><button onClick={() => setExportOpen(false)} aria-label="關閉匯出"><X size={18} /></button></header>
          <div className="export-body">
            <div className="export-options">
              <label><span>輸出內容</span><select value={exportTarget} onChange={(event) => setExportTarget(event.target.value as ExportTarget)}><option value="global">地心模型</option><option value="local">觀察者模型</option><option value="shadow">當日竿影圖</option></select></label>
              <label><span>呈現方式</span><select value={exportMode} onChange={(event) => setExportMode(event.target.value as ExportMode)}><option value="color">螢幕所見・彩色</option><option value="grayscale">螢幕所見・灰階</option><option value="line">黑白線稿</option></select></label>
              {exportMode === "line" && <label><span>線條粗細 <b>{lineWidth}</b></span><input type="range" min="1" max="4" step="1" value={lineWidth} onChange={(event) => setLineWidth(Number(event.target.value))} /></label>}
              <div className="directory-choice"><span>輸出目錄</span><button onClick={chooseDirectory}><FolderOpen size={15} />{directoryName}</button></div>
              <p>黑白線稿會保留太陽實心圓與外框，適合講義排版及影印。</p>
            </div>
            <div className="export-preview"><div><Eye size={14} />輸出預覽</div>{exportPreview ? <Image src={exportPreview} alt="即將輸出的教材圖預覽" width={960} height={600} unoptimized /> : <div className="preview-loading">建立預覽中…</div>}</div>
          </div>
          <footer><button onClick={() => setExportOpen(false)}>取消</button><button className="primary-action" onClick={saveExport}><Download size={15} />儲存 PNG</button></footer>
        </section>
      </div>}

      <footer className="lab-footer"><span>ASTROLAB / INTERACTIVE SCIENCE MODELS</span><span>教學近似模型 · 赤緯採週期近似式</span></footer>
    </main>
  );
}
