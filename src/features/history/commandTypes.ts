import type { CanvasElement } from "../canvas/model/elementTypes";
import type { CanvasGrid } from "../canvas/model/gridTypes";

export interface CanvasEditorState {
  elements: CanvasElement[];
  grid: CanvasGrid;
}

export interface CanvasCommand {
  label: string;
  redo(state: CanvasEditorState): CanvasEditorState;
  undo(state: CanvasEditorState): CanvasEditorState;
}

export function createSnapshotCanvasCommand(
  label: string,
  before: CanvasEditorState,
  after: CanvasEditorState,
): CanvasCommand {
  return {
    label,
    redo: () => structuredClone(after),
    undo: () => structuredClone(before),
  };
}
