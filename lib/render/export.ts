import * as THREE from "three";

/** A material whose colour can be overridden for print. Sprites and lines both qualify. */
export type PrintableMaterial = THREE.Material & { color?: THREE.Color };

/** Hides objects for the duration of a capture. Returns a function that restores visibility. */
export function hideObjects(objects: Iterable<THREE.Object3D>) {
  const snapshots = new Map<THREE.Object3D, boolean>();
  for (const object of objects) {
    if (snapshots.has(object)) continue;
    snapshots.set(object, object.visible);
    object.visible = false;
  }
  return () => snapshots.forEach((visible, object) => { object.visible = visible; });
}

/**
 * Applies a print styling pass to every material below `root`, remembering each material's
 * colour and opacity first. Which objects get which treatment stays with the model, because
 * only the model knows which of its objects are structural and which are backdrop.
 * Returns a function that restores the original appearance.
 */
export function recolorForPrint(
  root: THREE.Object3D,
  apply: (object: THREE.Object3D, material: PrintableMaterial) => void,
) {
  const snapshots: Array<{ material: PrintableMaterial; color?: number; opacity: number; transparent: boolean }> = [];
  root.traverse((object) => {
    const renderable = object as THREE.Mesh | THREE.Line | THREE.Sprite;
    if (!renderable.material) return;
    const materials = Array.isArray(renderable.material) ? renderable.material : [renderable.material];
    materials.forEach((entry) => {
      const material = entry as PrintableMaterial;
      snapshots.push({
        material,
        color: material.color?.getHex(),
        opacity: material.opacity,
        transparent: material.transparent,
      });
      apply(object, material);
    });
  });
  return () => snapshots.forEach(({ material, color, opacity, transparent }) => {
    if (color !== undefined && material.color) material.color.set(color);
    material.opacity = opacity;
    material.transparent = transparent;
  });
}

/** Copies a rendered canvas onto an opaque background, optionally desaturating it. */
export function composite(source: HTMLCanvasElement, background: string, grayscale = false) {
  const output = document.createElement("canvas");
  output.width = source.width;
  output.height = source.height;
  const context = output.getContext("2d")!;
  context.fillStyle = background;
  context.fillRect(0, 0, output.width, output.height);
  if (grayscale) context.filter = "grayscale(1)";
  context.drawImage(source, 0, 0);
  context.filter = "none";
  return { canvas: output, context };
}

/**
 * Thresholds a composited canvas into black-on-white line art and draws a border, so the
 * result stays legible after photocopying. `lineWidth` thickens strokes by dilation.
 */
export function toLineArt(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D, lineWidth: number) {
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const binary = context.createImageData(canvas.width, canvas.height);
  binary.data.fill(255);
  const radius = Math.max(0, Math.round(lineWidth) - 1);
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const index = (y * canvas.width + x) * 4;
      const luminance = image.data[index] * 0.2126 + image.data[index + 1] * 0.7152 + image.data[index + 2] * 0.0722;
      if (luminance > 205) continue;
      for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
        for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
          const targetX = x + offsetX;
          const targetY = y + offsetY;
          if (targetX < 0 || targetY < 0 || targetX >= canvas.width || targetY >= canvas.height) continue;
          const targetIndex = (targetY * canvas.width + targetX) * 4;
          binary.data[targetIndex] = 17;
          binary.data[targetIndex + 1] = 17;
          binary.data[targetIndex + 2] = 17;
          binary.data[targetIndex + 3] = 255;
        }
      }
    }
  }
  context.putImageData(binary, 0, 0);
  const inset = Math.max(8, Math.round(canvas.width * 0.012));
  context.strokeStyle = "#111111";
  context.lineWidth = Math.max(2, Math.round(canvas.width * 0.003));
  context.strokeRect(inset, inset, canvas.width - inset * 2, canvas.height - inset * 2);
}

export type DirectoryHandle = {
  name: string;
  getFileHandle: (name: string, options: { create: boolean }) => Promise<{
    createWritable: () => Promise<{ write: (blob: Blob) => Promise<void>; close: () => Promise<void> }>;
  }>;
};

export type DirectorySelection =
  | { supported: false }
  /** `handle` is null when the user dismissed the picker without choosing. */
  | { supported: true; handle: DirectoryHandle | null };

export async function pickDirectory(): Promise<DirectorySelection> {
  const picker = (window as typeof window & { showDirectoryPicker?: () => Promise<DirectoryHandle> }).showDirectoryPicker;
  if (!picker) return { supported: false };
  try {
    return { supported: true, handle: await picker() };
  } catch {
    return { supported: true, handle: null };
  }
}

/** Writes to the chosen directory when one is available, otherwise falls back to a download. */
export async function saveDataUrl(dataUrl: string, filename: string, directory: DirectoryHandle | null) {
  if (directory) {
    const blob = await fetch(dataUrl).then((response) => response.blob());
    const file = await directory.getFileHandle(filename, { create: true });
    const writable = await file.createWritable();
    await writable.write(blob);
    await writable.close();
    return;
  }
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  link.click();
}
