import type { CanvasElement } from "../../canvas/model/elementTypes";
import type { CanvasViewport } from "../../canvas/model/viewportTypes";

export type PdfImportQuality = "light" | "standard" | "high" | "ultra" | "custom";

export interface NoteMeta {
  schemaVersion: number;
  id: string;
  subjectId: string;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  thumbnail?: string;
}

export interface NoteData {
  schemaVersion: number;
  id: string;
  subjectId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  canvas: {
    type: "infinite";
    viewport: CanvasViewport;
    grid: { mode: "free" | "assisted"; snapStep: number; gridSize: number; visible: boolean };
    elements: CanvasElement[];
  };
}

export interface CreateSubjectInput {
  name: string;
}

export interface CreateNoteInput {
  subjectId: string;
  title: string;
}

export interface WritePngAssetInput {
  subjectId: string;
  noteId: string;
  bytes: Uint8Array;
  fileName?: string;
}

export interface DeleteAssetInput {
  subjectId: string;
  noteId: string;
  path: string;
}

export interface GenerateThumbnailInput {
  subjectId: string;
  noteId: string;
}

export interface AssetRef {
  path: string;
}
