export type GridMode = "free" | "assisted";

export interface CanvasGrid {
  mode: GridMode;
  snapStep: number;
  gridSize: number;
}
