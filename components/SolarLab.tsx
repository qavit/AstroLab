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
  { label: "夏至", declination: degrees(23.44), color: 0xf0f0ec },
  { label: "春／秋分", declination: 0, color: 0xaeb5b5 },
  { label: "冬至", declination: degrees(-23.44), color: 0x747d7e },
];

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
  globalScene.add(new THREE.AmbientLight(0xffffff, 1.7));
  const light = new THREE.DirectionalLight(0xffffff, 2.5);
  light.position.set(5, 7, 4);
  globalScene.add(light);

  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(1, 64, 32),
    new THREE.MeshPhongMaterial({ color: 0x596164, emissive: 0x101415, shininess: 24 }),
  );
  globalScene.add(earth);

  // Equatorial coordinates on the celestial sphere: declination parallels and RA hour circles.
  const equatorialGrid = new THREE.Group();
  for (let declination = -60; declination <= 60; declination += 30) {
    const radius = 3 * Math.cos(degrees(declination));
    const z = 3 * Math.sin(degrees(declination));
    equatorialGrid.add(makeLine(circle(radius, z), 0xb9c0c0, declination === 0 ? 0.58 : 0.22));
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
    equatorialGrid.add(makeLine(points, 0xaeb5b5, 0.18));
  }
  globalScene.add(equatorialGrid);

  const axis = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.018, 6.6, 12),
    new THREE.MeshBasicMaterial({ color: 0xf4f4ef }),
  );
  axis.rotation.x = Math.PI / 2;
  globalScene.add(axis);
  const celestial = new THREE.Mesh(
    new THREE.SphereGeometry(3, 30, 16),
    new THREE.MeshBasicMaterial({ color: 0xc9cecd, transparent: true, opacity: 0.025, wireframe: true }),
  );
  globalScene.add(celestial);
  const celestialEquator = makeLine(circle(3), 0xf2f2ec, 0.78);
  globalScene.add(celestialEquator);
  const ecliptic = makeLine(circle(3), 0xaaa37b, 0.88);
  ecliptic.rotation.x = degrees(23.44);
  globalScene.add(ecliptic);
  const globalLabels = new THREE.Group();
  const equatorLabel = textSprite("赤緯 0°", "#e8e9e4");
  equatorLabel.position.set(2.25, 0, 0.18);
  const eclipticLabel = textSprite("黃道", "#c9c39c");
  eclipticLabel.position.set(-2.25, 0.65, 0.8);
  const northLabel = textSprite("北天極／地軸", "#eeeeea", 0.14);
  northLabel.position.set(0, 0, 3.42);
  const raLabel = textSprite("赤經", "#c7ccca", 0.13);
  raLabel.position.set(0.4, 2.55, 0.15);
  globalLabels.add(equatorLabel, eclipticLabel, northLabel, raLabel);
  globalScene.add(globalLabels);

  const sunMaterial = new THREE.MeshBasicMaterial({ color: 0xe0bd62 });
  const globalSun = new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 16), sunMaterial);
  globalScene.add(globalSun);
  const observer = new THREE.Group();
  const observerDot = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 10), new THREE.MeshBasicMaterial({ color: 0xd9d9d3 }));
  const tangent = new THREE.Mesh(
    new THREE.CircleGeometry(0.42, 48),
    new THREE.MeshBasicMaterial({ color: 0xd5d6d1, transparent: true, opacity: 0.2, side: THREE.DoubleSide }),
  );
  const observerDome = new THREE.Mesh(
    new THREE.SphereGeometry(0.42, 24, 12, 0, TAU, 0, Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xd7dbd9, transparent: true, opacity: 0.16, wireframe: true }),
  );
  observer.add(observerDot, tangent, observerDome);
  globalScene.add(observer);

  const localScene = new THREE.Scene();
  const localCamera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
  localCamera.position.set(2.65, 2.15, 2.4);
  localCamera.up.set(0, 0, 1);
  const localRenderer = makeRenderer(localHost);
  const localControls = new OrbitControls(localCamera, localRenderer.domElement);
  localControls.enableDamping = true;
  localControls.target.set(0, 0, 0.42);
  localScene.add(new THREE.AmbientLight(0xffffff, 2));
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(1.28, 80),
    new THREE.MeshPhongMaterial({ color: 0x34393a, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
  );
  localScene.add(floor);
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(1, 36, 18, 0, TAU, 0, Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xc8ccca, transparent: true, opacity: 0.025, wireframe: true }),
  );
  localScene.add(dome);

  // Horizontal coordinates: altitude circles and azimuth great semicircles.
  const horizontalGrid = new THREE.Group();
  horizontalGrid.add(makeLine(circle(1), 0xf0f0eb, 0.7));
  for (const altitude of [30, 60]) {
    horizontalGrid.add(makeLine(circle(Math.cos(degrees(altitude)), Math.sin(degrees(altitude))), 0xbcc1bf, 0.26));
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
    horizontalGrid.add(makeLine(points, 0xaeb4b2, 0.2));
  }
  const zenithAxis = makeLine(
    [new THREE.Vector3(0, 0, -0.16), new THREE.Vector3(0, 0, 1.18)],
    0xf1f1ed,
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
  const altitude30 = textSprite("高度 30°", "#c9cecc", 0.1);
  altitude30.position.set(0.86, 0, 0.53);
  const altitude60 = textSprite("高度 60°", "#c9cecc", 0.1);
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
  const gnomon = makeLine([new THREE.Vector3(), new THREE.Vector3(0, 0, rodHeight)], 0xf3f3ee, 1);
  const shadow = makeLine([new THREE.Vector3(), new THREE.Vector3()], 0x050606, 1);
  const ray = makeLine([new THREE.Vector3(0, 0, rodHeight), new THREE.Vector3()], 0xbdbdb4, 0.48, true);
  shadowGroup.add(gnomon, shadow, ray);
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

  return {
    update(state, layers) {
      celestial.visible = layers.celestialSphere;
      equatorialGrid.visible = layers.equatorialGrid;
      celestialEquator.visible = layers.equatorialGrid;
      ecliptic.visible = layers.ecliptic;
      observer.visible = layers.observer;
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
      globalSun.position
        .set(3 * Math.cos(lambda), 3 * Math.sin(lambda), 0)
        .applyAxisAngle(new THREE.Vector3(1, 0, 0), degrees(23.44));
      const phi = degrees(state.latitude);
      const normal = new THREE.Vector3(Math.cos(phi), 0, Math.sin(phi));
      observer.position.copy(normal.clone().multiplyScalar(1.01));
      observer.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);

      clearGroup(currentPath);
      if (layers.currentPath) {
        pathSegments(currentPath, state.latitude, declination, 0xf3f3ee, false, layers.belowHorizon);
      }
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

      const vector = sunHorizontal(state.latitude, declination, degrees(15 * (state.time - 12)));
      localSun.position.set(vector.x, vector.y, vector.z);
      (localSun.material as THREE.MeshBasicMaterial).opacity = vector.z >= 0 ? 1 : 0.25;
      (localSun.material as THREE.MeshBasicMaterial).transparent = true;
      const cast = shadowForUnitGnomon(vector);
      shadow.visible = ray.visible = Boolean(cast) && layers.shadow;
      if (cast) {
        const tip = new THREE.Vector3(cast.x * rodHeight, cast.y * rodHeight, 0);
        shadow.geometry.setFromPoints([new THREE.Vector3(), tip]);
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
  const [playing, setPlaying] = useState(false);
  const [layers, setLayers] = useState<LayerState>({
    celestialSphere: true,
    equatorialGrid: true,
    ecliptic: true,
    observer: true,
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
      setState((current) => ({ ...current, time: (current.time + delta * 2.2) % 24 }));
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
          <div className="legend globe-legend"><i className="light" />赤經／赤緯<i className="ecliptic-line" />黃道<i className="sun" />太陽<i className="observer" />觀察者</div>
          <div className="interaction-hint">以地軸旋轉 · 拖曳／縮放</div>
        </article>

        <div className="right-column">
          <article className="viewport-card local-card">
            <div className="card-label"><span>02</span><div><strong>觀察者模型</strong><small>{formatLatitude(state.latitude)}的天空</small></div></div>
            <div className="canvas-host" ref={localRef} />
            <div className="season-key"><span><i className="summer" />夏至</span><span><i className="equinox" />春／秋分</span><span><i className="winter" />冬至</span></div>
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
        <label><span>緯度 <b>{formatLatitude(state.latitude)}</b></span><input type="range" min="-90" max="90" step="0.5" value={state.latitude} onChange={(event) => setNumber("latitude", event.target.value)} /><div className="range-ends"><small>南極</small><small>赤道</small><small>北極</small></div></label>
        <label><span>日期 <b>{dateFromDay(state.day)}</b></span><input type="range" min="1" max="365" value={state.day} onChange={(event) => setNumber("day", event.target.value)} /><div className="range-ends"><small>1 月</small><small>6 月</small><small>12 月</small></div></label>
        <label><span>地方太陽時 <b>{formatTime(state.time)}</b></span><input type="range" min="0" max="24" step="0.05" value={state.time} onChange={(event) => setNumber("time", event.target.value)} /><div className="range-ends"><small>00</small><small>12</small><small>24</small></div></label>
        <div className="play-actions"><button className={playing ? "active" : ""} onClick={() => setPlaying((value) => !value)}>{playing ? "暫停" : "▶ 播放一天"}</button><button onClick={() => setState((current) => ({ ...current, time: 12 }))}>跳到正午</button></div>
      </section>

      <footer className="lab-footer"><span>ASTROLAB / INTERACTIVE SCIENCE MODELS</span><span>教學近似模型 · 赤緯採週期近似式</span></footer>
    </main>
  );
}
