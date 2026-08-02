import * as THREE from "three";
import type { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { circle, clearGroup, makeLine, textSprite } from "@/lib/render/primitives";
import { degrees, formatTime, shadowForUnitGnomon, solarDeclination, sunHorizontal, TAU } from "@/lib/science/solar";
import {
  compassRose,
  hourAngleForTime,
  seasonalDeclinations,
  type AppearanceState,
  type LayerState,
  type ShadowTrace,
  type SolarLabState,
} from "@/models/solar";
import { belowHorizonArc, chibiPerson, horizonArc, labelInterval, pathSegments } from "./geometry";
import type { SolarFrame } from "./frame";

export type ObserverScene = {
  update: (
    state: SolarLabState,
    layers: LayerState,
    appearance: AppearanceState,
    frame: SolarFrame,
    shadowTrace: ShadowTrace,
  ) => void;
  applyLabelDetail: (distance: number, layers: LayerState | null, appearance: AppearanceState | null) => void;
  /** Screen-space line materials, rebuilt whenever the seasonal paths are. */
  lineMaterials: () => LineMaterial[];
  /** Called after the seasonal paths are rebuilt, so the viewport can re-push its size into them. */
  setPathsRebuiltHandler: (handler: () => void) => void;
  exportParts: {
    dragProxies: THREE.Object3D[];
    backdrop: THREE.Object3D[];
    solid: THREE.Object3D[];
    /** Everything the day's-shadow export drops so only the gnomon and its trace remain. */
    shadowExportHidden: THREE.Object3D[];
    shadowGroup: THREE.Object3D;
    shadowTraceGroup: THREE.Group;
  };
  currentPath: THREE.Object3D;
  sunDragProxy: THREE.Object3D;
};

/** The sky as seen from the observer's tangent plane: horizon, grids, sun path, gnomon and shadow. */
export function buildObserverScene(scene: THREE.Scene): ObserverScene {
  scene.add(new THREE.AmbientLight(0xbcd7e8, 1.8));
  const light = new THREE.DirectionalLight(0xffe0a1, 2.4);
  light.position.set(1.8, 1.3, 2.2);
  scene.add(light);
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(1.28, 80),
    new THREE.MeshPhongMaterial({ color: 0x173b58, transparent: true, opacity: 0.94, side: THREE.DoubleSide }),
  );
  scene.add(floor);
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(1, 36, 18, 0, TAU, 0, Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x4e87a7, transparent: true, opacity: 0.045, wireframe: false, side: THREE.DoubleSide, depthWrite: false }),
  );
  dome.rotation.x = Math.PI / 2;
  scene.add(dome);

  // Horizontal coordinates: independent altitude circles, azimuth semicircles, and labels.
  const horizonLine = makeLine(circle(1), 0x9bddb3, 0.84);
  const altitudeLines = new THREE.Group();
  for (const altitude of [30, 60]) {
    altitudeLines.add(makeLine(circle(Math.cos(degrees(altitude)), Math.sin(degrees(altitude))), 0x71bd91, 0.4));
  }
  const azimuthLines = new THREE.Group();
  const belowGrid = new THREE.Group();
  for (let azimuth = 0; azimuth < 360; azimuth += 30) {
    if (azimuth % 90 === 0) continue;
    azimuthLines.add(makeLine(horizonArc(1, azimuth), 0x62ad83, 0.34));
    belowGrid.add(makeLine(belowHorizonArc(1, azimuth), 0x62ad83, 0.2, true));
  }
  for (const altitude of [-30, -60]) {
    belowGrid.add(makeLine(circle(Math.cos(degrees(altitude)), Math.sin(degrees(altitude)), 120), 0x71bd91, 0.24, true));
  }
  const meridianCircle = new THREE.Group();
  meridianCircle.add(makeLine(horizonArc(1, 0), 0xa3dfb8, 0.82), makeLine(horizonArc(1, 180), 0xa3dfb8, 0.82));
  const primeVertical = new THREE.Group();
  primeVertical.add(makeLine(horizonArc(1, 90), 0x8ed3a8, 0.76), makeLine(horizonArc(1, 270), 0x8ed3a8, 0.76));
  const zenithAxis = makeLine([new THREE.Vector3(0, 0, -0.16), new THREE.Vector3(0, 0, 1.18)], 0xb5e5c6, 0.78);
  scene.add(horizonLine, altitudeLines, azimuthLines, belowGrid, meridianCircle, primeVertical, zenithAxis);

  const compassLabels = new THREE.Group();
  const altitudeLabels = new THREE.Group();
  const azimuthLabels = new THREE.Group();
  compassRose.forEach(([azimuth, name]) => {
    const label = textSprite(name, "#d4f3df", 0.1);
    label.position.set(1.12 * Math.sin(degrees(azimuth)), 1.12 * Math.cos(degrees(azimuth)), 0.018);
    label.userData.points = azimuth % 90 === 0 ? 4 : azimuth % 45 === 0 ? 8 : 16;
    compassLabels.add(label);
  });
  const zenith = textSprite("天頂", "#ffffff", 0.12);
  zenith.position.set(0, 0, 1.12);
  const nadir = textSprite("天底", "#d4f3df", 0.11);
  nadir.position.set(0, 0, -1.1);
  for (let altitude = 15; altitude <= 75; altitude += 15) {
    const label = textSprite(`${altitude}°`, "#a9e2bd", 0.085);
    label.position.set(
      1.04 * Math.cos(degrees(altitude)) * Math.sin(degrees(118)),
      1.04 * Math.cos(degrees(altitude)) * Math.cos(degrees(118)),
      1.04 * Math.sin(degrees(altitude)),
    );
    label.userData.interval = altitude % 30 === 0 ? 30 : 15;
    altitudeLabels.add(label);
  }
  for (let azimuth = 0; azimuth < 360; azimuth += 15) {
    const label = textSprite(`${azimuth}°`, "#98d9af", 0.072);
    label.position.set(1.03 * Math.sin(degrees(azimuth)), 1.03 * Math.cos(degrees(azimuth)), 0.13);
    label.userData.interval = labelInterval(azimuth);
    azimuthLabels.add(label);
  }
  const timeLabels = new THREE.Group();
  const seasonalPathLabels = new THREE.Group();
  scene.add(compassLabels, altitudeLabels, azimuthLabels, zenith, nadir, timeLabels, seasonalPathLabels);

  const observerDot = new THREE.Mesh(
    new THREE.CircleGeometry(0.0275, 24),
    new THREE.MeshBasicMaterial({ color: 0xff8f75, side: THREE.DoubleSide }),
  );
  observerDot.position.z = 0.008;
  const person = chibiPerson(0.3);
  scene.add(observerDot, person);

  const currentPath = new THREE.Group();
  const comparisonPaths = new THREE.Group();
  const shadowTraceGroup = new THREE.Group();
  let comparisonLineMaterials: LineMaterial[] = [];
  scene.add(currentPath, comparisonPaths, shadowTraceGroup);
  const sun = new THREE.Mesh(new THREE.SphereGeometry(0.058, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffd66f }));
  scene.add(sun);
  const sunDragProxy = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 12, 8),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  );
  scene.add(sunDragProxy);

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
  scene.add(shadowGroup);

  let lastCurrentPathKey = "";
  let lastSeasonPathKey = "";
  let lastTimeLabelKey = "";
  let lastShadowTraceKey = "";
  let onPathsRebuilt: (() => void) | null = null;

  return {
    currentPath,
    sunDragProxy,
    lineMaterials: () => comparisonLineMaterials,
    setPathsRebuiltHandler(handler) {
      onPathsRebuilt = handler;
    },
    exportParts: {
      dragProxies: [sunDragProxy],
      backdrop: [floor, dome],
      solid: [sun, sunDragProxy],
      shadowExportHidden: [
        altitudeLines,
        azimuthLines,
        belowGrid,
        meridianCircle,
        primeVertical,
        horizonLine,
        dome,
        currentPath,
        comparisonPaths,
        compassLabels,
        altitudeLabels,
        azimuthLabels,
        zenith,
        sun,
        observerDot,
        person,
      ],
      shadowGroup,
      shadowTraceGroup,
    },
    applyLabelDetail(distance, layers, appearance) {
      const minimum = distance > 4 ? 45 : distance > 2.8 ? 30 : 15;
      const adaptive = (group: THREE.Group, enabled: boolean) => {
        group.children.forEach((label) => { label.visible = enabled && label.userData.interval >= minimum; });
      };
      adaptive(altitudeLabels, Boolean(layers?.horizontalAltitudeLabels));
      adaptive(azimuthLabels, Boolean(layers?.horizontalAzimuthLabels));
      const timeMinimum = distance > 4 ? 6 : distance > 2.8 ? 4 : 2;
      timeLabels.children.forEach((label) => {
        label.visible = Boolean(layers?.timeLabels) && label.userData.interval >= timeMinimum;
      });
      compassLabels.children.forEach((label) => {
        label.visible = Boolean(layers?.compassLabels && label.userData.points <= (appearance?.compassPoints ?? 4));
      });
    },
    update(state, layers, appearance, frame, shadowTrace) {
      altitudeLines.visible = layers.horizontalAltitudeLines;
      azimuthLines.visible = layers.horizontalAzimuthLines;
      belowGrid.visible = layers.belowHorizon && (layers.horizontalAltitudeLines || layers.horizontalAzimuthLines);
      meridianCircle.visible = layers.meridianCircle;
      primeVertical.visible = layers.primeVertical;
      horizonLine.visible = layers.compassLabels || layers.horizontalAltitudeLines || layers.horizontalAzimuthLines;
      dome.visible = horizonLine.visible;
      floor.visible = layers.tangentPlane;
      zenith.visible = layers.compassLabels;
      nadir.visible = layers.nadir && layers.belowHorizon;
      zenithAxis.visible = layers.horizontalAzimuthLines;
      currentPath.visible = layers.currentPath;
      comparisonPaths.visible = layers.seasonalPaths;
      seasonalPathLabels.visible = layers.seasonalPaths && layers.seasonalPathLabels;
      observerDot.visible = layers.observer && appearance.localObserver === "dot";
      person.visible = layers.observer && appearance.localObserver === "person";
      shadowGroup.visible = appearance.localObserver === "gnomon" && (layers.observer || layers.shadow);
      gnomon.visible = layers.observer && appearance.localObserver === "gnomon";

      const { declination, hourAngle } = frame;

      const timeLabelKey = `${state.latitude}:${state.day.toFixed(2)}`;
      if (timeLabelKey !== lastTimeLabelKey) {
        lastTimeLabelKey = timeLabelKey;
        clearGroup(timeLabels);
        for (let time = 0; time < 24; time += 2) {
          const vector = sunHorizontal(state.latitude, declination, hourAngleForTime(time));
          const label = textSprite(formatTime(time), "#ffe2ad", 0.072);
          label.position.copy(vector).multiplyScalar(1.06);
          label.userData.interval = time % 6 === 0 ? 6 : 2;
          timeLabels.add(label);
        }
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
        clearGroup(seasonalPathLabels);
        comparisonLineMaterials = [];
        if (layers.seasonalPaths) {
          seasonalDeclinations.forEach((season) => {
            pathSegments(
              comparisonPaths,
              state.latitude,
              season.declination,
              0xffffff,
              false,
              layers.belowHorizon,
              true,
              comparisonLineMaterials,
            );
            const label = textSprite(season.label, "#ffffff", 0.09);
            label.position.copy(sunHorizontal(state.latitude, season.declination, 0)).multiplyScalar(1.09);
            seasonalPathLabels.add(label);
          });
        }
        onPathsRebuilt?.();
      }

      const vector = sunHorizontal(state.latitude, declination, hourAngle);
      light.position.copy(vector).multiplyScalar(3.2);
      sun.position.set(vector.x, vector.y, vector.z);
      sunDragProxy.position.copy(sun.position);
      const sunMaterial = sun.material as THREE.MeshBasicMaterial;
      sunMaterial.opacity = vector.z >= 0 ? 1 : 0.25;
      sunMaterial.transparent = true;

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

      const traceKey = `${state.latitude}:${state.day.toFixed(2)}:${shadowTrace.enabled}:${shadowTrace.samples.map((sample) => sample.time.toFixed(2)).join(",")}`;
      if (traceKey !== lastShadowTraceKey) {
        lastShadowTraceKey = traceKey;
        clearGroup(shadowTraceGroup);
        if (shadowTrace.enabled) {
          shadowTrace.samples.forEach((sample) => {
            const sampleVector = sunHorizontal(state.latitude, solarDeclination(sample.day), hourAngleForTime(sample.time));
            const sampleCast = shadowForUnitGnomon(sampleVector);
            if (!sampleCast) return;
            const tip = new THREE.Vector3(sampleCast.x * rodHeight, sampleCast.y * rodHeight, 0.009);
            shadowTraceGroup.add(makeLine([new THREE.Vector3(), tip], 0xd8e4e6, 0.86));
            const label = textSprite(formatTime(sample.time), "#e3eff0", 0.065);
            label.position.copy(tip).multiplyScalar(1.08);
            label.position.z = 0.02;
            label.userData.shadowTime = true;
            shadowTraceGroup.add(label);
          });
        }
      }
      shadowTraceGroup.visible = shadowTrace.enabled;
    },
  };
}
