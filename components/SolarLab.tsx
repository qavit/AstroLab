"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
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
type LayerState = {
  celestialSphere: boolean;
  equatorialGrid: boolean;
  ecliptic: boolean;
  observer: boolean;
  geographicGrid: boolean;
  observerLatitude: boolean;
  subsolarPoint: boolean;
  horizontalGrid: boolean;
  labels: boolean;
  seasonalPaths: boolean;
  currentPath: boolean;
  belowHorizon: boolean;
  shadow: boolean;
};
type SceneApi = {
  update: (state: LabState, layers: LayerState) => void;
  reset: () => void;
  exportLocal: (filename: string, monochrome: boolean) => void;
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

function textSprite(text: string, color = "#ffffff", scale = 0.16) {
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
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(scale * 4, scale, 1);
  return sprite;
}

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

function setupScenes(globalHost: HTMLDivElement, localHost: HTMLDivElement): SceneApi {
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
  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(1, 64, 32),
    new THREE.MeshPhongMaterial({ color: 0x245a83, emissive: 0x020a12, shininess: 18 }),
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
  const subsolarPoint = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 18, 12),
    new THREE.MeshBasicMaterial({ color: 0xffd66f }),
  );
  globalScene.add(subsolarPoint);
  const subsolarLabel = textSprite("日下點", "#ffe39a", 0.11);
  globalScene.add(subsolarLabel);

  // Equatorial coordinates on the celestial sphere: declination parallels and RA hour circles.
  const equatorialGrid = new THREE.Group();
  for (let declination = -60; declination <= 60; declination += 30) {
    const radius = 3 * Math.cos(degrees(declination));
    const z = 3 * Math.sin(degrees(declination));
    equatorialGrid.add(makeLine(circle(radius, z), 0x73aeca, declination === 0 ? 0.7 : 0.26));
  }
  for (let rightAscension = 0; rightAscension < 360; rightAscension += 15) {
    const points = Array.from({ length: 241 }, (_, index) => {
      const declination = degrees(-90 + (180 * index) / 240);
      return new THREE.Vector3(
        3 * Math.cos(declination) * Math.cos(degrees(rightAscension)),
        3 * Math.cos(declination) * Math.sin(degrees(rightAscension)),
        3 * Math.sin(declination),
      );
    });
    equatorialGrid.add(makeLine(points, 0x6395b2, 0.2));
  }
  globalScene.add(equatorialGrid);

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
  const celestialEquator = makeLine(circle(3), 0x9cd9e5, 0.82);
  globalScene.add(celestialEquator);
  const ecliptic = makeLine(circle(3), 0xf2c86b, 0.96);
  ecliptic.rotation.x = degrees(23.44);
  globalScene.add(ecliptic);
  const globalLabels = new THREE.Group();
  const equatorLabel = textSprite("赤緯 0°", "#a9dce7");
  equatorLabel.position.set(2.25, 0, 0.18);
  const eclipticLabel = textSprite("黃道", "#f5d685");
  eclipticLabel.position.set(-2.25, 0.65, 0.8);
  const northLabel = textSprite("北天極／地軸", "#cbe0ef", 0.14);
  northLabel.position.set(0, 0, 3.42);
  const raLabel = textSprite("赤經", "#8fc2d7", 0.13);
  raLabel.position.set(0.4, 2.55, 0.15);
  globalLabels.add(equatorLabel, eclipticLabel, northLabel, raLabel);
  globalScene.add(globalLabels);

  const sunMaterial = new THREE.MeshBasicMaterial({ color: 0xffd66f });
  const globalSun = new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 16), sunMaterial);
  globalScene.add(globalSun);
  const observer = new THREE.Group();
  const observerDot = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 10), new THREE.MeshBasicMaterial({ color: 0xff8f75 }));
  const tangent = new THREE.Mesh(
    new THREE.CircleGeometry(0.42, 48),
    new THREE.MeshBasicMaterial({ color: 0x8ec9db, transparent: true, opacity: 0.24, side: THREE.DoubleSide }),
  );
  const observerDome = new THREE.Mesh(
    new THREE.SphereGeometry(0.42, 24, 12, 0, TAU, 0, Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x4c87a3, transparent: true, opacity: 0.09, wireframe: false, side: THREE.DoubleSide, depthWrite: false }),
  );
  observerDome.rotation.x = Math.PI / 2;
  const observerHorizonGrid = new THREE.Group();
  observerHorizonGrid.add(makeLine(circle(0.42), 0xa8d7e1, 0.74));
  for (const altitude of [30, 60]) {
    observerHorizonGrid.add(
      makeLine(
        circle(0.42 * Math.cos(degrees(altitude)), 0.42 * Math.sin(degrees(altitude)), 120),
        0x76b6cb,
        0.42,
      ),
    );
  }
  for (let azimuth = 0; azimuth < 360; azimuth += 45) {
    const points = Array.from({ length: 61 }, (_, index) => {
      const altitude = degrees((90 * index) / 60);
      return new THREE.Vector3(
        0.42 * Math.cos(altitude) * Math.sin(degrees(azimuth)),
        0.42 * Math.cos(altitude) * Math.cos(degrees(azimuth)),
        0.42 * Math.sin(altitude),
      );
    });
    observerHorizonGrid.add(makeLine(points, 0x76b6cb, 0.38));
  }
  observer.add(observerDot, tangent, observerDome, observerHorizonGrid);
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

  // Horizontal coordinates: altitude circles and azimuth great semicircles.
  const horizontalGrid = new THREE.Group();
  horizontalGrid.add(makeLine(circle(1), 0xb8dce8, 0.78));
  for (const altitude of [30, 60]) {
    horizontalGrid.add(makeLine(circle(Math.cos(degrees(altitude)), Math.sin(degrees(altitude))), 0x70a9c3, 0.34));
  }
  for (let azimuth = 0; azimuth < 360; azimuth += 30) {
    const points = Array.from({ length: 91 }, (_, index) => {
      const altitude = degrees(index);
      return new THREE.Vector3(
        Math.cos(altitude) * Math.sin(degrees(azimuth)),
        Math.cos(altitude) * Math.cos(degrees(azimuth)),
        Math.sin(altitude),
      );
    });
    horizontalGrid.add(makeLine(points, 0x6598b2, 0.28));
  }
  const zenithAxis = makeLine(
    [new THREE.Vector3(0, 0, -0.16), new THREE.Vector3(0, 0, 1.18)],
    0xc1dfeb,
    0.78,
  );
  horizontalGrid.add(zenithAxis);
  localScene.add(horizontalGrid);

  const localLabels = new THREE.Group();
  const compass: Record<string, [number, number, number]> = {
    東: [1.1, 0, 0], 西: [-1.1, 0, 0], 北: [0, 1.1, 0], 南: [0, -1.1, 0],
  };
  Object.entries(compass).forEach(([label, position]) => {
    const sprite = textSprite(label, "#ffffff", 0.12);
    sprite.position.set(...position);
    localLabels.add(sprite);
  });
  const zenith = textSprite("天頂", "#ffffff", 0.12);
  zenith.position.set(0, 0, 1.12);
  const altitude30 = textSprite("高度 30°", "#91bdd0", 0.1);
  altitude30.position.set(0.86, 0, 0.53);
  const altitude60 = textSprite("高度 60°", "#91bdd0", 0.1);
  altitude60.position.set(0.48, 0, 0.9);
  localLabels.add(zenith, altitude30, altitude60);
  localScene.add(localLabels);

  const currentPath = new THREE.Group();
  const comparisonPaths = new THREE.Group();
  localScene.add(currentPath, comparisonPaths);
  const localSun = new THREE.Mesh(new THREE.SphereGeometry(0.058, 20, 14), sunMaterial.clone());
  localScene.add(localSun);
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

  let animation = 0;
  const draw = () => {
    animation = requestAnimationFrame(draw);
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
    update(state, layers) {
      celestial.visible = layers.celestialSphere;
      equatorialGrid.visible = layers.equatorialGrid;
      celestialEquator.visible = layers.equatorialGrid;
      ecliptic.visible = layers.ecliptic;
      observer.visible = layers.observer;
      geographicGrid.visible = layers.geographicGrid;
      observerLatitude.visible = layers.observerLatitude;
      subsolarPoint.visible = layers.subsolarPoint;
      subsolarLabel.visible = layers.subsolarPoint && layers.labels;
      horizontalGrid.visible = layers.horizontalGrid;
      dome.visible = layers.horizontalGrid;
      globalLabels.visible = layers.labels;
      localLabels.visible = layers.labels;
      equatorLabel.visible = layers.equatorialGrid;
      raLabel.visible = layers.equatorialGrid;
      eclipticLabel.visible = layers.ecliptic;
      currentPath.visible = layers.currentPath;
      comparisonPaths.visible = layers.seasonalPaths;
      shadowGroup.visible = layers.shadow;

      const declination = solarDeclination(state.day);
      const lambda = (TAU * (state.day - 80)) / 365;
      const eclipticSun = new THREE.Vector3()
        .set(3 * Math.cos(lambda), 3 * Math.sin(lambda), 0)
        .applyAxisAngle(new THREE.Vector3(1, 0, 0), degrees(23.44));
      globalSun.position.copy(eclipticSun);
      light.position.copy(eclipticSun).normalize().multiplyScalar(8);
      const subsolarNormal = eclipticSun.clone().normalize();
      subsolarPoint.position.copy(subsolarNormal).multiplyScalar(1.045);
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
      observer.position.copy(normal.clone().multiplyScalar(1.01));
      observer.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);

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
      (localSun.material as THREE.MeshBasicMaterial).opacity = vector.z >= 0 ? 1 : 0.25;
      (localSun.material as THREE.MeshBasicMaterial).transparent = true;
      const cast = shadowForUnitGnomon(vector);
      shadow.visible = shadowBar.visible = ray.visible = Boolean(cast) && layers.shadow;
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
    exportLocal(filename, monochrome) {
      const snapshots: Array<{
        material: THREE.Material & { color?: THREE.Color };
        color?: number;
        opacity: number;
        transparent: boolean;
      }> = [];
      const originalBackground = localScene.background;
      const originalAlpha = localRenderer.getClearAlpha();
      const originalColor = localRenderer.getClearColor(new THREE.Color()).getHex();

      if (monochrome) {
        localScene.background = new THREE.Color(0xffffff);
        localRenderer.setClearColor(0xffffff, 1);
        localScene.traverse((object) => {
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
            if (object === floor || object === dome) printable.opacity = 0;
            else if (object === localSun) printable.opacity = 1;
            else printable.opacity = Math.max(printable.opacity, 0.48);
          });
        });
      }

      localRenderer.render(localScene, localCamera);
      const source = localRenderer.domElement;
      const output = document.createElement("canvas");
      output.width = source.width;
      output.height = source.height;
      const context = output.getContext("2d")!;
      context.fillStyle = monochrome ? "#ffffff" : "#111313";
      context.fillRect(0, 0, output.width, output.height);
      context.drawImage(source, 0, 0);
      if (monochrome) {
        const inset = Math.max(8, Math.round(output.width * 0.012));
        context.strokeStyle = "#111111";
        context.lineWidth = Math.max(2, Math.round(output.width * 0.003));
        context.strokeRect(inset, inset, output.width - inset * 2, output.height - inset * 2);
      }

      const link = document.createElement("a");
      link.href = output.toDataURL("image/png");
      link.download = filename;
      link.click();

      snapshots.forEach(({ material, color, opacity, transparent }) => {
        if (color !== undefined && material.color) material.color.set(color);
        material.opacity = opacity;
        material.transparent = transparent;
      });
      localScene.background = originalBackground;
      localRenderer.setClearColor(originalColor, originalAlpha);
      localRenderer.render(localScene, localCamera);
    },
    dispose() {
      cancelAnimationFrame(animation);
      cancelAnimationFrame(resizeFrame);
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
  const [state, setState] = useState<LabState>({ latitude: 23.5, day: 172, time: 12 });
  const [playing, setPlaying] = useState<"day" | "year" | null>(null);
  const [layers, setLayers] = useState<LayerState>({
    celestialSphere: true,
    equatorialGrid: true,
    ecliptic: true,
    observer: true,
    geographicGrid: true,
    observerLatitude: true,
    subsolarPoint: true,
    horizontalGrid: true,
    labels: true,
    seasonalPaths: true,
    currentPath: true,
    belowHorizon: true,
    shadow: true,
  });

  useEffect(() => {
    if (!globalRef.current || !localRef.current) return;
    sceneRef.current = setupScenes(globalRef.current, localRef.current);
    return () => sceneRef.current?.dispose();
  }, []);

  useEffect(() => sceneRef.current?.update(state, layers), [state, layers]);

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
    setLayers((current) => ({ ...current, [key]: !current[key] }));
  }, []);

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
          <p>從地心幾何切換到觀察者的天空，把抽象座標變成可操作的空間。</p>
        </div>
        <div className="header-actions">
          <button onClick={() => sceneRef.current?.reset()}>重設視角</button>
          <details className="export-menu">
            <summary>匯出教材圖</summary>
            <div>
              <button onClick={() => sceneRef.current?.exportLocal(`solar-path-${state.latitude}-${state.day}-screen.png`, false)}>螢幕版 PNG</button>
              <button onClick={() => sceneRef.current?.exportLocal(`solar-path-${state.latitude}-${state.day}-print-bw.png`, true)}>黑白線稿 PNG</button>
            </div>
          </details>
        </div>
      </header>

      <section className="stage-grid">
        <article className="viewport-card global-card">
          <div className="card-label"><span>01</span><div><strong>地心模型</strong><small>地球、天球赤道與黃道</small></div></div>
          <div className="canvas-host" ref={globalRef} />
          <div className="legend globe-legend"><i className="light" />赤經／赤緯<i className="earth-grid" />地理經緯線<i className="ecliptic-line" />黃道<i className="sun" />太陽<i className="observer" />觀察者</div>
          <div className="interaction-hint">以地軸旋轉 · 拖曳／縮放</div>
        </article>

        <div className="right-column">
          <article className="viewport-card local-card">
            <div className="card-label"><span>02</span><div><strong>觀察者模型</strong><small>{formatLatitude(state.latitude)}的天空</small></div></div>
            <div className="canvas-host" ref={localRef} />
            <div className="season-key"><span><i className="current" />當日</span><span><i className="summer" />夏至</span><span><i className="equinox" />春／秋分</span><span><i className="winter" />冬至</span></div>
            <div className="interaction-hint">以天頂—天底線旋轉</div>
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

      <section className="layer-deck" aria-label="圖層顯示控制">
        <div className="layer-heading"><strong>視圖圖層</strong><small>選擇教學時要保留的視覺元素</small></div>
        <div className="layer-group"><span>地心模型</span>
          <label><input type="checkbox" checked={layers.celestialSphere} onChange={() => toggleLayer("celestialSphere")} />天球外框</label>
          <label><input type="checkbox" checked={layers.equatorialGrid} onChange={() => toggleLayer("equatorialGrid")} />赤經／赤緯格線</label>
          <label><input type="checkbox" checked={layers.ecliptic} onChange={() => toggleLayer("ecliptic")} />黃道</label>
          <label><input type="checkbox" checked={layers.geographicGrid} onChange={() => toggleLayer("geographicGrid")} />一般經緯線</label>
          <label><input type="checkbox" checked={layers.observerLatitude} onChange={() => toggleLayer("observerLatitude")} />觀察者緯線</label>
          <label><input type="checkbox" checked={layers.subsolarPoint} onChange={() => toggleLayer("subsolarPoint")} />日下點</label>
          <label><input type="checkbox" checked={layers.observer} onChange={() => toggleLayer("observer")} />觀察者與切平面</label>
        </div>
        <div className="layer-group"><span>觀察者模型</span>
          <label><input type="checkbox" checked={layers.horizontalGrid} onChange={() => toggleLayer("horizontalGrid")} />高度／方位格線</label>
          <label><input type="checkbox" checked={layers.currentPath} onChange={() => toggleLayer("currentPath")} />當日日行跡</label>
          <label><input type="checkbox" checked={layers.seasonalPaths} onChange={() => toggleLayer("seasonalPaths")} />三季代表軌跡</label>
          <label><input type="checkbox" checked={layers.belowHorizon} onChange={() => toggleLayer("belowHorizon")} />地平線以下</label>
          <label><input type="checkbox" checked={layers.shadow} onChange={() => toggleLayer("shadow")} />竿與影線</label>
          <label><input type="checkbox" checked={layers.labels} onChange={() => toggleLayer("labels")} />座標標示</label>
        </div>
      </section>

      <section className="control-deck" aria-label="模型控制台">
        <div className="control-heading"><span>同步控制台</span><small>三個參數同時驅動兩個視圖與所有數值</small></div>
        <label><span>緯度 <b>{formatLatitude(state.latitude)}</b></span><input type="range" min="-90" max="90" step="0.5" value={state.latitude} onChange={(event) => setNumber("latitude", event.target.value)} /><div className="range-ends"><small>南極</small><small>赤道</small><small>北極</small></div><div className="preset-row latitude-presets">{latitudePresets.map(([label, latitude]) => <button type="button" key={label} className={state.latitude === latitude ? "selected" : ""} onClick={() => { setPlaying(null); setState((current) => ({ ...current, latitude })); }}>{label}</button>)}</div></label>
        <label><span>日期 <b>{dateFromDay(state.day)}</b></span><input type="range" min="1" max="365" step="0.1" value={state.day} onChange={(event) => setNumber("day", event.target.value)} /><div className="range-ends"><small>1 月</small><small>6 月</small><small>12 月</small></div><div className="preset-row">{datePresets.map(([label, day]) => <button type="button" key={label} className={Math.round(state.day) === day ? "selected" : ""} onClick={() => { setPlaying(null); setState((current) => ({ ...current, day })); }}>{label}</button>)}</div></label>
        <label><span>地方太陽時 <b>{formatTime(state.time)}</b></span><input type="range" min="0" max="24" step="0.05" value={state.time} onChange={(event) => setNumber("time", event.target.value)} /><div className="range-ends"><small>00</small><small>12</small><small>24</small></div></label>
        <div className="play-actions"><button className={playing === "day" ? "active" : ""} onClick={() => setPlaying((value) => value === "day" ? null : "day")}>{playing === "day" ? "暫停一天" : "▶ 播放一天"}</button><button className={playing === "year" ? "active year-play" : "year-play"} onClick={() => setPlaying((value) => value === "year" ? null : "year")}>{playing === "year" ? "暫停一年" : "▶ 快速播放一年"}</button><button onClick={() => { setPlaying(null); setState((current) => ({ ...current, time: 12 })); }}>跳到正午</button></div>
      </section>

      <footer className="lab-footer"><span>ASTROLAB / INTERACTIVE SCIENCE MODELS</span><span>教學近似模型 · 赤緯採週期近似式</span></footer>
    </main>
  );
}
