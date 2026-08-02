import * as THREE from "three";
import { circle, clearGroup, makeLine, textSprite } from "@/lib/render/primitives";
import { degrees, formatTime, TAU } from "@/lib/science/solar";
import {
  compassRose,
  hourAngleForTime,
  solarTerms,
  type AppearanceState,
  type LayerState,
  type SolarLabState,
} from "@/models/solar";
import { belowHorizonArc, chibiPerson, horizonArc, labelInterval } from "./geometry";
import type { SolarFrame } from "./frame";

export type GeocentricScene = {
  update: (state: SolarLabState, layers: LayerState, appearance: AppearanceState, frame: SolarFrame) => void;
  /** Thins grid labels as the camera pulls back, so dense coordinate grids stay readable. */
  applyLabelDetail: (distance: number, layers: LayerState | null, appearance: AppearanceState | null) => void;
  /** Objects the PNG export needs to treat specially. */
  exportParts: {
    dragProxies: THREE.Object3D[];
    /**
     * Translucent surfaces, dropped to zero opacity in black-and-white line art. They read as
     * flat black fills once everything is inked, so the lines bounding them carry the meaning
     * instead: the horizon circle for the tangent plane and the observer's dome.
     */
    backdrop: THREE.Object3D[];
    /** Kept fully opaque in every export mode. */
    solid: THREE.Object3D[];
    earth: THREE.Mesh;
  };
  /** True when a pointer press should start dragging the observer rather than the sun. */
  observerDragProxy: THREE.Object3D;
  sunDragProxy: THREE.Object3D;
};

/** The earth at the centre, the celestial sphere around it, and the observer standing on the surface. */
export function buildGeocentricScene(scene: THREE.Scene): GeocentricScene {
  scene.add(new THREE.AmbientLight(0x8aa6bf, 0.34));
  const light = new THREE.DirectionalLight(0xfff4d6, 3.4);
  light.position.set(5, 7, 4);
  scene.add(light);

  const earthRotationGroup = new THREE.Group();
  const earthMaterial = new THREE.MeshPhongMaterial({ color: 0x245a83, emissive: 0x020a12, shininess: 18 });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), earthMaterial);
  earthRotationGroup.add(earth);
  scene.add(earthRotationGroup);

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
  scene.add(observerLatitude);
  const timeLabels = new THREE.Group();
  scene.add(timeLabels);
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
  scene.add(subsolarPoint);
  const subsolarLabel = textSprite("日下點", "#ffe39a", 0.11, true);
  scene.add(subsolarLabel);

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
  scene.add(rightAscensionLines, declinationLines);

  const axis = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.018, 6.6, 12),
    new THREE.MeshBasicMaterial({ color: 0xc4ddef }),
  );
  axis.rotation.x = Math.PI / 2;
  scene.add(axis);
  const celestial = new THREE.Mesh(
    new THREE.SphereGeometry(3, 30, 16),
    new THREE.MeshBasicMaterial({ color: 0x4c7794, transparent: true, opacity: 0.035, wireframe: false, side: THREE.DoubleSide, depthWrite: false }),
  );
  scene.add(celestial);
  const celestialEquator = makeLine(circle(3), 0xe08282, 0.94);
  scene.add(celestialEquator);
  const ecliptic = makeLine(circle(3), 0xf2c86b, 0.96);
  ecliptic.rotation.x = degrees(23.44);
  scene.add(ecliptic);

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
    const points = Array.from({ length: 181 }, (_, index) => eclipticPoint(longitude, -90 + index));
    eclipticLongitudeLines.add(makeLine(points, 0xcaa94e, 0.18));
  }
  scene.add(eclipticLongitudeLines, eclipticLatitudeLines);

  const rightAscensionLabels = new THREE.Group();
  const declinationLabels = new THREE.Group();
  const eclipticLongitudeLabels = new THREE.Group();
  const eclipticLatitudeLabels = new THREE.Group();
  const solarTermLabels = new THREE.Group();
  const seasonalMarkers = new THREE.Group();

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
  ([[284, "近日點"], [104, "遠日點"]] as const).forEach(([longitude, name]) => {
    const marker = new THREE.Mesh(
      new THREE.CircleGeometry(0.014, 14),
      new THREE.MeshBasicMaterial({ color: 0xf0bd52, side: THREE.DoubleSide }),
    );
    marker.position.copy(eclipticPoint(longitude, 0, 3.018));
    marker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), marker.position.clone().normalize());
    const label = textSprite(name, "#f5cf73", 0.105, true);
    label.position.copy(eclipticPoint(longitude, 0, 3.2));
    apsides.add(marker, label);
  });
  scene.add(
    rightAscensionLabels,
    declinationLabels,
    eclipticLongitudeLabels,
    eclipticLatitudeLabels,
    solarTermLabels,
    seasonalMarkers,
    apsides,
  );
  const eclipticLabel = textSprite("黃道", "#f5d685", 0.16, true);
  eclipticLabel.position.set(-2.25, 0.65, 0.8);
  const northLabel = textSprite("北天極／地軸", "#cbe0ef", 0.14, true);
  northLabel.position.set(0, 0, 3.42);
  scene.add(eclipticLabel, northLabel);

  const sun = new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffd66f }));
  scene.add(sun);
  const sunDragProxy = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 12, 8),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  );
  scene.add(sunDragProxy);

  const observer = new THREE.Group();
  const observerVisuals = new THREE.Group();
  const observerDot = new THREE.Mesh(
    new THREE.CircleGeometry(0.0275, 24),
    new THREE.MeshBasicMaterial({ color: 0xff8f75, side: THREE.DoubleSide }),
  );
  observerDot.position.z = 0.006;
  const person = chibiPerson(0.17);
  const gnomonGroup = new THREE.Group();
  const rod = makeLine([new THREE.Vector3(), new THREE.Vector3(0, 0, 0.16)], 0xf4f8fa, 1);
  const shadow = makeLine([new THREE.Vector3(), new THREE.Vector3()], 0x02070b, 1);
  gnomonGroup.add(rod, shadow);
  const observerDragProxy = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 12, 8),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  );
  const tangent = new THREE.Mesh(
    new THREE.CircleGeometry(0.42, 48),
    new THREE.MeshBasicMaterial({ color: 0x8ec9db, transparent: true, opacity: 0.24, side: THREE.DoubleSide }),
  );
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.42, 24, 12, 0, TAU, 0, Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x4c87a3, transparent: true, opacity: 0.09, wireframe: false, side: THREE.DoubleSide, depthWrite: false }),
  );
  dome.rotation.x = Math.PI / 2;
  const horizonLine = makeLine(circle(0.42), 0x8dd0a7, 0.82);
  const altitudeLines = new THREE.Group();
  for (const altitude of [30, 60]) {
    altitudeLines.add(makeLine(circle(0.42 * Math.cos(degrees(altitude)), 0.42 * Math.sin(degrees(altitude)), 120), 0x71bd91, 0.42));
  }
  const azimuthLines = new THREE.Group();
  const belowGrid = new THREE.Group();
  for (let azimuth = 0; azimuth < 360; azimuth += 30) {
    if (azimuth % 90 === 0) continue;
    azimuthLines.add(makeLine(horizonArc(0.42, azimuth, 60), 0x62ad83, 0.34));
    belowGrid.add(makeLine(belowHorizonArc(0.42, azimuth, 60), 0x62ad83, 0.18, true));
  }
  for (const altitude of [-30, -60]) {
    belowGrid.add(makeLine(circle(0.42 * Math.cos(degrees(altitude)), 0.42 * Math.sin(degrees(altitude)), 120), 0x71bd91, 0.22, true));
  }
  const meridianCircle = new THREE.Group();
  meridianCircle.add(makeLine(horizonArc(0.42, 0, 60), 0xa3dfb8, 0.78), makeLine(horizonArc(0.42, 180, 60), 0xa3dfb8, 0.78));
  const primeVertical = new THREE.Group();
  primeVertical.add(makeLine(horizonArc(0.42, 90, 60), 0x8ed3a8, 0.72), makeLine(horizonArc(0.42, 270, 60), 0x8ed3a8, 0.72));
  const compassLabels = new THREE.Group();
  const altitudeLabels = new THREE.Group();
  const azimuthLabels = new THREE.Group();
  compassRose.forEach(([azimuth, name]) => {
    const label = textSprite(name, "#b9ebcc", 0.052, true);
    label.position.set(0.48 * Math.sin(degrees(azimuth)), 0.48 * Math.cos(degrees(azimuth)), 0.012);
    label.userData.points = azimuth % 90 === 0 ? 4 : azimuth % 45 === 0 ? 8 : 16;
    compassLabels.add(label);
  });
  for (let altitude = 15; altitude <= 75; altitude += 15) {
    const label = textSprite(`${altitude}°`, "#9dddb6", 0.045, true);
    label.position.set(
      0.44 * Math.cos(degrees(altitude)) * Math.sin(degrees(118)),
      0.44 * Math.cos(degrees(altitude)) * Math.cos(degrees(118)),
      0.44 * Math.sin(degrees(altitude)),
    );
    label.userData.interval = altitude % 30 === 0 ? 30 : 15;
    altitudeLabels.add(label);
  }
  for (let azimuth = 0; azimuth < 360; azimuth += 15) {
    const label = textSprite(`${azimuth}°`, "#8fd0a8", 0.04, true);
    label.position.set(0.44 * Math.sin(degrees(azimuth)), 0.44 * Math.cos(degrees(azimuth)), 0.055);
    label.userData.interval = labelInterval(azimuth);
    azimuthLabels.add(label);
  }
  observerVisuals.add(observerDot, person, gnomonGroup, observerDragProxy);
  observer.add(
    observerVisuals,
    tangent,
    dome,
    horizonLine,
    altitudeLines,
    azimuthLines,
    belowGrid,
    meridianCircle,
    primeVertical,
    compassLabels,
    altitudeLabels,
    azimuthLabels,
  );
  scene.add(observer);

  let lastObserverLatitude = Number.NaN;
  let lastTimeLabelKey = "";

  return {
    observerDragProxy,
    sunDragProxy,
    exportParts: {
      dragProxies: [sunDragProxy, observerDragProxy],
      backdrop: [celestial, dome, tangent],
      solid: [sun, sunDragProxy],
      earth,
    },
    applyLabelDetail(distance, layers, appearance) {
      const minimum = distance > 7 ? 90 : distance > 5 ? 30 : 15;
      const adaptive = (group: THREE.Group, enabled: boolean) => {
        group.children.forEach((label) => { label.visible = enabled && label.userData.interval >= minimum; });
      };
      adaptive(rightAscensionLabels, Boolean(layers?.rightAscensionLabels));
      adaptive(declinationLabels, Boolean(layers?.declinationLabels));
      adaptive(eclipticLongitudeLabels, Boolean(layers?.eclipticLongitudeLabels));
      adaptive(eclipticLatitudeLabels, Boolean(layers?.eclipticLatitudeLabels));
      adaptive(altitudeLabels, Boolean(layers?.horizontalAltitudeLabels));
      adaptive(azimuthLabels, Boolean(layers?.horizontalAzimuthLabels));
      const timeMinimum = distance > 7 ? 6 : distance > 5 ? 4 : 2;
      timeLabels.children.forEach((label) => {
        label.visible = Boolean(layers?.timeLabels) && label.userData.interval >= timeMinimum;
      });
      solarTermLabels.children.forEach((label) => {
        label.visible = Boolean(layers?.solarTermLabels && label.userData.interval >= minimum);
      });
      compassLabels.children.forEach((label) => {
        label.visible = Boolean(layers?.compassLabels && label.userData.points <= (appearance?.compassPoints ?? 4));
      });
    },
    update(state, layers, appearance, frame) {
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
      altitudeLines.visible = layers.horizontalAltitudeLines;
      azimuthLines.visible = layers.horizontalAzimuthLines;
      belowGrid.visible = layers.belowHorizon && (layers.horizontalAltitudeLines || layers.horizontalAzimuthLines);
      meridianCircle.visible = layers.meridianCircle;
      primeVertical.visible = layers.primeVertical;
      horizonLine.visible = layers.compassLabels || layers.horizontalAltitudeLines || layers.horizontalAzimuthLines;
      dome.visible = horizonLine.visible;
      northLabel.visible = layers.celestialAxis;
      eclipticLabel.visible = layers.ecliptic;
      observerDot.visible = layers.observer && appearance.globalObserver === "dot";
      person.visible = layers.observer && appearance.globalObserver === "person";
      gnomonGroup.visible = layers.observer && appearance.globalObserver === "gnomon";
      earthMaterial.transparent = !appearance.earthOpaque;
      earthMaterial.opacity = appearance.earthOpaque ? 1 : 0.3;
      earthMaterial.depthWrite = appearance.earthOpaque;

      const { phi, eclipticSun, sunRightAscension, observerLongitude } = frame;
      sun.position.copy(eclipticSun);
      sunDragProxy.position.copy(eclipticSun);
      light.position.copy(eclipticSun).normalize().multiplyScalar(8);
      const subsolarNormal = eclipticSun.clone().normalize();
      subsolarPoint.position.copy(subsolarNormal).multiplyScalar(1.045);
      subsolarPoint.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), subsolarNormal);
      subsolarLabel.position.copy(subsolarNormal).multiplyScalar(1.18);

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
      const sunLocal = eclipticSun.clone().normalize().applyQuaternion(observer.quaternion.clone().invert());
      shadow.visible = layers.shadow && appearance.globalObserver === "gnomon" && sunLocal.z > 0.002;
      if (sunLocal.z > 0.002) {
        const scale = 0.16 / sunLocal.z;
        shadow.geometry.setFromPoints([
          new THREE.Vector3(),
          new THREE.Vector3(-sunLocal.x * scale, -sunLocal.y * scale, 0),
        ]);
      }

      if (lastObserverLatitude !== state.latitude) {
        lastObserverLatitude = state.latitude;
        clearGroup(observerLatitude);
        observerLatitude.add(makeLine(circle(1.018 * Math.cos(phi), 1.018 * Math.sin(phi)), 0xff8f75, 0.98));
      }

      const timeLabelKey = `${state.latitude}:${state.day.toFixed(2)}`;
      if (timeLabelKey !== lastTimeLabelKey) {
        lastTimeLabelKey = timeLabelKey;
        clearGroup(timeLabels);
        for (let time = 0; time < 24; time += 2) {
          const longitude = sunRightAscension + hourAngleForTime(time);
          const label = textSprite(formatTime(time), "#ffd9a1", 0.072, true);
          label.position.set(
            1.065 * Math.cos(phi) * Math.cos(longitude),
            1.065 * Math.cos(phi) * Math.sin(longitude),
            1.065 * Math.sin(phi),
          );
          label.userData.interval = time % 6 === 0 ? 6 : 2;
          timeLabels.add(label);
        }
      }
    },
  };
}
