import type { Domain, Vec2 } from "../../lib/science/electrostatics/types.ts";

export interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

export interface CameraTransform {
  readonly width: number;
  readonly height: number;
  readonly scale_px_per_m: number;
  readonly originX_px: number;
  readonly originY_px: number;
  readonly worldLeft_px: number;
  readonly worldTop_px: number;
  readonly worldWidth_px: number;
  readonly worldHeight_px: number;
}

/** Fit the complete physical domain without changing it; spare pixels become letterbox space. */
export function fitCamera(domain: Domain, size: ViewportSize, padding_px = 12): CameraTransform {
  const usableWidth = Math.max(1, size.width - 2 * padding_px);
  const usableHeight = Math.max(1, size.height - 2 * padding_px);
  const domainWidth = domain.xmax - domain.xmin;
  const domainHeight = domain.ymax - domain.ymin;
  const scale = Math.min(usableWidth / domainWidth, usableHeight / domainHeight);
  const worldWidth = domainWidth * scale;
  const worldHeight = domainHeight * scale;
  const left = (size.width - worldWidth) / 2;
  const top = (size.height - worldHeight) / 2;
  return {
    width: size.width,
    height: size.height,
    scale_px_per_m: scale,
    originX_px: left - domain.xmin * scale,
    originY_px: top + domain.ymax * scale,
    worldLeft_px: left,
    worldTop_px: top,
    worldWidth_px: worldWidth,
    worldHeight_px: worldHeight,
  };
}

export function worldToScreen(point: Vec2, camera: CameraTransform): Vec2 {
  return {
    x: camera.originX_px + point.x * camera.scale_px_per_m,
    y: camera.originY_px - point.y * camera.scale_px_per_m,
  };
}

export function screenToWorld(point: Vec2, camera: CameraTransform): Vec2 {
  return {
    x: (point.x - camera.originX_px) / camera.scale_px_per_m,
    y: (camera.originY_px - point.y) / camera.scale_px_per_m,
  };
}

export function pointInDomain(point: Vec2, domain: Domain): boolean {
  return point.x >= domain.xmin && point.x <= domain.xmax && point.y >= domain.ymin && point.y <= domain.ymax;
}
