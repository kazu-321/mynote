import type { CanvasViewport, Point } from "../model/viewportTypes";

export function screenToWorld(screenPoint: Point, viewport: CanvasViewport): Point {
  return {
    x: (screenPoint.x - viewport.x) / viewport.scale,
    y: (screenPoint.y - viewport.y) / viewport.scale,
  };
}

export function worldToScreen(worldPoint: Point, viewport: CanvasViewport): Point {
  return {
    x: worldPoint.x * viewport.scale + viewport.x,
    y: worldPoint.y * viewport.scale + viewport.y,
  };
}

export function snapToStep(value: number, step: number) {
  if (!Number.isFinite(step) || step <= 0) return value;
  return Math.round(value / step) * step;
}
