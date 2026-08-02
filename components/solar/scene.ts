import * as THREE from "three";
import { createRenderLoop, createViewport } from "@/lib/render/viewport";
import { attachPointerDrag, pointerNdc } from "@/lib/render/interaction";
import { composite, hideObjects, recolorForPrint, toLineArt } from "@/lib/render/export";
import { degrees, radians, solarDeclination, sunHorizontal, TAU } from "@/lib/science/solar";
import {
  initialSolarState,
  type AppearanceState,
  type ExportMode,
  type ExportTarget,
  type LayerState,
  type ShadowTrace,
  type SolarLabState,
} from "@/models/solar";
import { buildGeocentricScene } from "./geocentricScene";
import { buildObserverScene, type ObserverScene } from "./observerScene";
import { solarFrame } from "./frame";

export type SolarSceneApi = {
  update: (state: SolarLabState, layers: LayerState, appearance: AppearanceState, shadowTrace: ShadowTrace) => void;
  reset: () => void;
  capture: (target: ExportTarget, mode: ExportMode, lineWidth: number, includeShadowTimes: boolean) => string;
  dispose: () => void;
};

/**
 * Binds the geocentric and observer scenes to their viewports and keeps them on one clock:
 * both are driven from a single `SolarFrame` per update, and direct manipulation in either
 * view reports back through `onStateChange` rather than mutating anything locally.
 */
export function setupScenes(
  globalHost: HTMLDivElement,
  localHost: HTMLDivElement,
  onStateChange: (patch: Partial<SolarLabState>) => void,
): SolarSceneApi {
  const globalView = createViewport({
    host: globalHost,
    position: [4.6, 3.15, 4.6],
    preserveDrawingBuffer: true,
  });
  const geocentric = buildGeocentricScene(globalView.scene);

  // The viewport reads the observer scene's line materials, and the observer scene builds into
  // the viewport's scene, so the viewport is given a getter that resolves once both exist.
  let built: ObserverScene | null = null;
  const localView = createViewport({
    host: localHost,
    position: [2.65, 2.15, 2.4],
    target: [0, 0, 0.42],
    preserveDrawingBuffer: true,
    lineMaterials: () => built?.lineMaterials() ?? [],
  });
  const observer = buildObserverScene(localView.scene);
  built = observer;
  observer.setPathsRebuiltHandler(() => localView.syncLineMaterials());

  let activeLayers: LayerState | null = null;
  let activeAppearance: AppearanceState | null = null;
  let activeState: SolarLabState = { ...initialSolarState };
  let globalDrag: "observer" | "sun" | null = null;
  let localDrag: "sun" | "path" | null = null;
  let pathDragStart = { y: 0, day: initialSolarState.day };
  const globalRaycaster = new THREE.Raycaster();
  const localRaycaster = new THREE.Raycaster();
  localRaycaster.params.Line!.threshold = 0.065;

  const detachGlobalDrag = attachPointerDrag(globalView.canvas, {
    onDown: (event) => {
      if (!activeAppearance?.directManipulation) return false;
      globalRaycaster.setFromCamera(pointerNdc(event, globalView.canvas), globalView.camera);
      if (globalRaycaster.intersectObject(geocentric.observerDragProxy, false).length) globalDrag = "observer";
      else if (globalRaycaster.intersectObject(geocentric.sunDragProxy, false).length) globalDrag = "sun";
      return Boolean(globalDrag);
    },
    onMove: (event) => {
      if (!globalDrag) return;
      globalRaycaster.setFromCamera(pointerNdc(event, globalView.canvas), globalView.camera);
      if (globalDrag === "observer") {
        const hit = globalRaycaster.ray.intersectSphere(new THREE.Sphere(new THREE.Vector3(), 1), new THREE.Vector3());
        if (hit) onStateChange({ latitude: Math.max(-90, Math.min(90, radians(Math.asin(hit.z / hit.length())))) });
        return;
      }
      // Dragging the sun means dragging it along the ecliptic, which sets the date.
      const tilt = degrees(23.44);
      const plane = new THREE.Plane(new THREE.Vector3(0, -Math.sin(tilt), Math.cos(tilt)), 0);
      const hit = globalRaycaster.ray.intersectPlane(plane, new THREE.Vector3());
      if (!hit) return;
      hit.applyAxisAngle(new THREE.Vector3(1, 0, 0), -tilt);
      const longitude = (Math.atan2(hit.y, hit.x) + TAU) % TAU;
      onStateChange({ day: ((longitude / TAU) * 365 + 80 - 1) % 365 + 1 });
    },
    onEnd: () => { globalDrag = null; },
  });

  const detachLocalDrag = attachPointerDrag(localView.canvas, {
    onDown: (event) => {
      if (!activeAppearance?.directManipulation) return false;
      localRaycaster.setFromCamera(pointerNdc(event, localView.canvas), localView.camera);
      if (localRaycaster.intersectObject(observer.sunDragProxy, false).length) localDrag = "sun";
      else if (localRaycaster.intersectObject(observer.currentPath, true).length) {
        localDrag = "path";
        pathDragStart = { y: event.clientY, day: activeState.day };
      }
      return Boolean(localDrag);
    },
    onMove: (event) => {
      if (!localDrag) return;
      if (localDrag === "path") {
        // Dragging the day's path vertically scrubs through the year.
        const rect = localView.canvas.getBoundingClientRect();
        const day = ((pathDragStart.day - ((event.clientY - pathDragStart.y) / rect.height) * 365 - 1) % 365 + 365) % 365 + 1;
        onStateChange({ day });
        return;
      }
      localRaycaster.setFromCamera(pointerNdc(event, localView.canvas), localView.camera);
      const hit = localRaycaster.ray.intersectSphere(new THREE.Sphere(new THREE.Vector3(), 1), new THREE.Vector3());
      if (!hit) return;
      hit.normalize();
      // The sun is constrained to the day's path, so snap to the closest hour angle on it.
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
    },
    onEnd: () => { localDrag = null; },
  });

  const stopLoop = createRenderLoop(() => {
    geocentric.applyLabelDetail(globalView.cameraDistance(), activeLayers, activeAppearance);
    observer.applyLabelDetail(localView.cameraDistance(), activeLayers, activeAppearance);
    globalView.tick();
    localView.tick();
  });

  return {
    update(state, layers, appearance, shadowTrace) {
      activeLayers = layers;
      activeAppearance = appearance;
      activeState = state;
      globalView.controls.enabled = !appearance.directManipulation;
      localView.controls.enabled = !appearance.directManipulation;
      globalView.canvas.style.cursor = appearance.directManipulation ? "grab" : "move";
      localView.canvas.style.cursor = appearance.directManipulation ? "grab" : "move";

      const frame = solarFrame(state);
      geocentric.update(state, layers, appearance, frame);
      observer.update(state, layers, appearance, frame, shadowTrace);
    },
    reset() {
      globalView.resetCamera();
      localView.resetCamera();
    },
    capture(target, mode, lineWidth, includeShadowTimes) {
      const view = target === "global" ? globalView : localView;
      const parts = target === "global" ? geocentric.exportParts : observer.exportParts;
      const { scene, renderer } = view;
      const restores: Array<() => void> = [];
      const originalBackground = scene.background;
      const originalAlpha = renderer.getClearAlpha();
      const originalColor = renderer.getClearColor(new THREE.Color()).getHex();

      restores.push(hideObjects([...geocentric.exportParts.dragProxies, ...observer.exportParts.dragProxies]));

      if (target === "shadow") {
        const { shadowExportHidden, shadowGroup, shadowTraceGroup } = observer.exportParts;
        restores.push(hideObjects(shadowExportHidden));
        const shadowGroupVisible = shadowGroup.visible;
        shadowGroup.visible = true;
        restores.push(() => { shadowGroup.visible = shadowGroupVisible; });
        if (!includeShadowTimes) {
          restores.push(hideObjects(shadowTraceGroup.children.filter((object) => object.userData.shadowTime)));
        }
      }

      if (mode === "line") {
        scene.background = new THREE.Color(0xffffff);
        renderer.setClearColor(0xffffff, 1);
        // The earth becomes the opaque white sheet the diagram sits on, so grid lines on its far
        // side stay hidden instead of showing through. It is exempt from the ink pass below.
        let printEarthMaterial: THREE.MeshBasicMaterial | null = null;
        if (target === "global") {
          const earth = geocentric.exportParts.earth;
          const originalEarthMaterial = earth.material;
          printEarthMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
          earth.material = printEarthMaterial;
          restores.push(() => {
            earth.material = originalEarthMaterial;
            printEarthMaterial?.dispose();
          });
        }
        const backdrop = new Set(parts.backdrop);
        const solid = new Set(parts.solid);
        restores.push(recolorForPrint(scene, (object, material) => {
          if (material === printEarthMaterial) {
            material.opacity = 1;
            return;
          }
          if (material.color) material.color.set(0x111111);
          if (backdrop.has(object)) material.opacity = 0;
          // The sun stays solid in every export mode, including black-and-white line art.
          else if (solid.has(object)) material.opacity = 1;
          else material.opacity = Math.max(material.opacity, 0.48);
        }));
      }

      view.render();
      const { canvas, context } = composite(view.canvas, mode === "line" ? "#ffffff" : "#061b2b", mode === "grayscale");
      if (mode === "line") toLineArt(canvas, context, lineWidth);

      for (const restore of restores.reverse()) restore();
      scene.background = originalBackground;
      renderer.setClearColor(originalColor, originalAlpha);
      view.render();
      return canvas.toDataURL("image/png");
    },
    dispose() {
      stopLoop();
      detachGlobalDrag();
      detachLocalDrag();
      globalView.dispose();
      localView.dispose();
    },
  };
}
