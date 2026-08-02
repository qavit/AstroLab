import * as THREE from "three";

/** Pointer position in normalized device coordinates for raycasting against a canvas. */
export function pointerNdc(event: PointerEvent, element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  return new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  );
}

export type PointerDragHandlers = {
  /** Return true to begin a drag. The pointer is then captured until it is released. */
  onDown: (event: PointerEvent) => boolean;
  onMove: (event: PointerEvent) => void;
  onEnd?: () => void;
};

/**
 * Wires up a press-drag-release gesture with pointer capture, so the drag keeps tracking
 * even when the pointer leaves the canvas. Returns a function that removes every listener.
 */
export function attachPointerDrag(element: HTMLElement, handlers: PointerDragHandlers) {
  let dragging = false;

  const down = (event: PointerEvent) => {
    if (!handlers.onDown(event)) return;
    dragging = true;
    element.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent) => {
    if (dragging) handlers.onMove(event);
  };
  const end = () => {
    if (!dragging) return;
    dragging = false;
    handlers.onEnd?.();
  };

  element.addEventListener("pointerdown", down);
  element.addEventListener("pointermove", move);
  element.addEventListener("pointerup", end);
  element.addEventListener("pointercancel", end);

  return () => {
    element.removeEventListener("pointerdown", down);
    element.removeEventListener("pointermove", move);
    element.removeEventListener("pointerup", end);
    element.removeEventListener("pointercancel", end);
  };
}
