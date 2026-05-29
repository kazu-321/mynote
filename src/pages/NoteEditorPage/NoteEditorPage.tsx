import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { appConfig } from "../../app/config";
import { createStorageAdapter } from "../../shared/storage/storageAdapter";
import type { SubjectData } from "../../features/notes/model/subjectTypes";
import type { NoteData, NoteMeta } from "../../features/notes/model/noteTypes";
import type { CanvasViewport, Point } from "../../features/canvas/model/viewportTypes";
import type { CanvasGrid } from "../../features/canvas/model/gridTypes";
import type {
  CanvasElement,
  EllipseCanvasElement,
  FreehandCanvasElement,
  ImageCanvasElement,
  LineCanvasElement,
  RectCanvasElement,
  TextCanvasElement,
} from "../../features/canvas/model/elementTypes";
import type { SelectionRect } from "../../features/canvas/model/selectionTypes";
import { screenToWorld, snapToStep } from "../../features/canvas/utils/coordinates";
import { RenderedText } from "../../features/canvas/components/RenderedText";
import { HistoryManager } from "../../features/history/historyManager";
import { IconButton } from "../../shared/components/IconButton";
import { Modal } from "../../shared/components/Modal";
import { clamp } from "../../shared/utils/clamp";
import { noteSchema } from "../../features/notes/model/noteSchemas";
import { importImageFile, type PerspectiveTransformOptions, type TransparentBackgroundOptions } from "../../features/importers/imageImporter";
import { importPdfPages, PDF_IMPORT_SCALES } from "../../features/importers/pdfImporter";
import { createSnapshotCanvasCommand, type CanvasEditorState } from "../../features/history/commandTypes";
import type { PdfImportQuality } from "../../features/notes/model/noteTypes";

type Interaction =
  | { kind: "pan"; startPointer: Point; startViewport: CanvasViewport }
  | { kind: "select"; startPointer: Point; currentPointer: Point }
  | { kind: "move"; startPointer: Point; startViewport: CanvasViewport; startPositions: Record<string, { x: number; y: number }> }
  | {
      kind: "resize";
      elementId: string;
      handle: ResizeHandle;
      preserveAspect: boolean;
      startPointer: Point;
      startViewport: CanvasViewport;
      startElement: CanvasElement;
      startBounds: Bounds;
    }
  | {
      kind: "draw";
      tool: Exclude<CanvasTool, "line">;
      startPointer: Point;
      currentPointer: Point;
      points: Point[];
      startedAt: number;
      preserveAspect: boolean;
    }
  | null;

type CanvasTool = "select" | "text" | "rect" | "ellipse" | "line" | "freehand";
type CanvasSetStateAction<T> = T | ((current: T) => T);

type ResizeHandle = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

type Bounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

type InspectorState = {
  elementId: string;
  anchor: Point;
} | null;

type ContextMenuState =
  | { kind: "canvas"; x: number; y: number }
  | { kind: "element"; x: number; y: number; elementId: string }
  | null;

type PointOption = { x: number; y: number };

type ImageImportDialogState = {
  file: File;
  previewUrl: string;
  imageSize: { width: number; height: number };
  transparentBackground: TransparentBackgroundOptions;
  perspective: PerspectiveTransformOptions;
};

type PdfImportDialogState = {
  file: File;
  quality: PdfImportQuality;
  customScale: number;
};

type TouchGesture =
  | { kind: "pan"; pointerId: number; startPointer: Point; startViewport: CanvasViewport }
  | {
      kind: "pinch";
      pointerIds: [number, number];
      startViewport: CanvasViewport;
      startDistance: number;
      startWorldCenter: Point;
    }
  | null;

const MIN_SAFE_ZOOM = 0.00001;
const MAX_SAFE_ZOOM = 10000;
const DEFAULT_TEXT_STYLE = {
  fontSize: 18,
  color: "#1f1a17",
  backgroundColor: "rgba(255,255,255,0.96)",
  padding: 12,
};
const DEFAULT_RECT_FILL = "#f7d7a6";
const DEFAULT_ELLIPSE_FILL = "#cfe8ff";
const DEFAULT_STROKE = "#2f5d62";
const DEFAULT_STROKE_WIDTH = 6;
const DEFAULT_FREEHAND_STROKE = "#1f1a17";
const DEFAULT_RECT_SIZE = { width: 250, height: 250 };
const DEFAULT_ELLIPSE_SIZE = { width: 250, height: 250 };

function nowIso() {
  return new Date().toISOString();
}

function createBaseElement(type: CanvasElement["type"], x: number, y: number, width: number, height: number) {
  const timestamp = nowIso();
  return {
    id: crypto.randomUUID(),
    type,
    x,
    y,
    width,
    height,
    rotation: 0,
    zIndex: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  } as const;
}

function elementBounds(element: CanvasElement) {
  if (element.type === "line") {
    const left = Math.min(element.start.x, element.end.x);
    const top = Math.min(element.start.y, element.end.y);
    const right = Math.max(element.start.x, element.end.x);
    const bottom = Math.max(element.start.y, element.end.y);
    return { left, top, right, bottom };
  }
  return { left: element.x, top: element.y, right: element.x + element.width, bottom: element.y + element.height };
}

function clampBounds(bounds: Bounds): Bounds {
  return {
    left: Math.min(bounds.left, bounds.right),
    top: Math.min(bounds.top, bounds.bottom),
    right: Math.max(bounds.left, bounds.right),
    bottom: Math.max(bounds.top, bounds.bottom),
  };
}

function boundsFromPointerAndAnchor(pointer: Point, anchor: Point): Bounds {
  return clampBounds({ left: anchor.x, top: anchor.y, right: pointer.x, bottom: pointer.y });
}

function resizeHandlePosition(bounds: Bounds, handle: ResizeHandle): Point {
  const midX = (bounds.left + bounds.right) / 2;
  const midY = (bounds.top + bounds.bottom) / 2;
  if (handle === "n") return { x: midX, y: bounds.top };
  if (handle === "ne") return { x: bounds.right, y: bounds.top };
  if (handle === "e") return { x: bounds.right, y: midY };
  if (handle === "se") return { x: bounds.right, y: bounds.bottom };
  if (handle === "s") return { x: midX, y: bounds.bottom };
  if (handle === "sw") return { x: bounds.left, y: bounds.bottom };
  if (handle === "w") return { x: bounds.left, y: midY };
  return { x: bounds.left, y: bounds.top };
}

function resizeElement(element: CanvasElement, nextBounds: Bounds): CanvasElement {
  const bounds = clampBounds(nextBounds);
  const width = Math.max(1, bounds.right - bounds.left);
  const height = Math.max(1, bounds.bottom - bounds.top);
  const updatedAt = nowIso();
  if (element.type === "line") {
    const startRatioX = (element.start.x - element.x) / Math.max(1, element.width);
    const startRatioY = (element.start.y - element.y) / Math.max(1, element.height);
    const endRatioX = (element.end.x - element.x) / Math.max(1, element.width);
    const endRatioY = (element.end.y - element.y) / Math.max(1, element.height);
    return {
      ...element,
      x: bounds.left,
      y: bounds.top,
      width,
      height,
      updatedAt,
      start: { x: bounds.left + startRatioX * width, y: bounds.top + startRatioY * height },
      end: { x: bounds.left + endRatioX * width, y: bounds.top + endRatioY * height },
    };
  }
  if (element.type === "freehand") {
    const startWidth = Math.max(1, element.width);
    const startHeight = Math.max(1, element.height);
    const nextPoints = element.points.map((point) => ({
      x: bounds.left + ((point.x - element.x) / startWidth) * width,
      y: bounds.top + ((point.y - element.y) / startHeight) * height,
    }));
    return { ...element, x: bounds.left, y: bounds.top, width, height, updatedAt, points: nextPoints };
  }
  return { ...element, x: bounds.left, y: bounds.top, width, height, updatedAt };
}

function buildResizeBounds(startBounds: Bounds, handle: ResizeHandle, current: Point, preserveAspect: boolean) {
  const aspect = Math.max(0.0001, (startBounds.right - startBounds.left) / Math.max(1, startBounds.bottom - startBounds.top));
  const anchor = {
    n: { x: (startBounds.left + startBounds.right) / 2, y: startBounds.bottom },
    ne: { x: startBounds.left, y: startBounds.bottom },
    e: { x: startBounds.left, y: (startBounds.top + startBounds.bottom) / 2 },
    se: { x: startBounds.left, y: startBounds.top },
    s: { x: (startBounds.left + startBounds.right) / 2, y: startBounds.top },
    sw: { x: startBounds.right, y: startBounds.top },
    w: { x: startBounds.right, y: (startBounds.top + startBounds.bottom) / 2 },
    nw: { x: startBounds.right, y: startBounds.bottom },
  }[handle];
  if (preserveAspect) {
    const baseWidth = Math.max(1, startBounds.right - startBounds.left);
    const baseHeight = Math.max(1, startBounds.bottom - startBounds.top);
    const rawWidth = Math.max(1, Math.abs(current.x - anchor.x));
    const rawHeight = Math.max(1, Math.abs(current.y - anchor.y));
    const scale = Math.max(rawWidth / baseWidth, rawHeight / baseHeight);
    const width = Math.max(1, baseWidth * scale);
    const height = Math.max(1, width / aspect);
    if (handle === "n") return { left: startBounds.left, top: anchor.y - height, right: startBounds.right, bottom: anchor.y };
    if (handle === "s") return { left: startBounds.left, top: anchor.y, right: startBounds.right, bottom: anchor.y + height };
    if (handle === "e") return { left: anchor.x, top: startBounds.top, right: anchor.x + width, bottom: startBounds.bottom };
    if (handle === "w") return { left: anchor.x - width, top: startBounds.top, right: anchor.x, bottom: startBounds.bottom };
    if (handle === "ne") return { left: anchor.x, top: anchor.y - height, right: anchor.x + width, bottom: anchor.y };
    if (handle === "se") return { left: anchor.x, top: anchor.y, right: anchor.x + width, bottom: anchor.y + height };
    if (handle === "sw") return { left: anchor.x - width, top: anchor.y, right: anchor.x, bottom: anchor.y + height };
    return { left: anchor.x - width, top: anchor.y - height, right: anchor.x, bottom: anchor.y };
  }
  if (handle === "n") return { left: startBounds.left, top: current.y, right: startBounds.right, bottom: startBounds.bottom };
  if (handle === "s") return { left: startBounds.left, top: startBounds.top, right: startBounds.right, bottom: current.y };
  if (handle === "e") return { left: startBounds.left, top: startBounds.top, right: current.x, bottom: startBounds.bottom };
  if (handle === "w") return { left: current.x, top: startBounds.top, right: startBounds.right, bottom: startBounds.bottom };
  if (handle === "ne") return { left: startBounds.left, top: current.y, right: current.x, bottom: startBounds.bottom };
  if (handle === "se") return { left: startBounds.left, top: startBounds.top, right: current.x, bottom: current.y };
  if (handle === "sw") return { left: current.x, top: startBounds.top, right: startBounds.right, bottom: current.y };
  return { left: current.x, top: current.y, right: startBounds.right, bottom: startBounds.bottom };
}

function normalizeRectFromPoints(start: Point, end: Point) {
  const left = Math.min(start.x, end.x);
  const top = Math.min(start.y, end.y);
  const width = Math.max(1, Math.abs(end.x - start.x));
  const height = Math.max(1, Math.abs(end.y - start.y));
  return { x: left, y: top, width, height };
}

function createTextElement(point: Point): TextCanvasElement {
  const width = 280;
  const height = 140;
  return {
    ...createBaseElement("text", point.x, point.y, width, height),
    type: "text",
    content: "テキスト",
    format: "markdown-tex",
    style: { ...DEFAULT_TEXT_STYLE },
  };
}

function createRectElement(start: Point, end: Point): RectCanvasElement {
  const rect = normalizeRectFromPoints(start, end);
  return {
    ...createBaseElement("rect", rect.x, rect.y, rect.width, rect.height),
    type: "rect",
    fill: DEFAULT_RECT_FILL,
    stroke: DEFAULT_STROKE,
    strokeWidth: 2,
  };
}

function createDefaultRectElement(centerPoint: Point): RectCanvasElement {
  const halfWidth = DEFAULT_RECT_SIZE.width / 2;
  const halfHeight = DEFAULT_RECT_SIZE.height / 2;
  return createRectElement(
    { x: centerPoint.x - halfWidth, y: centerPoint.y - halfHeight },
    { x: centerPoint.x + halfWidth, y: centerPoint.y + halfHeight },
  );
}

function createEllipseElement(start: Point, end: Point): EllipseCanvasElement {
  const rect = normalizeRectFromPoints(start, end);
  return {
    ...createBaseElement("ellipse", rect.x, rect.y, rect.width, rect.height),
    type: "ellipse",
    fill: DEFAULT_ELLIPSE_FILL,
    stroke: DEFAULT_STROKE,
    strokeWidth: 2,
  };
}

function createDefaultEllipseElement(centerPoint: Point): EllipseCanvasElement {
  const halfWidth = DEFAULT_ELLIPSE_SIZE.width / 2;
  const halfHeight = DEFAULT_ELLIPSE_SIZE.height / 2;
  return createEllipseElement(
    { x: centerPoint.x - halfWidth, y: centerPoint.y - halfHeight },
    { x: centerPoint.x + halfWidth, y: centerPoint.y + halfHeight },
  );
}

function createLineElement(start: Point, end: Point): LineCanvasElement {
  const rect = normalizeRectFromPoints(start, end);
  return {
    ...createBaseElement("line", rect.x, rect.y, rect.width, rect.height),
    type: "line",
    start,
    end,
    stroke: DEFAULT_STROKE,
    strokeWidth: DEFAULT_STROKE_WIDTH,
  };
}

function createFreehandElement(points: Point[]): FreehandCanvasElement {
  const left = Math.min(...points.map((point) => point.x));
  const top = Math.min(...points.map((point) => point.y));
  const right = Math.max(...points.map((point) => point.x));
  const bottom = Math.max(...points.map((point) => point.y));
  return {
    ...createBaseElement("freehand", left, top, Math.max(1, right - left), Math.max(1, bottom - top)),
    type: "freehand",
    points,
    stroke: DEFAULT_FREEHAND_STROKE,
    strokeWidth: 4,
  };
}

function resolveAssetUrl(subjectId: string, noteId: string, src: string) {
  return new URL(`data/notes/${subjectId}/${noteId}/${src}`, window.location.href).toString();
}

function lineViewBox(element: LineCanvasElement) {
  return {
    x1: element.start.x - element.x,
    y1: element.start.y - element.y,
    x2: element.end.x - element.x,
    y2: element.end.y - element.y,
  };
}

function freehandPoints(element: FreehandCanvasElement) {
  return element.points.map((point) => `${point.x - element.x},${point.y - element.y}`).join(" ");
}

function textBoxStyle(element: TextCanvasElement): CSSProperties {
  return {
    display: "block",
    boxSizing: "border-box",
    overflow: "hidden",
    color: element.style.color,
    backgroundColor: element.style.backgroundColor,
    fontSize: `${element.style.fontSize}px`,
    fontFamily: element.style.fontFamily,
    borderStyle: "solid",
    borderColor: element.style.borderColor ?? "transparent",
    borderWidth: `${element.style.borderWidth ?? 0}px`,
  };
}

function textContentStyle(element: TextCanvasElement): CSSProperties {
  return {
    width: "100%",
    height: "100%",
    boxSizing: "border-box",
    overflow: "hidden",
    padding: `${element.style.padding}px`,
    textAlign: "left",
  };
}

function elementSurfaceStyle(element: CanvasElement): CSSProperties {
  if (element.type === "text") {
    return {
      display: "block",
      padding: 0,
      backgroundColor: "transparent",
      border: "none",
      boxShadow: "none",
    };
  }
  if (element.type === "rect") {
    return {
      display: "block",
      padding: 0,
      backgroundColor: element.fill,
      borderStyle: "solid",
      borderColor: element.stroke ?? "transparent",
      borderWidth: `${element.strokeWidth ?? 0}px`,
      borderRadius: 14,
      boxShadow: "0 8px 24px rgba(30, 20, 10, 0.08)",
    };
  }
  if (element.type === "ellipse") {
    return {
      display: "block",
      padding: 0,
      backgroundColor: element.fill,
      borderStyle: "solid",
      borderColor: element.stroke ?? "transparent",
      borderWidth: `${element.strokeWidth ?? 0}px`,
      borderRadius: "999px",
      boxShadow: "0 8px 24px rgba(30, 20, 10, 0.08)",
    };
  }
  return {
    display: "block",
    padding: 0,
    backgroundColor: "transparent",
    borderColor: "transparent",
  };
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true'], [contenteditable='']"));
}

function constrainEndToSquare(start: Point, current: Point) {
  const dx = current.x - start.x;
  const dy = current.y - start.y;
  const size = Math.max(Math.abs(dx), Math.abs(dy));
  const x = start.x + (dx < 0 ? -size : size);
  const y = start.y + (dy < 0 ? -size : size);
  return { x, y };
}

function PropertyNumberField(props: {
  value: number;
  onCommit: (next: number) => void;
  min?: number;
  step?: number;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [text, setText] = useState(String(props.value));
  const lastCommittedRef = useRef(props.value);

  useEffect(() => {
    const active = document.activeElement === inputRef.current;
    lastCommittedRef.current = props.value;
    if (!active) setText(String(props.value));
  }, [props.value]);

  function commit(valueText: string) {
    if (valueText.trim() === "") {
      setText(String(lastCommittedRef.current));
      return;
    }
    const parsed = Number(valueText);
    if (Number.isFinite(parsed)) {
      lastCommittedRef.current = parsed;
      props.onCommit(parsed);
      setText(String(parsed));
    } else {
      setText(String(lastCommittedRef.current));
    }
  }

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="decimal"
      value={text}
      onChange={(event) => setText(event.target.value)}
      onBlur={() => commit(text)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        } else if (event.key === "Escape") {
          setText(String(props.value));
          event.currentTarget.blur();
        }
      }}
      aria-label="number input"
    />
  );
}

async function rasterizeFreehandStroke(points: Point[], stroke: string, strokeWidth: number) {
  if (points.length < 2) return null;
  const padding = Math.max(12, Math.ceil(strokeWidth * 2));
  const left = Math.min(...points.map((point) => point.x)) - padding;
  const top = Math.min(...points.map((point) => point.y)) - padding;
  const right = Math.max(...points.map((point) => point.x)) + padding;
  const bottom = Math.max(...points.map((point) => point.y)) + padding;
  const width = Math.max(1, Math.ceil(right - left));
  const height = Math.max(1, Math.ceil(bottom - top));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.clearRect(0, 0, width, height);
  context.strokeStyle = stroke;
  context.lineWidth = strokeWidth;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.beginPath();
  points.forEach((point, index) => {
    const x = point.x - left;
    const y = point.y - top;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.stroke();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((result) => resolve(result), "image/png"));
  if (!blob) return null;
  return { bytes: new Uint8Array(await blob.arrayBuffer()), width, height, left, top };
}

const DEMO_ELEMENTS: CanvasElement[] = [
  {
    id: "demo-text-1",
    type: "text",
    x: 80,
    y: 80,
    width: 280,
    height: 130,
    rotation: 0,
    zIndex: 1,
    createdAt: "2026-05-30T00:00:00.000Z",
    updatedAt: "2026-05-30T00:00:00.000Z",
    content: "ノート名をクリックして開いた canvas です。",
    format: "markdown-tex",
    style: { ...DEFAULT_TEXT_STYLE },
  },
  {
    id: "demo-rect-1",
    type: "rect",
    x: 420,
    y: 140,
    width: 240,
    height: 160,
    rotation: 0,
    zIndex: 2,
    createdAt: "2026-05-30T00:00:00.000Z",
    updatedAt: "2026-05-30T00:00:00.000Z",
    fill: DEFAULT_RECT_FILL,
    stroke: DEFAULT_STROKE,
    strokeWidth: 2,
  },
  {
    id: "demo-ellipse-1",
    type: "ellipse",
    x: 210,
    y: 340,
    width: 210,
    height: 140,
    rotation: 0,
    zIndex: 3,
    createdAt: "2026-05-30T00:00:00.000Z",
    updatedAt: "2026-05-30T00:00:00.000Z",
    fill: DEFAULT_ELLIPSE_FILL,
    stroke: DEFAULT_STROKE,
    strokeWidth: 2,
  },
];

function toCanvasElements(note: NoteData | null): CanvasElement[] {
  if (!note) return DEMO_ELEMENTS;
  const parsed = noteSchema.safeParse(note);
  const raw = parsed.success ? parsed.data.canvas.elements : note?.canvas.elements;
  if (!Array.isArray(raw)) return DEMO_ELEMENTS;
  const elements = raw.filter((value): value is CanvasElement => {
    if (!value || typeof value !== "object") return false;
    const element = value as Partial<CanvasElement>;
    return typeof element.id === "string" && typeof element.type === "string";
  });
  return elements;
}

function normalizeViewport(note: NoteData | null): CanvasViewport {
  return note?.canvas.viewport ?? { x: 0, y: 0, scale: 1 };
}

function normalizeGrid(note: NoteData | null): CanvasGrid {
  return note?.canvas.grid ?? { mode: "free", snapStep: 10, gridSize: 100, visible: false };
}

function rectsIntersect(a: SelectionRect, element: CanvasElement) {
  const left = Math.min(a.startX, a.endX);
  const right = Math.max(a.startX, a.endX);
  const top = Math.min(a.startY, a.endY);
  const bottom = Math.max(a.startY, a.endY);
  const bounds = elementBounds(element);
  return !(bounds.left > right || bounds.right < left || bounds.top > bottom || bounds.bottom < top);
}

function nextZIndex(elements: CanvasElement[]) {
  return (elements.reduce((max, element) => Math.max(max, element.zIndex), 0) || 0) + 1;
}

export function NoteEditorPage(props: { subjectId: string; noteId: string; onBack: () => void }) {
  const storage = useMemo(() => createStorageAdapter(appConfig.mode), []);
  const [subject, setSubject] = useState<SubjectData | null>(null);
  const [noteMeta, setNoteMeta] = useState<NoteMeta | null>(null);
  const [note, setNote] = useState<NoteData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [viewport, setViewport] = useState<CanvasViewport>({ x: 0, y: 0, scale: 1 });
  const [canvasState, setCanvasState] = useState<CanvasEditorState>({ elements: DEMO_ELEMENTS, grid: { mode: "free", snapStep: 10, gridSize: 100, visible: false } });
  const { elements, grid } = canvasState;
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [interaction, setInteraction] = useState<Interaction>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [tool, setTool] = useState<CanvasTool>("select");
  const [inspector, setInspector] = useState<InspectorState>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [imageImportDialog, setImageImportDialog] = useState<ImageImportDialogState | null>(null);
  const [pdfImportDialog, setPdfImportDialog] = useState<PdfImportDialogState | null>(null);
  const [spacePressed, setSpacePressed] = useState(false);
  const [shiftPressed, setShiftPressed] = useState(false);
  const [pendingLine, setPendingLine] = useState<{ start: Point; current: Point } | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef(viewport);
  const canvasStateRef = useRef(canvasState);
  const touchGestureRef = useRef<TouchGesture>(null);
  const touchPointersRef = useRef<Map<number, { point: Point; pointerType: string }>>(new Map());
  const lastElementPointerDownRef = useRef<{ elementId: string; at: number } | null>(null);
  const lastSavedRef = useRef<string | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const canvasHistoryRef = useRef(new HistoryManager());
  const imageFileInputRef = useRef<HTMLInputElement | null>(null);
  const pdfFileInputRef = useRef<HTMLInputElement | null>(null);
  const importAnchorRef = useRef<Point>({ x: 0, y: 0 });
  useEffect(() => {
    canvasStateRef.current = canvasState;
  }, [canvasState]);

  function commitCanvasState(next: CanvasEditorState) {
    canvasStateRef.current = next;
    setCanvasState(next);
  }

  function serializeCanvasState(state: CanvasEditorState) {
    return JSON.stringify(state);
  }

  function runCanvasCommand(command: ReturnType<typeof createSnapshotCanvasCommand>, options?: { resetHistory?: boolean }) {
    if (options?.resetHistory) {
      canvasHistoryRef.current.clear();
      commitCanvasState(command.redo(canvasStateRef.current));
      return;
    }
    const next = canvasHistoryRef.current.execute(command, canvasStateRef.current);
    if (next !== canvasStateRef.current) {
      commitCanvasState(next);
    }
  }

  function setElements(action: CanvasSetStateAction<CanvasElement[]>) {
    const current = canvasStateRef.current;
    const nextElements = typeof action === "function" ? action(current.elements) : action;
    runCanvasCommand(
      createSnapshotCanvasCommand("update elements", current, {
        ...current,
        elements: nextElements,
      }),
    );
  }

  function setGrid(action: CanvasSetStateAction<CanvasGrid>) {
    const current = canvasStateRef.current;
    const nextGrid = typeof action === "function" ? action(current.grid) : action;
    runCanvasCommand(
      createSnapshotCanvasCommand("update grid", current, {
        ...current,
        grid: nextGrid,
      }),
    );
  }

  function undoCanvasChange() {
    const next = canvasHistoryRef.current.undo(canvasStateRef.current);
    if (next === canvasStateRef.current) return;
    commitCanvasState(next);
  }

  function redoCanvasChange() {
    const next = canvasHistoryRef.current.redo(canvasStateRef.current);
    if (next === canvasStateRef.current) return;
    commitCanvasState(next);
  }

  function openImageImportPicker(anchor: Point) {
    importAnchorRef.current = anchor;
    imageFileInputRef.current?.click();
  }

  function openPdfImportPicker(anchor: Point) {
    importAnchorRef.current = anchor;
    pdfFileInputRef.current?.click();
  }

  async function prepareImageImport(file: File) {
    const previewUrl = URL.createObjectURL(file);
    const image = new Image();
    image.src = previewUrl;
    await image.decode();
    setImageImportDialog({
      file,
      previewUrl,
      imageSize: { width: image.naturalWidth, height: image.naturalHeight },
      transparentBackground: { enabled: false, mode: "none", tolerance: 12 },
      perspective: {
        enabled: false,
        points: {
          topLeft: { x: 0, y: 0 },
          topRight: { x: image.naturalWidth, y: 0 },
          bottomRight: { x: image.naturalWidth, y: image.naturalHeight },
          bottomLeft: { x: 0, y: image.naturalHeight },
        },
        outputWidth: image.naturalWidth,
        outputHeight: image.naturalHeight,
      },
    });
  }

  function preparePdfImport(file: File) {
    setPdfImportDialog({
      file,
      quality: "standard",
      customScale: 1,
    });
  }

  function closeImageImportDialog() {
    if (imageImportDialog?.previewUrl) URL.revokeObjectURL(imageImportDialog.previewUrl);
    setImageImportDialog(null);
  }

  function closePdfImportDialog() {
    setPdfImportDialog(null);
  }

  async function confirmImageImport() {
    if (!imageImportDialog) return;
    const result = await importImageFile(imageImportDialog.file, {
      transparentBackground: imageImportDialog.transparentBackground,
      perspective: imageImportDialog.perspective,
    });
    const asset = await storage.writePngAsset({
      subjectId: props.subjectId,
      noteId: props.noteId,
      bytes: result.bytes,
      fileName: `${imageImportDialog.file.name.replace(/\.[^.]+$/, "") || "image"}.png`,
    });
    const timestamp = nowIso();
    const image: ImageCanvasElement = {
      id: crypto.randomUUID(),
      type: "image",
      x: screenToWorld(importAnchorRef.current, viewport).x,
      y: screenToWorld(importAnchorRef.current, viewport).y,
      width: result.width,
      height: result.height,
      rotation: 0,
      zIndex: nextZIndex(elements),
      src: asset.path,
      sourceType: "image",
      originalFileName: undefined,
      importInfo: {
        importedAt: timestamp,
        transparentBackgroundApplied: imageImportDialog.transparentBackground.enabled,
        perspectiveTransformApplied: imageImportDialog.perspective.enabled,
      },
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    setElements((current) => [...current, image]);
    closeImageImportDialog();
  }

  async function confirmPdfImport() {
    if (!pdfImportDialog) return;
    const pages = await importPdfPages(pdfImportDialog.file, pdfImportDialog.quality, pdfImportDialog.customScale);
    const basePoint = screenToWorld(importAnchorRef.current, viewport);
    let cursorY = basePoint.y;
    const spacing = 40;
    let nextZ = nextZIndex(elements);
    const insertedImages: ImageCanvasElement[] = [];
    for (const page of pages) {
      const asset = await storage.writePngAsset({
        subjectId: props.subjectId,
        noteId: props.noteId,
        bytes: page.bytes,
        fileName: `${pdfImportDialog.file.name.replace(/\.[^.]+$/, "")}-page-${String(page.pageNumber).padStart(3, "0")}.png`,
      });
      const timestamp = nowIso();
      const image: ImageCanvasElement = {
        id: crypto.randomUUID(),
        type: "image",
        x: basePoint.x,
        y: cursorY,
        width: page.width,
        height: page.height,
        rotation: 0,
        zIndex: nextZ,
        src: asset.path,
        sourceType: "pdf-page",
        pageNumber: page.pageNumber,
        importInfo: {
          importedAt: timestamp,
          pdfScale: pdfImportDialog.quality === "custom" ? pdfImportDialog.customScale : PDF_IMPORT_SCALES[pdfImportDialog.quality],
        },
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      insertedImages.push(image);
      nextZ += 1;
      cursorY += page.height + spacing;
    }
    if (insertedImages.length > 0) {
      setElements((current) => [...current, ...insertedImages]);
    }
    closePdfImportDialog();
  }

  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  useEffect(() => {
    return () => {
      if (imageImportDialog?.previewUrl) URL.revokeObjectURL(imageImportDialog.previewUrl);
    };
  }, [imageImportDialog?.previewUrl]);

  useEffect(() => {
    if (tool !== "line") setPendingLine(null);
  }, [tool]);

  useEffect(() => {
    const root = canvasRef.current;
    if (!root) return;
    const preventNativeInteraction = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.closest(".canvas-viewport")) return;
      event.preventDefault();
    };
    root.addEventListener("selectstart", preventNativeInteraction, true);
    root.addEventListener("dragstart", preventNativeInteraction, true);
    root.addEventListener("mousedown", preventNativeInteraction, true);
    return () => {
      root.removeEventListener("selectstart", preventNativeInteraction, true);
      root.removeEventListener("dragstart", preventNativeInteraction, true);
      root.removeEventListener("mousedown", preventNativeInteraction, true);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      storage.loadSubject(props.subjectId),
      storage.loadNoteMeta(props.subjectId, props.noteId),
      storage.loadNote(props.subjectId, props.noteId),
    ])
      .then(([nextSubject, nextMeta, nextNote]) => {
        if (cancelled) return;
        setLoadError(null);
        setSubject(nextSubject);
        setNoteMeta(nextMeta);
        setNote(nextNote);
        setViewport(normalizeViewport(nextNote));
        commitCanvasState({
          elements: toCanvasElements(nextNote),
          grid: { ...normalizeGrid(nextNote) },
        });
        canvasHistoryRef.current.clear();
        setSelectedIds([]);
        setInspector(null);
        setContextMenu(null);
        const serialized = JSON.stringify({
          ...nextNote,
          canvas: {
            type: "infinite" as const,
            viewport: normalizeViewport(nextNote),
            grid: { ...normalizeGrid(nextNote) },
            elements: toCanvasElements(nextNote),
          },
        });
        lastSavedRef.current = serialized;
        setDirty(false);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : String(error));
        setSubject(null);
        setNoteMeta(null);
        setNote(null);
        commitCanvasState({ elements: DEMO_ELEMENTS, grid: { mode: "free", snapStep: 10, gridSize: 100, visible: false } });
        canvasHistoryRef.current.clear();
        setDirty(false);
      });
    return () => {
      cancelled = true;
    };
  }, [props.noteId, props.subjectId, storage]);

  useEffect(() => {
    if (!note) {
      setDirty(false);
      return;
    }
    const snapshot = JSON.stringify({
      ...note,
      canvas: {
        type: "infinite" as const,
        viewport,
        grid: { ...grid },
        elements,
      },
    });
    setDirty(snapshot !== lastSavedRef.current);
  }, [elements, grid, note, viewport]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      if (event.code === "Space") setSpacePressed(true);
      if (event.key === "Shift") setShiftPressed(true);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
        event.preventDefault();
        if (appConfig.mode === "local-edit") {
          setSelectedIds(elements.map((element) => element.id));
          setInspector(null);
          setContextMenu(null);
        }
        return;
      }
      if (event.key === "Escape") {
        setSelectedIds([]);
        setContextMenu(null);
        setInteraction(null);
        setPendingLine(null);
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redoCanvasChange();
        else undoCanvasChange();
        setSelectedIds([]);
        setInspector(null);
        setContextMenu(null);
        setInteraction(null);
        setPendingLine(null);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redoCanvasChange();
        setSelectedIds([]);
        setInspector(null);
        setContextMenu(null);
        setInteraction(null);
        setPendingLine(null);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && (event.key === "=" || event.key === "+")) {
        event.preventDefault();
        setViewport((current) => ({ ...current, scale: clamp(current.scale * 1.1, MIN_SAFE_ZOOM, MAX_SAFE_ZOOM) }));
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "-") {
        event.preventDefault();
        setViewport((current) => ({ ...current, scale: clamp(current.scale / 1.1, MIN_SAFE_ZOOM, MAX_SAFE_ZOOM) }));
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "0") {
        event.preventDefault();
        setViewport({ x: 0, y: 0, scale: 1 });
      }
      if ((event.key === "Delete" || event.key === "Backspace") && appConfig.mode === "local-edit") {
        setElements((current) => current.filter((element) => !selectedIds.includes(element.id)));
        setSelectedIds([]);
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") setSpacePressed(false);
      if (event.key === "Shift") setShiftPressed(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [elements, selectedIds]);

  useEffect(() => {
    if (appConfig.mode !== "local-edit" || !note) return;
    const snapshot = {
      ...note,
      canvas: {
        type: "infinite" as const,
        viewport,
        grid: { ...grid },
        elements,
      },
    };
    const parsed = noteSchema.safeParse(snapshot);
    if (!parsed.success) {
      setSaveStatus("error");
      setSaveError(parsed.error.issues.map((issue) => issue.message).join("; "));
      return;
    }
    const serialized = JSON.stringify(parsed.data);
    if (serialized === lastSavedRef.current) {
      setSaveStatus("saved");
      setSaveError(null);
      return;
    }
    if (!dirty && serialized !== lastSavedRef.current) return;
    setSaveStatus("saving");
    setSaveError(null);
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      void storage.saveNote(parsed.data)
        .then(() => {
          lastSavedRef.current = serialized;
          setSaveStatus("saved");
          setDirty(false);
        })
        .catch((error: unknown) => {
          setSaveStatus("error");
          setSaveError(error instanceof Error ? error.message : String(error));
        });
    }, 250);
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [dirty, elements, grid, note, storage, viewport]);

  useEffect(() => {
    const preventBrowserZoom = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
      }
    };
    const preventZoomKeys = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key === "=" || event.key === "+" || event.key === "-" || event.key === "0") {
        event.preventDefault();
      }
    };
    window.addEventListener("wheel", preventBrowserZoom, { capture: true, passive: false });
    window.addEventListener("keydown", preventZoomKeys, { capture: true });
    return () => {
      window.removeEventListener("wheel", preventBrowserZoom, { capture: true } as AddEventListenerOptions);
      window.removeEventListener("keydown", preventZoomKeys, { capture: true } as AddEventListenerOptions);
    };
  }, []);

  function updateViewportWithAnchor(anchor: Point, nextScaleRaw: number) {
    const nextScale = clamp(nextScaleRaw, MIN_SAFE_ZOOM, MAX_SAFE_ZOOM);
    setViewport((current) => {
      const world = screenToWorld(anchor, current);
      return {
        scale: nextScale,
        x: anchor.x - world.x * nextScale,
        y: anchor.y - world.y * nextScale,
      };
    });
  }

  useEffect(() => {
    const handleMove = (event: PointerEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const currentPointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };

      if (pendingLine) {
        setPendingLine({ ...pendingLine, current: currentPointer });
      }

      const trackedPointer = touchPointersRef.current.get(event.pointerId);
      if (trackedPointer?.pointerType === "touch" && touchGestureRef.current) {
        event.preventDefault();
        touchPointersRef.current.set(event.pointerId, { ...trackedPointer, point: currentPointer });
        const touchPointers = [...touchPointersRef.current.values()].filter((pointer) => pointer.pointerType === "touch");
        if (touchPointers.length >= 2) {
          const touchEntries = [...touchPointersRef.current.entries()].filter(([, pointer]) => pointer.pointerType === "touch");
          const [firstEntry, secondEntry] = touchEntries;
          if (!firstEntry || !secondEntry) return;
          const first = { id: firstEntry[0], point: firstEntry[1].point };
          const second = { id: secondEntry[0], point: secondEntry[1].point };
          const nextCenter = center(first.point, second.point);
          const nextDistance = distance(first.point, second.point);
          const gesture = touchGestureRef.current;
          if (gesture.kind !== "pinch" || gesture.pointerIds[0] !== first.id || gesture.pointerIds[1] !== second.id) {
            const nextViewport = viewportRef.current;
            touchGestureRef.current = {
              kind: "pinch",
              pointerIds: [first.id, second.id],
              startViewport: nextViewport,
              startDistance: nextDistance,
              startWorldCenter: screenToWorld(nextCenter, nextViewport),
            };
          }
          const pinch = touchGestureRef.current;
          if (pinch?.kind === "pinch") {
            const nextScale = clamp(pinch.startViewport.scale * (nextDistance / Math.max(pinch.startDistance, 0.0001)), MIN_SAFE_ZOOM, MAX_SAFE_ZOOM);
            setViewport({
              scale: nextScale,
              x: nextCenter.x - pinch.startWorldCenter.x * nextScale,
              y: nextCenter.y - pinch.startWorldCenter.y * nextScale,
            });
          }
          return;
        }
        if (touchPointers.length === 1) {
          const [onlyEntry] = [...touchPointersRef.current.entries()].filter(([, pointer]) => pointer.pointerType === "touch");
          if (!onlyEntry) return;
          const touch = { id: onlyEntry[0], point: onlyEntry[1].point };
          const gesture = touchGestureRef.current;
          if (gesture?.kind !== "pan" || gesture.pointerId !== touch.id) {
            touchGestureRef.current = {
              kind: "pan",
              pointerId: touch.id,
              startPointer: touch.point,
              startViewport: viewportRef.current,
            };
          }
          const pan = touchGestureRef.current;
          if (pan?.kind === "pan") {
            const dx = touch.point.x - pan.startPointer.x;
            const dy = touch.point.y - pan.startPointer.y;
            setViewport({ ...pan.startViewport, x: pan.startViewport.x + dx, y: pan.startViewport.y + dy });
          }
        }
        return;
      }

      if (!interaction) return;

      if (interaction.kind === "pan") {
        const dx = currentPointer.x - interaction.startPointer.x;
        const dy = currentPointer.y - interaction.startPointer.y;
        setViewport({ ...interaction.startViewport, x: interaction.startViewport.x + dx, y: interaction.startViewport.y + dy });
      } else if (interaction.kind === "select") {
        setInteraction({ ...interaction, currentPointer });
      } else if (interaction.kind === "move") {
        const dx = (currentPointer.x - interaction.startPointer.x) / interaction.startViewport.scale;
        const dy = (currentPointer.y - interaction.startPointer.y) / interaction.startViewport.scale;
        setElements((current) =>
          current.map((element) => {
            if (!selectedIds.includes(element.id)) return element;
            const start = interaction.startPositions[element.id];
            if (!start) return element;
            const nextX = start.x + dx;
            const nextY = start.y + dy;
            const snappedX = grid.mode === "assisted" ? snapToStep(nextX, grid.snapStep) : nextX;
            const snappedY = grid.mode === "assisted" ? snapToStep(nextY, grid.snapStep) : nextY;
            if (element.type === "line") {
              const deltaX = snappedX - element.x;
              const deltaY = snappedY - element.y;
              return {
                ...element,
                x: snappedX,
                y: snappedY,
                start: { x: element.start.x + deltaX, y: element.start.y + deltaY },
                end: { x: element.end.x + deltaX, y: element.end.y + deltaY },
              };
            }
            if (element.type === "freehand") {
              const deltaX = snappedX - element.x;
              const deltaY = snappedY - element.y;
              return {
                ...element,
                x: snappedX,
                y: snappedY,
                points: element.points.map((point) => ({ x: point.x + deltaX, y: point.y + deltaY })),
              };
            }
            return { ...element, x: snappedX, y: snappedY };
          }),
        );
      } else if (interaction.kind === "resize") {
        const currentWorld = screenToWorld(currentPointer, interaction.startViewport);
        const nextBounds = buildResizeBounds(interaction.startBounds, interaction.handle, currentWorld, interaction.preserveAspect || shiftPressed);
        setElements((current) =>
          current.map((element) => (element.id === interaction.elementId ? resizeElement(element, nextBounds) : element)),
        );
      } else if (interaction.kind === "draw") {
        if (interaction.tool === "freehand") {
          const lastPoint = interaction.points[interaction.points.length - 1];
          const distanceMoved = lastPoint ? Math.hypot(currentPointer.x - lastPoint.x, currentPointer.y - lastPoint.y) : Infinity;
          if (distanceMoved >= 2) {
            setInteraction({
              ...interaction,
              currentPointer,
              points: [...interaction.points, currentPointer],
            });
          } else {
            setInteraction({ ...interaction, currentPointer });
          }
        } else {
          setInteraction({ ...interaction, currentPointer });
        }
      }
    };
    const handleUp = (event: PointerEvent) => {
      if (touchPointersRef.current.has(event.pointerId)) {
        const pointerId = event.pointerId;
        const trackedPointer = touchPointersRef.current.get(pointerId);
        touchPointersRef.current.delete(pointerId);
        if (trackedPointer?.pointerType === "touch") {
          if (touchPointersRef.current.size >= 2) {
            const touchEntries = [...touchPointersRef.current.entries()].filter(([, pointer]) => pointer.pointerType === "touch");
            const [firstEntry, secondEntry] = touchEntries;
            if (firstEntry && secondEntry) {
              const first = { id: firstEntry[0], point: firstEntry[1].point };
              const second = { id: secondEntry[0], point: secondEntry[1].point };
              const nextCenter = center(first.point, second.point);
              const nextDistance = distance(first.point, second.point);
              touchGestureRef.current = {
                kind: "pinch",
                pointerIds: [first.id, second.id],
                startViewport: viewportRef.current,
                startDistance: nextDistance,
                startWorldCenter: screenToWorld(nextCenter, viewportRef.current),
              };
            }
          } else if (touchPointersRef.current.size === 1) {
            const [onlyEntry] = [...touchPointersRef.current.entries()].filter(([, pointer]) => pointer.pointerType === "touch");
            if (onlyEntry) {
              touchGestureRef.current = {
                kind: "pan",
                pointerId: onlyEntry[0],
                startPointer: onlyEntry[1].point,
                startViewport: viewportRef.current,
              };
            } else {
              touchGestureRef.current = null;
            }
          } else {
            touchGestureRef.current = null;
          }
        }
      }
      if (interaction?.kind === "select") {
        const selection: SelectionRect = {
          startX: screenToWorld(interaction.startPointer, viewport).x,
          startY: screenToWorld(interaction.startPointer, viewport).y,
          endX: screenToWorld(interaction.currentPointer, viewport).x,
          endY: screenToWorld(interaction.currentPointer, viewport).y,
        };
        const nextSelected = elements.filter((element) => rectsIntersect(selection, element)).map((element) => element.id);
        setSelectedIds(nextSelected);
      }
      if (interaction?.kind === "draw") {
        const startWorld = screenToWorld(interaction.startPointer, viewport);
        const endWorld = screenToWorld(interaction.currentPointer, viewport);
        const movedDistance = Math.hypot(interaction.currentPointer.x - interaction.startPointer.x, interaction.currentPointer.y - interaction.startPointer.y);
        const isQuickTap = movedDistance < 8 && performance.now() - interaction.startedAt < 650;
        if (interaction.tool === "text") {
          const text = createTextElement(startWorld);
          setElements((current) => [...current, { ...text, zIndex: nextZIndex(current) }]);
          setSelectedIds([text.id]);
          setInspector({ elementId: text.id, anchor: interaction.currentPointer });
        } else if (interaction.tool === "rect") {
          const endPoint = interaction.preserveAspect ? constrainEndToSquare(startWorld, endWorld) : endWorld;
          const rect = isQuickTap ? createDefaultRectElement(startWorld) : createRectElement(startWorld, endPoint);
          setElements((current) => [...current, { ...rect, zIndex: nextZIndex(current) }]);
          setSelectedIds([rect.id]);
          setInspector(null);
        } else if (interaction.tool === "ellipse") {
          const endPoint = interaction.preserveAspect ? constrainEndToSquare(startWorld, endWorld) : endWorld;
          const ellipse = isQuickTap ? createDefaultEllipseElement(startWorld) : createEllipseElement(startWorld, endPoint);
          setElements((current) => [...current, { ...ellipse, zIndex: nextZIndex(current) }]);
          setSelectedIds([ellipse.id]);
          setInspector(null);
        } else if (interaction.tool === "freehand") {
          const freehandPoints = interaction.points.length > 1 ? interaction.points : [interaction.startPointer, interaction.currentPointer];
          const worldPoints = freehandPoints.map((point) => screenToWorld(point, viewport));
          void (async () => {
            const raster = await rasterizeFreehandStroke(worldPoints, DEFAULT_FREEHAND_STROKE, 4);
            if (!raster) return;
            const asset = await storage.writePngAsset({
              subjectId: props.subjectId,
              noteId: props.noteId,
              bytes: raster.bytes,
              fileName: `freehand-${crypto.randomUUID()}.png`,
            });
            const timestamp = nowIso();
            const image: ImageCanvasElement = {
              id: crypto.randomUUID(),
              type: "image",
              x: raster.left,
              y: raster.top,
              width: raster.width,
              height: raster.height,
              rotation: 0,
              zIndex: 1,
              createdAt: timestamp,
              updatedAt: timestamp,
              src: asset.path,
              sourceType: "image",
              originalFileName: "freehand.png",
              importInfo: {
                importedAt: timestamp,
              },
            };
            setElements((current) => [...current, { ...image, zIndex: nextZIndex(current) }]);
            setSelectedIds([image.id]);
            setInspector(null);
          })();
        }
        setTool("select");
      }
      setInteraction(null);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  }, [elements, grid.mode, grid.snapStep, interaction, pendingLine, props.noteId, props.subjectId, selectedIds, storage, viewport]);

  function distance(a: Point, b: Point) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function center(a: Point, b: Point) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  const sortedElements = useMemo(() => [...elements].sort((a, b) => a.zIndex - b.zIndex), [elements]);

  const gridStyle = useMemo(() => {
    if (grid.mode === "free") return { opacity: 0 };
    const step = Math.max(8, grid.gridSize * viewport.scale);
    const offsetX = ((viewport.x % step) + step) % step;
    const offsetY = ((viewport.y % step) + step) % step;
    return {
      opacity: 1,
      backgroundImage:
        "linear-gradient(to right, rgba(85, 105, 108, 0.16) 1px, transparent 1px), linear-gradient(to bottom, rgba(85, 105, 108, 0.16) 1px, transparent 1px)",
      backgroundSize: `${step}px ${step}px`,
      backgroundPosition: `${offsetX}px ${offsetY}px`,
    } as const;
  }, [grid.gridSize, grid.mode, viewport.scale, viewport.x, viewport.y]);

  function elementAtPointer(pointer: Point) {
    const world = screenToWorld(pointer, viewport);
    const hit = [...sortedElements].reverse().find((element) => {
      const bounds = elementBounds(element);
      return world.x >= bounds.left && world.x <= bounds.right && world.y >= bounds.top && world.y <= bounds.bottom;
    });
    return hit ?? null;
  }

  function duplicateSelected() {
    const offset = 24;
    setElements((current) => {
      const next = [...current];
      const baseZ = nextZIndex(next);
      for (const element of current.filter((item) => selectedIds.includes(item.id))) {
        const copy = { ...element, id: crypto.randomUUID(), x: element.x + offset, y: element.y + offset, zIndex: baseZ + next.length };
        next.push(copy);
      }
      return next;
    });
  }

  function duplicateElementsByIds(elementIds: string[]) {
    const offset = 24;
    setElements((current) => {
      const next = [...current];
      const baseZ = nextZIndex(next);
      const timestamp = nowIso();
      for (const element of current.filter((item) => elementIds.includes(item.id))) {
        const copy = {
          ...element,
          id: crypto.randomUUID(),
          x: element.x + offset,
          y: element.y + offset,
          zIndex: baseZ + next.length,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        if (copy.type === "line") {
          copy.start = { x: copy.start.x + offset, y: copy.start.y + offset };
          copy.end = { x: copy.end.x + offset, y: copy.end.y + offset };
        }
        if (copy.type === "freehand") {
          copy.points = copy.points.map((point) => ({ x: point.x + offset, y: point.y + offset }));
        }
        next.push(copy);
      }
      return next;
    });
  }

  function reorderSelected(to: "front" | "back" | "forward" | "backward") {
    setElements((current) => {
      const selected = current.filter((element) => selectedIds.includes(element.id));
      if (selected.length === 0) return current;
      if (to === "front") {
        const base = nextZIndex(current);
        const selectedIdsSet = new Set(selected.map((element) => element.id));
        let offset = 0;
        return current.map((element) => (selectedIdsSet.has(element.id) ? { ...element, zIndex: base + offset++ } : element));
      }
      if (to === "back") {
        const min = current.reduce((acc, element) => Math.min(acc, element.zIndex), 0) - selected.length - 1;
        const selectedIdsSet = new Set(selected.map((element) => element.id));
        let offset = 0;
        return current.map((element) => (selectedIdsSet.has(element.id) ? { ...element, zIndex: min + offset++ } : element));
      }
      if (to === "forward") {
        const selectedIdsSet = new Set(selected.map((element) => element.id));
        return current.map((element) => (selectedIdsSet.has(element.id) ? { ...element, zIndex: element.zIndex + 1 } : element));
      }
      if (to === "backward") {
        const selectedIdsSet = new Set(selected.map((element) => element.id));
        return current.map((element) => (selectedIdsSet.has(element.id) ? { ...element, zIndex: element.zIndex - 1 } : element));
      }
      return current;
    });
  }

  function reorderElementsByIds(elementIds: string[], to: "front" | "back" | "forward" | "backward") {
    setElements((current) => {
      const selected = current.filter((element) => elementIds.includes(element.id));
      if (selected.length === 0) return current;
      if (to === "front") {
        const base = nextZIndex(current);
        const selectedIdsSet = new Set(selected.map((element) => element.id));
        let offset = 0;
        return current.map((element) => (selectedIdsSet.has(element.id) ? { ...element, zIndex: base + offset++ } : element));
      }
      if (to === "back") {
        const min = current.reduce((acc, element) => Math.min(acc, element.zIndex), 0) - selected.length - 1;
        const selectedIdsSet = new Set(selected.map((element) => element.id));
        let offset = 0;
        return current.map((element) => (selectedIdsSet.has(element.id) ? { ...element, zIndex: min + offset++ } : element));
      }
      if (to === "forward") {
        const selectedIdsSet = new Set(selected.map((element) => element.id));
        return current.map((element) => (selectedIdsSet.has(element.id) ? { ...element, zIndex: element.zIndex + 1 } : element));
      }
      if (to === "backward") {
        const selectedIdsSet = new Set(selected.map((element) => element.id));
        return current.map((element) => (selectedIdsSet.has(element.id) ? { ...element, zIndex: element.zIndex - 1 } : element));
      }
      return current;
    });
  }

  function deleteSelected() {
    setElements((current) => current.filter((element) => !selectedIds.includes(element.id)));
    setSelectedIds([]);
    setInspector(null);
  }

  function deleteElementsByIds(elementIds: string[]) {
    setElements((current) => current.filter((element) => !elementIds.includes(element.id)));
    setSelectedIds((current) => current.filter((id) => !elementIds.includes(id)));
    setInspector(null);
  }

  function updateElement(elementId: string, updater: (element: CanvasElement) => CanvasElement) {
    setElements((current) => current.map((element) => (element.id === elementId ? updater(element) : element)));
  }

  function updateSelectedElement(updater: (element: CanvasElement) => CanvasElement) {
    const targetId = selectedIds[0];
    if (!targetId) return;
    updateElement(targetId, updater);
  }

  function onCanvasPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button === 2) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const hit = elementAtPointer(pointer);
    setContextMenu(null);
    if (appConfig.mode !== "local-edit") {
      if (hit?.type === "text") return;
      if (hit) return;
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Ignore capture failures on unsupported browsers or detached nodes.
      }
      setInteraction({ kind: "pan", startPointer: pointer, startViewport: viewport });
      return;
    }
    if (event.pointerType === "touch") {
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Ignore capture failures on unsupported browsers or detached nodes.
      }
      event.preventDefault();
      touchPointersRef.current.set(event.pointerId, { point: pointer, pointerType: event.pointerType });
      const touchEntries = [...touchPointersRef.current.entries()].filter(([, tracked]) => tracked.pointerType === "touch");
      if (touchEntries.length >= 2) {
        const [firstEntry, secondEntry] = touchEntries;
        const first = { id: firstEntry[0], point: firstEntry[1].point };
        const second = { id: secondEntry[0], point: secondEntry[1].point };
        const nextCenter = center(first.point, second.point);
        const nextDistance = distance(first.point, second.point);
        touchGestureRef.current = {
          kind: "pinch",
          pointerIds: [first.id, second.id],
          startViewport: viewportRef.current,
          startDistance: nextDistance,
          startWorldCenter: screenToWorld(nextCenter, viewportRef.current),
        };
      } else {
        touchGestureRef.current = {
          kind: "pan",
          pointerId: event.pointerId,
          startPointer: pointer,
          startViewport: viewportRef.current,
        };
      }
      return;
    }
    if (event.button === 1 || spacePressed) {
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Ignore capture failures on unsupported browsers or detached nodes.
      }
      setInteraction({ kind: "pan", startPointer: pointer, startViewport: viewport });
      return;
    }
    if (event.shiftKey || shiftPressed) {
      setShiftPressed(true);
    }
    if (tool !== "select") {
      event.preventDefault();
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Ignore capture failures on unsupported browsers or detached nodes.
      }
      if (tool === "text") {
        const text = createTextElement(screenToWorld(pointer, viewport));
        setElements((current) => [...current, { ...text, zIndex: nextZIndex(current) }]);
        setSelectedIds([text.id]);
        setInspector({ elementId: text.id, anchor: pointer });
        setTool("select");
        return;
      }
      if (tool === "line") {
        if (!pendingLine) {
          setPendingLine({ start: pointer, current: pointer });
        } else {
          const startWorld = screenToWorld(pendingLine.start, viewport);
          const endWorld = screenToWorld(pointer, viewport);
          const line = createLineElement(startWorld, endWorld);
          setElements((current) => [...current, { ...line, zIndex: nextZIndex(current) }]);
          setSelectedIds([line.id]);
          setInspector(null);
          setPendingLine(null);
          setTool("select");
        }
        return;
      }
      setInteraction({
        kind: "draw",
        tool,
        startPointer: pointer,
        currentPointer: pointer,
        points: [pointer],
        startedAt: performance.now(),
        preserveAspect: event.shiftKey || shiftPressed,
      });
      return;
    }
    if (hit) {
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Ignore capture failures on unsupported browsers or detached nodes.
      }
      const now = performance.now();
      const previousDown = lastElementPointerDownRef.current;
      lastElementPointerDownRef.current = { elementId: hit.id, at: now };
      if (previousDown && previousDown.elementId === hit.id && now - previousDown.at < 300) {
        openInspectorForElement(hit.id, { x: event.clientX, y: event.clientY });
        return;
      }
      if (event.metaKey || event.ctrlKey || event.shiftKey) {
        setSelectedIds((current) =>
          current.includes(hit.id) ? current.filter((id) => id !== hit.id) : [...current, hit.id],
        );
        setInspector(null);
      } else {
        const nextSelectedIds = selectedIds.includes(hit.id) ? selectedIds : [hit.id];
        setSelectedIds(nextSelectedIds);
        setInspector(null);
        setInteraction({
          kind: "move",
          startPointer: pointer,
          startViewport: viewport,
          startPositions: Object.fromEntries(
            elements
              .filter((element) => nextSelectedIds.includes(element.id))
              .map((element) => [element.id, { x: element.x, y: element.y }]),
          ),
        });
      }
    } else {
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Ignore capture failures on unsupported browsers or detached nodes.
      }
      setSelectedIds([]);
      setInspector(null);
      setInteraction({ kind: "select", startPointer: pointer, currentPointer: pointer });
    }
  }

  function onCanvasContextMenu(event: React.MouseEvent<HTMLDivElement>) {
    if (appConfig.mode !== "local-edit") return;
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const hit = elementAtPointer(pointer);
    setContextMenu(hit ? { kind: "element", x: event.clientX, y: event.clientY, elementId: hit.id } : { kind: "canvas", x: event.clientX, y: event.clientY });
  }

  function zoomWheel(event: React.WheelEvent<HTMLDivElement>) {
    if (event.shiftKey) {
      event.preventDefault();
      setViewport((current) => ({ ...current, x: current.x - (event.deltaY !== 0 ? event.deltaY : event.deltaX) }));
      return;
    }
    if (!(event.ctrlKey || event.metaKey)) {
      setViewport((current) => ({ ...current, x: current.x - event.deltaX, y: current.y - event.deltaY }));
      return;
    }
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const direction = event.deltaY > 0 ? -1 : 1;
    updateViewportWithAnchor(anchor, viewport.scale * (direction > 0 ? 1.1 : 0.9));
  }

  function onCanvasClick(event: React.MouseEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const hit = elementAtPointer(pointer);
    setContextMenu(null);
    if (tool === "line" || pendingLine) return;
    if (appConfig.mode !== "local-edit") return;
    if (hit && event.detail >= 2) {
      openInspectorForElement(hit.id, { x: event.clientX, y: event.clientY });
      return;
    }
  }

  function openInspectorAtEvent(event: ReactMouseEvent<HTMLDivElement>) {
    if (appConfig.mode !== "local-edit") return;
    const rect = event.currentTarget.getBoundingClientRect();
    const pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const hit = elementAtPointer(pointer);
    if (!hit) return;
    setSelectedIds([hit.id]);
    setInspector({ elementId: hit.id, anchor: { x: event.clientX, y: event.clientY } });
  }

  function openInspectorForElement(elementId: string, anchor: Point) {
    setSelectedIds([elementId]);
    setInspector({ elementId, anchor });
  }

  function addElementAtCanvasPoint(kind: "text" | "rect" | "ellipse", clientPoint: Point) {
    const worldPoint = screenToWorld(clientPoint, viewport);
    if (kind === "text") {
      const text = createTextElement(worldPoint);
      setElements((current) => [...current, { ...text, zIndex: nextZIndex(current) }]);
      setSelectedIds([text.id]);
      setInspector({ elementId: text.id, anchor: clientPoint });
      return;
    }
    if (kind === "rect") {
      const rect = createDefaultRectElement(worldPoint);
      setElements((current) => [...current, { ...rect, zIndex: nextZIndex(current) }]);
      setSelectedIds([rect.id]);
      setInspector(null);
      return;
    }
    const ellipse = createDefaultEllipseElement(worldPoint);
    setElements((current) => [...current, { ...ellipse, zIndex: nextZIndex(current) }]);
    setSelectedIds([ellipse.id]);
    setInspector(null);
  }

  function startToolAtCanvasPoint(toolName: "line" | "freehand", clientPoint: Point) {
    setTool(toolName);
    setSelectedIds([]);
    setInspector(null);
    setPendingLine(toolName === "line" ? { start: clientPoint, current: clientPoint } : null);
    if (toolName === "freehand") {
      setInteraction({
        kind: "draw",
        tool: "freehand",
        startPointer: clientPoint,
        currentPointer: clientPoint,
        points: [clientPoint],
        startedAt: performance.now(),
        preserveAspect: false,
      });
    }
  }

  const selectionRect = interaction?.kind === "select"
    ? {
        left: Math.min(interaction.startPointer.x, interaction.currentPointer.x),
        top: Math.min(interaction.startPointer.y, interaction.currentPointer.y),
        width: Math.abs(interaction.currentPointer.x - interaction.startPointer.x),
        height: Math.abs(interaction.currentPointer.y - interaction.startPointer.y),
      }
    : null;

  const selectedElements = elements.filter((element) => selectedIds.includes(element.id));
  const activeElement = selectedIds.length === 1 ? elements.find((element) => element.id === selectedIds[0]) ?? null : null;
  const inspectorAnchor = inspector && activeElement?.id === inspector.elementId ? inspector.anchor : null;
  const inspectorElement = inspectorAnchor && activeElement && interaction?.kind !== "resize" ? activeElement : null;
  const inspectorStyle = inspectorAnchor
    ? {
        left: `${Math.min(Math.max(12, inspectorAnchor.x + 12), Math.max(12, window.innerWidth - 360))}px`,
        top: `${Math.min(Math.max(12, inspectorAnchor.y + 12), Math.max(12, window.innerHeight - 420))}px`,
      }
    : null;
  const draftElement = pendingLine
    ? createLineElement(screenToWorld(pendingLine.start, viewport), screenToWorld(pendingLine.current, viewport))
    : interaction?.kind === "draw"
      ? interaction.tool === "rect"
        ? createRectElement(
            screenToWorld(interaction.startPointer, viewport),
            interaction.preserveAspect
              ? screenToWorld(constrainEndToSquare(interaction.startPointer, interaction.currentPointer), viewport)
              : screenToWorld(interaction.currentPointer, viewport),
          )
        : interaction.tool === "ellipse"
          ? createEllipseElement(
              screenToWorld(interaction.startPointer, viewport),
              interaction.preserveAspect
                ? screenToWorld(constrainEndToSquare(interaction.startPointer, interaction.currentPointer), viewport)
                : screenToWorld(interaction.currentPointer, viewport),
            )
          : interaction.tool === "freehand"
            ? createFreehandElement(interaction.points.map((point) => screenToWorld(point, viewport)))
            : createTextElement(screenToWorld(interaction.startPointer, viewport))
      : null;
  const noteTitle = noteMeta?.title ?? note?.title ?? "Note";
  const imageImportPoints = imageImportDialog
    ? imageImportDialog.perspective.points ?? {
        topLeft: { x: 0, y: 0 },
        topRight: { x: imageImportDialog.imageSize.width, y: 0 },
        bottomRight: { x: imageImportDialog.imageSize.width, y: imageImportDialog.imageSize.height },
        bottomLeft: { x: 0, y: imageImportDialog.imageSize.height },
      }
    : null;

  return (
    <main className="editor-shell">
      <header className="editor-toolbar">
        <div className="editor-title">
          <IconButton label="戻る" icon="←" onClick={props.onBack} />
          <div>
            <div className="eyebrow">note editor</div>
            <h1>{noteTitle}</h1>
            <p className="muted">{subject?.name ?? "Subject"} / {appConfig.mode}</p>
          </div>
        </div>
        <div className="editor-actions">
          {appConfig.mode === "local-edit" && (
            <>
              <IconButton label="選択" icon="↖" className={tool === "select" ? "active" : ""} onClick={() => setTool("select")} />
              <IconButton label="文字" icon="T" className={tool === "text" ? "active" : ""} onClick={() => setTool("text")} />
              <IconButton label="四角" icon="▭" className={tool === "rect" ? "active" : ""} onClick={() => setTool("rect")} />
              <IconButton label="丸" icon="◯" className={tool === "ellipse" ? "active" : ""} onClick={() => setTool("ellipse")} />
              <IconButton label="線" icon="／" className={tool === "line" ? "active" : ""} onClick={() => setTool("line")} />
              <IconButton label="お絵描き" icon="✎" className={tool === "freehand" ? "active" : ""} onClick={() => setTool("freehand")} />
              <IconButton label="元に戻す" icon="↶" onClick={() => undoCanvasChange()} />
              <IconButton label="やり直し" icon="↷" onClick={() => redoCanvasChange()} />
              <IconButton
                label={grid.mode === "assisted" ? "グリッドモード: enable" : "グリッドモード: disable"}
                icon={grid.mode === "assisted" ? "▦" : "◌"}
                onClick={() => setGrid((current) => (
                  current.mode === "free"
                    ? { ...current, mode: "assisted" }
                    : { ...current, mode: "free" }
                ))}
              />
            </>
          )}
          <IconButton label="選択解除" icon="×" onClick={() => setSelectedIds([])} />
          <IconButton label="初期化" icon="↺" onClick={() => setViewport({ x: 0, y: 0, scale: 1 })} />
        </div>
      </header>

      <section
        ref={canvasRef}
        className="canvas-viewport"
        tabIndex={0}
        onPointerDown={onCanvasPointerDown}
        onContextMenu={onCanvasContextMenu}
        onDoubleClick={openInspectorAtEvent}
        onWheel={zoomWheel}
        onClick={onCanvasClick}
      >
        <div className="canvas-grid" style={gridStyle} />
        <div
          className="canvas-world"
          style={{
            transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
          }}
        >
          {sortedElements.map((element) => {
            const isSelected = selectedIds.includes(element.id);
            const baseStyle = {
              left: `${element.x}px`,
              top: `${element.y}px`,
              width: `${element.width}px`,
              height: `${element.height}px`,
              zIndex: element.zIndex,
            } as const;
            const assetUrl = element.type === "image" ? resolveAssetUrl(props.subjectId, props.noteId, element.src) : null;
            return (
              <div
                key={element.id}
                className={`canvas-element canvas-element-${element.type} ${isSelected ? "selected" : ""} ${appConfig.mode !== "local-edit" && element.type === "text" ? "readonly-text" : ""}`}
                style={{
                  ...baseStyle,
                  ...elementSurfaceStyle(element),
                  ...(element.type === "text" ? textBoxStyle(element) : {}),
                }}
                draggable={false}
                onContextMenu={(event) => {
                  if (appConfig.mode !== "local-edit") return;
                  event.preventDefault();
                  event.stopPropagation();
                  setContextMenu({ kind: "element", x: event.clientX, y: event.clientY, elementId: element.id });
                }}
                onClick={(event) => {
                  if (appConfig.mode !== "local-edit") return;
                  if (event.detail >= 2) {
                    event.preventDefault();
                    event.stopPropagation();
                    openInspectorForElement(element.id, { x: event.clientX, y: event.clientY });
                  }
                }}
                onDoubleClick={(event) => {
                  if (appConfig.mode !== "local-edit") return;
                  event.preventDefault();
                  event.stopPropagation();
                  openInspectorForElement(element.id, { x: event.clientX, y: event.clientY });
                }}
                >
                {element.type === "text" ? (
                  <RenderedText content={element.content} style={textContentStyle(element)} />
                ) : element.type === "image" ? (
                  <img src={assetUrl ?? ""} alt={element.originalFileName ?? element.id} draggable={false} />
                ) : element.type === "line" ? (
                  <svg className="canvas-element-svg" viewBox={`0 0 ${Math.max(1, element.width)} ${Math.max(1, element.height)}`} preserveAspectRatio="none" aria-hidden="true">
                    <line
                      x1={lineViewBox(element).x1}
                      y1={lineViewBox(element).y1}
                      x2={lineViewBox(element).x2}
                      y2={lineViewBox(element).y2}
                      stroke={element.stroke}
                      strokeWidth={element.strokeWidth}
                      strokeLinecap="round"
                    />
                  </svg>
                ) : element.type === "freehand" ? (
                  <svg className="canvas-element-svg" viewBox={`0 0 ${Math.max(1, element.width)} ${Math.max(1, element.height)}`} preserveAspectRatio="none" aria-hidden="true">
                    <polyline
                      points={freehandPoints(element)}
                      fill="none"
                      stroke={element.stroke}
                      strokeWidth={element.strokeWidth}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : null}
              </div>
            );
          })}
          {draftElement ? (
            <div
                className={`canvas-element canvas-element-${draftElement.type} draft`}
              style={{
                left: `${draftElement.x}px`,
                top: `${draftElement.y}px`,
                width: `${draftElement.width}px`,
                height: `${draftElement.height}px`,
                zIndex: draftElement.zIndex,
                ...elementSurfaceStyle(draftElement),
                ...(draftElement.type === "text" ? textBoxStyle(draftElement) : {}),
              }}
            >
              {draftElement.type === "text" ? (
                <RenderedText content={draftElement.content} style={textContentStyle(draftElement)} />
              ) : draftElement.type === "line" ? (
                <svg className="canvas-element-svg" viewBox={`0 0 ${Math.max(1, draftElement.width)} ${Math.max(1, draftElement.height)}`} preserveAspectRatio="none" aria-hidden="true">
                  <line
                    x1={lineViewBox(draftElement).x1}
                    y1={lineViewBox(draftElement).y1}
                    x2={lineViewBox(draftElement).x2}
                    y2={lineViewBox(draftElement).y2}
                    stroke={draftElement.stroke}
                    strokeWidth={draftElement.strokeWidth}
                    strokeLinecap="round"
                  />
                </svg>
              ) : draftElement.type === "freehand" ? (
                <svg className="canvas-element-svg" viewBox={`0 0 ${Math.max(1, draftElement.width)} ${Math.max(1, draftElement.height)}`} preserveAspectRatio="none" aria-hidden="true">
                  <polyline
                    points={freehandPoints(draftElement)}
                    fill="none"
                    stroke={draftElement.stroke}
                    strokeWidth={draftElement.strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : null}
            </div>
          ) : null}
          {selectedElements.map((element) => (
            <div
              key={`${element.id}-selection`}
              className="selection-overlay"
              style={{
                left: `${elementBounds(element).left - 4}px`,
                top: `${elementBounds(element).top - 4}px`,
                width: `${elementBounds(element).right - elementBounds(element).left + 8}px`,
                height: `${elementBounds(element).bottom - elementBounds(element).top + 8}px`,
                zIndex: element.zIndex + 1,
              }}
            />
          ))}
          {activeElement && !activeElement.locked && (
            <div className="resize-handle-layer" aria-hidden="true">
              {(["nw", "n", "ne", "e", "se", "s", "sw", "w"] as ResizeHandle[]).map((handle) => {
                const bounds = elementBounds(activeElement);
                const handlePoint = resizeHandlePosition(bounds, handle);
                const selectedHandleStyle = {
                  left: `${handlePoint.x - 6}px`,
                  top: `${handlePoint.y - 6}px`,
                } as const;
                return (
                  <button
                    key={handle}
                    type="button"
                    className={`resize-handle resize-handle-${handle}`}
                    style={selectedHandleStyle}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setSelectedIds([activeElement.id]);
                      setInspector(null);
                      setInteraction({
                        kind: "resize",
                        elementId: activeElement.id,
                        handle,
                        preserveAspect: event.shiftKey || shiftPressed,
                        startPointer: { x: event.clientX, y: event.clientY },
                        startViewport: viewport,
                        startElement: activeElement,
                        startBounds: elementBounds(activeElement),
                      });
                      try {
                        event.currentTarget.setPointerCapture(event.pointerId);
                      } catch {
                        // ignore
                      }
                    }}
                  />
                );
              })}
            </div>
          )}
        </div>
        {selectionRect && <div className="selection-rect" style={selectionRect} />}
        {contextMenu && (
          <div
            className="context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onPointerDownCapture={(event) => event.stopPropagation()}
            onMouseDownCapture={(event) => event.stopPropagation()}
            onContextMenuCapture={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            {contextMenu.kind === "canvas" ? (
              <>
                <button type="button" onClick={() => setContextMenu(null)}>選択解除</button>
                {appConfig.mode === "local-edit" && (
                  <>
                    <button type="button" onClick={() => { addElementAtCanvasPoint("text", { x: contextMenu.x, y: contextMenu.y }); setContextMenu(null); }}>文字を追加</button>
                    <button type="button" onClick={() => { addElementAtCanvasPoint("rect", { x: contextMenu.x, y: contextMenu.y }); setContextMenu(null); }}>四角を追加</button>
                    <button type="button" onClick={() => { addElementAtCanvasPoint("ellipse", { x: contextMenu.x, y: contextMenu.y }); setContextMenu(null); }}>丸を追加</button>
                    <button type="button" onClick={() => { startToolAtCanvasPoint("line", { x: contextMenu.x, y: contextMenu.y }); setContextMenu(null); }}>線を開始</button>
                    <button type="button" onClick={() => { startToolAtCanvasPoint("freehand", { x: contextMenu.x, y: contextMenu.y }); setContextMenu(null); }}>お絵描きを開始</button>
                    <button type="button" onClick={() => { openImageImportPicker({ x: contextMenu.x, y: contextMenu.y }); setContextMenu(null); }}>画像を取り込む</button>
                    <button type="button" onClick={() => { openPdfImportPicker({ x: contextMenu.x, y: contextMenu.y }); setContextMenu(null); }}>PDFを取り込む</button>
                    <button type="button" onClick={() => { setGrid((current) => ({ ...current, mode: current.mode === "free" ? "assisted" : "free" })); setContextMenu(null); }}>グリッドモード切替</button>
                    <button type="button" onClick={() => { setViewport({ x: 0, y: 0, scale: 1 }); setContextMenu(null); }}>表示リセット</button>
                  </>
                )}
              </>
            ) : (
              <>
                <button type="button" onClick={() => { setSelectedIds([contextMenu.elementId]); setContextMenu(null); }}>選択</button>
                {appConfig.mode === "local-edit" && (
                  <>
                    <button type="button" onClick={() => { duplicateElementsByIds([contextMenu.elementId]); setSelectedIds([contextMenu.elementId]); setContextMenu(null); }}>複製</button>
                    <button type="button" onClick={() => { deleteElementsByIds([contextMenu.elementId]); setContextMenu(null); }}>削除</button>
                    <button type="button" onClick={() => { reorderElementsByIds([contextMenu.elementId], "front"); setContextMenu(null); }}>最前面</button>
                    <button type="button" onClick={() => { reorderElementsByIds([contextMenu.elementId], "back"); setContextMenu(null); }}>最背面</button>
                    <button type="button" onClick={() => { reorderElementsByIds([contextMenu.elementId], "forward"); setContextMenu(null); }}>前へ</button>
                    <button type="button" onClick={() => { reorderElementsByIds([contextMenu.elementId], "backward"); setContextMenu(null); }}>後ろへ</button>
                  </>
                )}
              </>
            )}
          </div>
        )}
        {appConfig.mode === "local-edit" && inspectorElement && inspectorStyle && (
          <div
            className="property-panel"
            style={inspectorStyle}
            onPointerDownCapture={(event) => event.stopPropagation()}
            onMouseDownCapture={(event) => event.stopPropagation()}
            onDoubleClickCapture={(event) => event.stopPropagation()}
            onContextMenuCapture={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="property-panel-header">
              <strong>{inspectorElement.type}</strong>
              <IconButton label="閉じる" icon="×" onClick={() => setInspector(null)} />
            </div>
            <div className="property-grid">
              {inspectorElement.type !== "line" && (
                <>
                  <label>
                    <span>X</span>
                    <PropertyNumberField value={inspectorElement.x} onCommit={(next) => updateElement(inspectorElement.id, (current) => ({ ...current, x: next }))} />
                  </label>
                  <label>
                    <span>Y</span>
                    <PropertyNumberField value={inspectorElement.y} onCommit={(next) => updateElement(inspectorElement.id, (current) => ({ ...current, y: next }))} />
                  </label>
                  <label>
                    <span>W</span>
                    <PropertyNumberField value={inspectorElement.width} onCommit={(next) => updateElement(inspectorElement.id, (current) => ({ ...current, width: Math.max(1, next) }))} />
                  </label>
                  <label>
                    <span>H</span>
                    <PropertyNumberField value={inspectorElement.height} onCommit={(next) => updateElement(inspectorElement.id, (current) => ({ ...current, height: Math.max(1, next) }))} />
                  </label>
                </>
              )}
              {inspectorElement.type === "line" && (
                <>
                  <label>
                    <span>X1</span>
                    <PropertyNumberField value={inspectorElement.start.x} onCommit={(next) => updateElement(inspectorElement.id, (current) => {
                      if (current.type !== "line") return current;
                      return { ...current, start: { ...current.start, x: next }, x: Math.min(next, current.end.x), width: Math.max(1, Math.abs(current.end.x - next)) };
                    })} />
                  </label>
                  <label>
                    <span>Y1</span>
                    <PropertyNumberField value={inspectorElement.start.y} onCommit={(next) => updateElement(inspectorElement.id, (current) => {
                      if (current.type !== "line") return current;
                      return { ...current, start: { ...current.start, y: next }, y: Math.min(next, current.end.y), height: Math.max(1, Math.abs(current.end.y - next)) };
                    })} />
                  </label>
                  <label>
                    <span>X2</span>
                    <PropertyNumberField value={inspectorElement.end.x} onCommit={(next) => updateElement(inspectorElement.id, (current) => {
                      if (current.type !== "line") return current;
                      return { ...current, end: { ...current.end, x: next }, x: Math.min(current.start.x, next), width: Math.max(1, Math.abs(next - current.start.x)) };
                    })} />
                  </label>
                  <label>
                    <span>Y2</span>
                    <PropertyNumberField value={inspectorElement.end.y} onCommit={(next) => updateElement(inspectorElement.id, (current) => {
                      if (current.type !== "line") return current;
                      return { ...current, end: { ...current.end, y: next }, y: Math.min(current.start.y, next), height: Math.max(1, Math.abs(next - current.start.y)) };
                    })} />
                  </label>
                  <label>
                    <span>Stroke</span>
                    <input
                      type="color"
                      value={inspectorElement.stroke}
                      onChange={(event) => updateElement(inspectorElement.id, (current) => current.type === "line" ? { ...current, stroke: event.target.value } : current)}
                    />
                  </label>
                  <label>
                    <span>Width</span>
                    <PropertyNumberField value={inspectorElement.strokeWidth} onCommit={(next) => updateElement(inspectorElement.id, (current) => current.type === "line" ? { ...current, strokeWidth: Math.max(1, next) } : current)} />
                  </label>
                </>
              )}
              {inspectorElement.type === "text" && (
                <>
                  <label className="property-wide">
                    <span>Text</span>
                    <textarea
                      rows={4}
                      value={inspectorElement.content}
                      onChange={(event) => updateElement(inspectorElement.id, (current) => current.type === "text" ? { ...current, content: event.target.value, updatedAt: nowIso() } : current)}
                    />
                  </label>
                  <label>
                    <span>Font</span>
                    <PropertyNumberField value={inspectorElement.style.fontSize} onCommit={(next) => updateElement(inspectorElement.id, (current) => current.type === "text" ? { ...current, style: { ...current.style, fontSize: next } } : current)} />
                  </label>
                  <label>
                    <span>Color</span>
                    <input
                      type="color"
                      value={inspectorElement.style.color}
                      onChange={(event) => updateElement(inspectorElement.id, (current) => current.type === "text" ? { ...current, style: { ...current.style, color: event.target.value } } : current)}
                    />
                  </label>
                  <label>
                    <span>BG</span>
                    <input
                      type="color"
                      value={inspectorElement.style.backgroundColor.startsWith("rgba") ? "#ffffff" : inspectorElement.style.backgroundColor}
                      onChange={(event) => updateElement(inspectorElement.id, (current) => current.type === "text" ? { ...current, style: { ...current.style, backgroundColor: event.target.value } } : current)}
                    />
                  </label>
                  <label>
                    <span>Padding</span>
                    <PropertyNumberField value={inspectorElement.style.padding} onCommit={(next) => updateElement(inspectorElement.id, (current) => current.type === "text" ? { ...current, style: { ...current.style, padding: Math.max(0, next) } } : current)} />
                  </label>
                  <label className="property-wide">
                    <span>Font family</span>
                    <input
                      type="text"
                      value={inspectorElement.style.fontFamily ?? ""}
                      onChange={(event) => updateElement(inspectorElement.id, (current) => current.type === "text" ? { ...current, style: { ...current.style, fontFamily: event.target.value || undefined } } : current)}
                    />
                  </label>
                  <label>
                    <span>Border color</span>
                    <input
                      type="color"
                      value={inspectorElement.style.borderColor ?? "#ffffff"}
                      onChange={(event) => updateElement(inspectorElement.id, (current) => current.type === "text" ? { ...current, style: { ...current.style, borderColor: event.target.value } } : current)}
                    />
                  </label>
                  <label>
                    <span>Border width</span>
                    <PropertyNumberField value={inspectorElement.style.borderWidth ?? 0} onCommit={(next) => updateElement(inspectorElement.id, (current) => current.type === "text" ? { ...current, style: { ...current.style, borderWidth: Math.max(0, next) } } : current)} />
                  </label>
                </>
              )}
              {inspectorElement.type === "rect" && (
                <>
                  <label>
                    <span>Fill</span>
                    <input type="color" value={inspectorElement.fill} onChange={(event) => updateElement(inspectorElement.id, (current) => current.type === "rect" ? { ...current, fill: event.target.value } : current)} />
                  </label>
                  <label>
                    <span>Stroke</span>
                    <input type="color" value={inspectorElement.stroke ?? DEFAULT_STROKE} onChange={(event) => updateElement(inspectorElement.id, (current) => current.type === "rect" ? { ...current, stroke: event.target.value } : current)} />
                  </label>
                  <label>
                    <span>Width</span>
                    <PropertyNumberField value={inspectorElement.strokeWidth ?? 0} onCommit={(next) => updateElement(inspectorElement.id, (current) => current.type === "rect" ? { ...current, strokeWidth: next } : current)} />
                  </label>
                </>
              )}
              {inspectorElement.type === "ellipse" && (
                <>
                  <label>
                    <span>Fill</span>
                    <input type="color" value={inspectorElement.fill} onChange={(event) => updateElement(inspectorElement.id, (current) => current.type === "ellipse" ? { ...current, fill: event.target.value } : current)} />
                  </label>
                  <label>
                    <span>Stroke</span>
                    <input type="color" value={inspectorElement.stroke ?? DEFAULT_STROKE} onChange={(event) => updateElement(inspectorElement.id, (current) => current.type === "ellipse" ? { ...current, stroke: event.target.value } : current)} />
                  </label>
                  <label>
                    <span>Width</span>
                    <PropertyNumberField value={inspectorElement.strokeWidth ?? 0} onCommit={(next) => updateElement(inspectorElement.id, (current) => current.type === "ellipse" ? { ...current, strokeWidth: next } : current)} />
                  </label>
                </>
              )}
              {inspectorElement.type === "freehand" && (
                <>
                  <label>
                    <span>Stroke</span>
                    <input type="color" value={inspectorElement.stroke} onChange={(event) => updateElement(inspectorElement.id, (current) => current.type === "freehand" ? { ...current, stroke: event.target.value } : current)} />
                  </label>
                  <label>
                    <span>Width</span>
                    <PropertyNumberField value={inspectorElement.strokeWidth} onCommit={(next) => updateElement(inspectorElement.id, (current) => current.type === "freehand" ? { ...current, strokeWidth: next } : current)} />
                  </label>
                </>
              )}
              {inspectorElement.type === "image" && (
                <>
                  <label className="property-wide">
                    <span>Asset</span>
                    <input type="text" value={inspectorElement.src} readOnly />
                  </label>
                  <label>
                    <span>Type</span>
                    <select
                      value={inspectorElement.sourceType}
                      onChange={(event) => updateElement(inspectorElement.id, (current) => current.type === "image" ? { ...current, sourceType: event.target.value === "pdf-page" ? "pdf-page" : "image" } : current)}
                    >
                      <option value="image">image</option>
                      <option value="pdf-page">pdf-page</option>
                    </select>
                  </label>
                  <label className="property-wide">
                    <span>Note</span>
                    <input type="text" value={inspectorElement.sourceType === "pdf-page" ? "PDFからPNG化済み" : "PNG画像"} readOnly />
                  </label>
                  <label>
                    <span>Page</span>
                    <PropertyNumberField value={inspectorElement.pageNumber ?? 0} onCommit={(next) => updateElement(inspectorElement.id, (current) => current.type === "image" ? { ...current, pageNumber: Math.max(0, Math.trunc(next)) } : current)} />
                  </label>
                </>
              )}
              <label>
                <span>Z</span>
                <PropertyNumberField value={inspectorElement.zIndex} onCommit={(next) => updateElement(inspectorElement.id, (current) => ({ ...current, zIndex: Math.trunc(next) }))} />
              </label>
              <label>
                <span>Rot</span>
                <PropertyNumberField value={inspectorElement.rotation} onCommit={(next) => updateElement(inspectorElement.id, (current) => ({ ...current, rotation: next }))} />
              </label>
              <label>
                <span>Lock</span>
                <select
                  value={inspectorElement.locked ? "yes" : "no"}
                  onChange={(event) => updateElement(inspectorElement.id, (current) => ({ ...current, locked: event.target.value === "yes" }))}
                >
                  <option value="no">no</option>
                  <option value="yes">yes</option>
                </select>
              </label>
            </div>
            <div className="property-actions">
              <IconButton label="複製" icon="⧉" onClick={() => { setSelectedIds([inspectorElement.id]); duplicateSelected(); }} />
              <IconButton label="削除" icon="🗑" tone="danger" onClick={() => { setSelectedIds([inspectorElement.id]); deleteSelected(); setInspector(null); }} />
            </div>
          </div>
        )}
      </section>

      <input
        ref={imageFileInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={async (event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) await prepareImageImport(file);
        }}
      />
      <input
        ref={pdfFileInputRef}
        type="file"
        accept="application/pdf"
        hidden
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) preparePdfImport(file);
        }}
      />

      <Modal open={imageImportDialog !== null} title="画像を取り込む" onClose={closeImageImportDialog}>
        {imageImportDialog && (
          <div className="modal-body">
            <div className="modal-preview">
              <img src={imageImportDialog.previewUrl} alt={imageImportDialog.file.name} />
            </div>
            <p className="muted">{imageImportDialog.file.name}</p>
            <label>
              <input
                type="checkbox"
                checked={imageImportDialog.transparentBackground.enabled}
                onChange={(event) => setImageImportDialog((current) => current ? {
                  ...current,
                  transparentBackground: { ...current.transparentBackground, enabled: event.target.checked },
                } : current)}
              />
              透明背景を処理する
            </label>
            <label>
              <span>方式</span>
              <select
                value={imageImportDialog.transparentBackground.mode}
                onChange={(event) => setImageImportDialog((current) => current ? {
                  ...current,
                  transparentBackground: { ...current.transparentBackground, mode: event.target.value as TransparentBackgroundOptions["mode"] },
                } : current)}
              >
                <option value="none">none</option>
                <option value="near-white">near-white</option>
                <option value="picked-color">picked-color</option>
              </select>
            </label>
            <label>
              <span>tolerance</span>
              <PropertyNumberField
                value={imageImportDialog.transparentBackground.tolerance}
                onCommit={(next) => setImageImportDialog((current) => current ? {
                  ...current,
                  transparentBackground: { ...current.transparentBackground, tolerance: Math.max(0, next) },
                } : current)}
              />
            </label>
            {imageImportDialog.transparentBackground.mode === "picked-color" && (
              <label>
                <span>picked</span>
                <input
                  type="color"
                  value={imageImportDialog.transparentBackground.pickedColor ?? "#ffffff"}
                  onChange={(event) => setImageImportDialog((current) => current ? {
                    ...current,
                    transparentBackground: { ...current.transparentBackground, pickedColor: event.target.value },
                  } : current)}
                />
              </label>
            )}
            <label>
              <input
                type="checkbox"
                checked={imageImportDialog.perspective.enabled}
                onChange={(event) => setImageImportDialog((current) => current ? {
                  ...current,
                  perspective: { ...current.perspective, enabled: event.target.checked },
                } : current)}
              />
              perspective transform
            </label>
            <div className="modal-grid">
              <label>
                <span>output W</span>
                <PropertyNumberField
                  value={imageImportDialog.perspective.outputWidth ?? imageImportDialog.imageSize.width}
                  onCommit={(next) => setImageImportDialog((current) => current ? {
                    ...current,
                    perspective: { ...current.perspective, outputWidth: Math.max(1, Math.trunc(next)) },
                  } : current)}
                />
              </label>
              <label>
                <span>output H</span>
                <PropertyNumberField
                  value={imageImportDialog.perspective.outputHeight ?? imageImportDialog.imageSize.height}
                  onCommit={(next) => setImageImportDialog((current) => current ? {
                    ...current,
                    perspective: { ...current.perspective, outputHeight: Math.max(1, Math.trunc(next)) },
                  } : current)}
                />
              </label>
            </div>
            <div className="modal-corners">
              {imageImportPoints && (["topLeft", "topRight", "bottomRight", "bottomLeft"] as const).map((name) => {
                const point = imageImportPoints[name];
                return (
                  <div key={name} className="modal-corner-row">
                    <strong>{name}</strong>
                    <label>
                      <span>x</span>
                      <PropertyNumberField
                        value={point.x}
                        onCommit={(next) => setImageImportDialog((current) => current ? {
                          ...current,
                          perspective: {
                            ...current.perspective,
                            points: {
                              ...(current.perspective.points ?? imageImportPoints),
                              [name]: { ...point, x: Math.max(0, next) },
                            },
                          },
                        } : current)}
                      />
                    </label>
                    <label>
                      <span>y</span>
                      <PropertyNumberField
                        value={point.y}
                        onCommit={(next) => setImageImportDialog((current) => current ? {
                          ...current,
                          perspective: {
                            ...current.perspective,
                            points: {
                              ...(current.perspective.points ?? imageImportPoints),
                              [name]: { ...point, y: Math.max(0, next) },
                            },
                          },
                        } : current)}
                      />
                    </label>
                  </div>
                );
              })}
            </div>
            <div className="modal-actions">
              <button type="button" onClick={closeImageImportDialog}>キャンセル</button>
              <button type="button" onClick={() => void confirmImageImport()}>取り込む</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={pdfImportDialog !== null} title="PDFを取り込む" onClose={closePdfImportDialog}>
        {pdfImportDialog && (
          <div className="modal-body">
            <p className="muted">{pdfImportDialog.file.name}</p>
            <label>
              <span>quality</span>
              <select
                value={pdfImportDialog.quality}
                onChange={(event) => setPdfImportDialog((current) => current ? {
                  ...current,
                  quality: event.target.value as PdfImportQuality,
                } : current)}
              >
                <option value="light">light</option>
                <option value="standard">standard</option>
                <option value="high">high</option>
                <option value="ultra">ultra</option>
                <option value="custom">custom</option>
              </select>
            </label>
            {pdfImportDialog.quality === "custom" && (
              <label>
                <span>scale</span>
                <PropertyNumberField
                  value={pdfImportDialog.customScale}
                  onCommit={(next) => setPdfImportDialog((current) => current ? {
                    ...current,
                    customScale: Math.max(0.1, next),
                  } : current)}
                />
              </label>
            )}
            <p className="muted">all pages are converted to PNG and placed vertically.</p>
            <div className="modal-actions">
              <button type="button" onClick={closePdfImportDialog}>キャンセル</button>
              <button type="button" onClick={() => void confirmPdfImport()}>取り込む</button>
            </div>
          </div>
        )}
      </Modal>

      <footer className="editor-footer">
        <span>viewport: {viewport.x.toFixed(0)}, {viewport.y.toFixed(0)}, {viewport.scale.toFixed(2)}</span>
        <span>selected: {selectedIds.length}</span>
        <span>grid mode: use_grid: {grid.mode === "assisted" ? "enable" : "disable"}</span>
        <span>tool: {tool}</span>
        <span>save: {saveStatus}{dirty ? " / dirty" : ""}{saveError ? ` / ${saveError}` : ""}</span>
        {appConfig.mode === "local-edit" && <span>drag to move selected demo elements</span>}
      </footer>
      {loadError ? <p className="error">{loadError}</p> : null}
    </main>
  );
}
