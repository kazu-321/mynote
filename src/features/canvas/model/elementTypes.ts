import type { Point } from "./viewportTypes";

export type CanvasElementType = "text" | "image" | "freehand" | "line" | "rect" | "ellipse";

export type TextFormat = "plain" | "markdown" | "tex" | "markdown-tex";

export interface CanvasElementBase {
  id: string;
  type: CanvasElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  locked?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TextCanvasElement extends CanvasElementBase {
  type: "text";
  content: string;
  format: TextFormat;
  style: {
    fontSize: number;
    color: string;
    backgroundColor: string;
    padding: number;
    fontFamily?: string;
    borderColor?: string;
    borderWidth?: number;
  };
}

export interface ImageCanvasElement extends CanvasElementBase {
  type: "image";
  src: string;
  sourceType: "image" | "pdf-page";
  originalFileName?: string;
  pageNumber?: number;
  importInfo?: {
    importedAt: string;
    pdfScale?: number;
    transparentBackgroundApplied?: boolean;
    perspectiveTransformApplied?: boolean;
  };
}

export interface FreehandCanvasElement extends CanvasElementBase {
  type: "freehand";
  points: Point[];
  stroke: string;
  strokeWidth: number;
}

export interface LineCanvasElement extends CanvasElementBase {
  type: "line";
  start: Point;
  end: Point;
  stroke: string;
  strokeWidth: number;
}

export interface RectCanvasElement extends CanvasElementBase {
  type: "rect";
  fill: string;
  stroke?: string;
  strokeWidth?: number;
}

export interface EllipseCanvasElement extends CanvasElementBase {
  type: "ellipse";
  fill: string;
  stroke?: string;
  strokeWidth?: number;
}

export type CanvasElement =
  | TextCanvasElement
  | ImageCanvasElement
  | FreehandCanvasElement
  | LineCanvasElement
  | RectCanvasElement
  | EllipseCanvasElement;
