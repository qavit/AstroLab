import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";

export type ViewportOptions = {
  host: HTMLDivElement;
  /** Initial camera placement, in model units. */
  position: readonly [number, number, number];
  /** Initial orbit target. Defaults to the origin. */
  target?: readonly [number, number, number];
  /** Which axis points up on screen. AstroLab models are z-up. */
  up?: readonly [number, number, number];
  fov?: number;
  near?: number;
  far?: number;
  /** Required when the viewport is captured to PNG after the frame has been presented. */
  preserveDrawingBuffer?: boolean;
  /**
   * Screen-space thick lines (`makeWideLine`) whose materials must know the viewport size to
   * hold their intended width. Read fresh on every resize, so rebuilt line sets stay correct.
   */
  lineMaterials?: () => LineMaterial[];
};

/**
 * One host element, scene, camera, renderer, and orbit control set, kept in sync with the
 * host's size. Owns no model knowledge — every model builds its own scene contents.
 */
export type Viewport = {
  readonly host: HTMLDivElement;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;
  readonly canvas: HTMLCanvasElement;
  /** Distance from the camera to its orbit target, for distance-adaptive labelling. */
  cameraDistance: () => number;
  /**
   * Pushes the current viewport size into the tracked line materials. Call after rebuilding
   * them; resizing does it automatically.
   */
  syncLineMaterials: () => void;
  /** Advances the damped controls and draws one frame. */
  tick: () => void;
  /** Draws one frame without advancing the controls. */
  render: () => void;
  /** Returns the camera to the position and target it was created with. */
  resetCamera: () => void;
  dispose: () => void;
};

export function createViewport(options: ViewportOptions): Viewport {
  const {
    host,
    position,
    target = [0, 0, 0],
    up = [0, 0, 1],
    fov = 40,
    near = 0.01,
    far = 100,
    preserveDrawingBuffer = false,
    lineMaterials,
  } = options;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(fov, 1, near, far);
  camera.up.set(up[0], up[1], up[2]);
  camera.position.set(position[0], position[1], position[2]);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(target[0], target[1], target[2]);
  controls.update();

  // LineMaterial widths are expressed in the same units passed to setSize, i.e. CSS pixels.
  let size = { width: 0, height: 0 };
  const syncLineMaterials = () => {
    if (!size.width || !size.height) return;
    lineMaterials?.().forEach((material) => material.resolution.set(size.width, size.height));
  };
  const resize = () => {
    const width = host.clientWidth;
    const height = host.clientHeight;
    if (!width || !height) return;
    size = { width, height };
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    syncLineMaterials();
  };
  let resizeFrame = 0;
  const resizeObserver = new ResizeObserver(() => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(resize);
  });
  resizeObserver.observe(host);
  resize();

  return {
    host,
    scene,
    camera,
    renderer,
    controls,
    canvas: renderer.domElement,
    cameraDistance: () => camera.position.distanceTo(controls.target),
    syncLineMaterials,
    tick() {
      controls.update();
      renderer.render(scene, camera);
    },
    render() {
      renderer.render(scene, camera);
    },
    resetCamera() {
      camera.position.set(position[0], position[1], position[2]);
      controls.target.set(target[0], target[1], target[2]);
      controls.update();
    },
    dispose() {
      cancelAnimationFrame(resizeFrame);
      resizeObserver.disconnect();
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

/** Drives `step` immediately and then on every animation frame. Returns a function that stops the loop. */
export function createRenderLoop(step: () => void) {
  let frame = 0;
  const run = () => {
    frame = requestAnimationFrame(run);
    step();
  };
  run();
  return () => cancelAnimationFrame(frame);
}
