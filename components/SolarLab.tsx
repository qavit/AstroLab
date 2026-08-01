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
type SceneApi = {
  update: (state: LabState, compare: boolean) => void;
  reset: () => void;
  exportLocal: (filename: string) => void;
  dispose: () => void;
};

const seasons = [
  { label: "夏至", declination: degrees(23.44), color: 0xffb454 },
  { label: "春／秋分", declination: 0, color: 0xf3f7fb },
  { label: "冬至", declination: degrees(-23.44), color: 0x69b8ff },
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

function pathSegments(group: THREE.Group, latitude: number, declination: number, color: number, faded = false) {
  let points: THREE.Vector3[] = [];
  let above: boolean | null = null;
  const flush = () => {
    if (points.length > 1 && above !== null) group.add(makeLine(points, color, above ? (faded ? 0.64 : 1) : 0.22, !above));
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
  const globalRenderer = makeRenderer(globalHost);
  const globalControls = new OrbitControls(globalCamera, globalRenderer.domElement);
  globalControls.enableDamping = true;
  globalScene.add(new THREE.AmbientLight(0xffffff, 1.7));
  const light = new THREE.DirectionalLight(0xffffff, 2.5);
  light.position.set(5, 7, 4);
  globalScene.add(light);

  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(1, 64, 32),
    new THREE.MeshPhongMaterial({ color: 0x1d5f94, emissive: 0x08233a, shininess: 40 }),
  );
  globalScene.add(earth);
  const globeGrid = new THREE.Group();
  for (let latitude = -60; latitude <= 60; latitude += 30) {
    const radius = Math.cos(degrees(latitude));
    globeGrid.add(makeLine(circle(radius, Math.sin(degrees(latitude))), 0x9edaff, 0.32));
  }
  for (let longitude = 0; longitude < 180; longitude += 30) {
    const points = Array.from({ length: 181 }, (_, index) => {
      const phi = degrees(-90 + index);
      return new THREE.Vector3(
        Math.cos(phi) * Math.cos(degrees(longitude)),
        Math.cos(phi) * Math.sin(degrees(longitude)),
        Math.sin(phi),
      );
    });
    globeGrid.add(makeLine(points, 0x9edaff, 0.24));
  }
  globalScene.add(globeGrid);

  const axis = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.018, 6.6, 12),
    new THREE.MeshBasicMaterial({ color: 0xdcefff }),
  );
  axis.rotation.x = Math.PI / 2;
  globalScene.add(axis);
  const celestial = new THREE.Mesh(
    new THREE.SphereGeometry(3, 30, 16),
    new THREE.MeshBasicMaterial({ color: 0x7ecbff, transparent: true, opacity: 0.04, wireframe: true }),
  );
  globalScene.add(celestial);
  globalScene.add(makeLine(circle(3), 0x57d7e8, 0.9));
  const ecliptic = makeLine(circle(3), 0xb8dc78, 0.9);
  ecliptic.rotation.x = degrees(23.44);
  globalScene.add(ecliptic);
  const equatorLabel = textSprite("天球赤道", "#57d7e8");
  equatorLabel.position.set(2.25, 0, 0.18);
  globalScene.add(equatorLabel);
  const eclipticLabel = textSprite("黃道", "#c8e28f");
  eclipticLabel.position.set(-2.25, 0.65, 0.8);
  globalScene.add(eclipticLabel);
  const northLabel = textSprite("北天極", "#eaf8ff", 0.14);
  northLabel.position.set(0, 0, 3.42);
  globalScene.add(northLabel);

  const sunMaterial = new THREE.MeshBasicMaterial({ color: 0xffb454 });
  const globalSun = new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 16), sunMaterial);
  globalScene.add(globalSun);
  const observer = new THREE.Group();
  const observerDot = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 10), new THREE.MeshBasicMaterial({ color: 0xff6485 }));
  const tangent = new THREE.Mesh(
    new THREE.CircleGeometry(0.42, 48),
    new THREE.MeshBasicMaterial({ color: 0xffdca7, transparent: true, opacity: 0.28, side: THREE.DoubleSide }),
  );
  const observerDome = new THREE.Mesh(
    new THREE.SphereGeometry(0.42, 24, 12, 0, TAU, 0, Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x8ee4ff, transparent: true, opacity: 0.18, wireframe: true }),
  );
  observer.add(observerDot, tangent, observerDome);
  globalScene.add(observer);

  const localScene = new THREE.Scene();
  const localCamera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
  localCamera.position.set(2.65, 2.15, 2.4);
  const localRenderer = makeRenderer(localHost);
  const localControls = new OrbitControls(localCamera, localRenderer.domElement);
  localControls.enableDamping = true;
  localControls.target.set(0, 0, 0.42);
  localScene.add(new THREE.AmbientLight(0xffffff, 2));
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(1.28, 80),
    new THREE.MeshPhongMaterial({ color: 0x183a4d, transparent: true, opacity: 0.88, side: THREE.DoubleSide }),
  );
  localScene.add(floor, makeLine(circle(1), 0xcce9f5, 0.75));
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(1, 36, 18, 0, TAU, 0, Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x66c8ef, transparent: true, opacity: 0.12, wireframe: true }),
  );
  localScene.add(dome);
  for (const altitude of [30, 60]) {
    localScene.add(makeLine(circle(Math.cos(degrees(altitude)), Math.sin(degrees(altitude))), 0x98d8ee, 0.18));
  }
  const compass: Record<string, [number, number, number]> = {
    東: [1.1, 0, 0], 西: [-1.1, 0, 0], 北: [0, 1.1, 0], 南: [0, -1.1, 0],
  };
  Object.entries(compass).forEach(([label, position]) => {
    const sprite = textSprite(label, "#ffffff", 0.12);
    sprite.position.set(...position);
    localScene.add(sprite);
  });
  const zenith = textSprite("天頂", "#ffffff", 0.12);
  zenith.position.set(0, 0, 1.12);
  localScene.add(zenith);

  const currentPath = new THREE.Group();
  const comparisonPaths = new THREE.Group();
  localScene.add(currentPath, comparisonPaths);
  const localSun = new THREE.Mesh(new THREE.SphereGeometry(0.058, 20, 14), sunMaterial.clone());
  localScene.add(localSun);
  const rodHeight = 0.28;
  localScene.add(makeLine([new THREE.Vector3(), new THREE.Vector3(0, 0, rodHeight)], 0x07131b, 1));
  const shadow = makeLine([new THREE.Vector3(), new THREE.Vector3()], 0x02080c, 1);
  const ray = makeLine([new THREE.Vector3(0, 0, rodHeight), new THREE.Vector3()], 0xffdd9a, 0.5, true);
  localScene.add(shadow, ray);

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
    update(state, compare) {
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
      pathSegments(currentPath, state.latitude, declination, 0xffb454);
      clearGroup(comparisonPaths);
      if (compare) seasons.forEach((season) => pathSegments(comparisonPaths, state.latitude, season.declination, season.color, true));

      const vector = sunHorizontal(state.latitude, declination, degrees(15 * (state.time - 12)));
      localSun.position.set(vector.x, vector.y, vector.z);
      (localSun.material as THREE.MeshBasicMaterial).opacity = vector.z >= 0 ? 1 : 0.25;
      (localSun.material as THREE.MeshBasicMaterial).transparent = true;
      const cast = shadowForUnitGnomon(vector);
      shadow.visible = ray.visible = Boolean(cast);
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
    exportLocal(filename) {
      localRenderer.render(localScene, localCamera);
      const link = document.createElement("a");
      link.href = localRenderer.domElement.toDataURL("image/png");
      link.download = filename;
      link.click();
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
  const [compare, setCompare] = useState(true);

  useEffect(() => {
    if (!globalRef.current || !localRef.current) return;
    sceneRef.current = setupScenes(globalRef.current, localRef.current);
    return () => sceneRef.current?.dispose();
  }, []);

  useEffect(() => sceneRef.current?.update(state, compare), [state, compare]);

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
          <button className={compare ? "active" : ""} onClick={() => setCompare((value) => !value)}>{compare ? "隱藏季節軌跡" : "顯示季節軌跡"}</button>
          <button onClick={() => sceneRef.current?.reset()}>重設視角</button>
          <button className="primary" onClick={() => sceneRef.current?.exportLocal(`solar-path-${state.latitude}-${state.day}.png`)}>匯出教材圖</button>
        </div>
      </header>

      <section className="stage-grid">
        <article className="viewport-card global-card">
          <div className="card-label"><span>01</span><div><strong>地心模型</strong><small>地球、天球赤道與黃道</small></div></div>
          <div className="canvas-host" ref={globalRef} />
          <div className="legend globe-legend"><i className="cyan" />天球赤道<i className="green" />黃道<i className="sun" />太陽<i className="observer" />觀察者</div>
          <div className="interaction-hint">拖曳旋轉 · 滾輪縮放</div>
        </article>

        <div className="right-column">
          <article className="viewport-card local-card">
            <div className="card-label"><span>02</span><div><strong>觀察者模型</strong><small>{formatLatitude(state.latitude)}的天空</small></div></div>
            <div className="canvas-host" ref={localRef} />
            <div className="season-key"><span><i className="summer" />夏至</span><span><i className="equinox" />春／秋分</span><span><i className="winter" />冬至</span></div>
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
