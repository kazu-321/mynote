import type { Point } from "../canvas/model/viewportTypes";

export interface TransparentBackgroundOptions {
  enabled: boolean;
  mode: "none" | "near-white" | "picked-color";
  tolerance: number;
  pickedColor?: string;
}

export interface PerspectiveTransformOptions {
  enabled: boolean;
  points?: {
    topLeft: Point;
    topRight: Point;
    bottomRight: Point;
    bottomLeft: Point;
  };
  outputWidth?: number;
  outputHeight?: number;
}

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) return { r: 255, g: 255, b: 255 };
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

async function canvasToPngBytes(canvas: HTMLCanvasElement) {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((result) => resolve(result), "image/png"));
  if (!blob) throw new Error("Failed to encode PNG.");
  return new Uint8Array(await blob.arrayBuffer());
}

function createCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

async function loadBitmap(file: File) {
  return createImageBitmap(file);
}

function drawBitmap(bitmap: ImageBitmap) {
  const canvas = createCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas context unavailable.");
  context.drawImage(bitmap, 0, 0);
  return canvas;
}

function applyTransparentBackground(canvas: HTMLCanvasElement, options: TransparentBackgroundOptions) {
  if (!options.enabled || options.mode === "none") return canvas;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas context unavailable.");
  const { width, height } = canvas;
  const imageData = context.getImageData(0, 0, width, height);
  const data = imageData.data;
  const picked = options.mode === "picked-color" ? hexToRgb(options.pickedColor ?? "#ffffff") : null;
  const tolerance = Math.max(0, options.tolerance);
  for (let index = 0; index < data.length; index += 4) {
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    const alpha = data[index + 3];
    if (alpha === 0) continue;
    const isMatch = picked
      ? Math.abs(r - picked.r) <= tolerance && Math.abs(g - picked.g) <= tolerance && Math.abs(b - picked.b) <= tolerance
      : r >= 255 - tolerance && g >= 255 - tolerance && b >= 255 - tolerance;
    if (isMatch) data[index + 3] = 0;
  }
  context.putImageData(imageData, 0, 0);
  return canvas;
}

function solveHomography(
  src: Array<{ x: number; y: number }>,
  dst: Array<{ x: number; y: number }>,
) {
  const matrix: number[][] = [];
  const values: number[] = [];
  for (let i = 0; i < 4; i += 1) {
    const { x: sx, y: sy } = src[i];
    const { x: dx, y: dy } = dst[i];
    matrix.push([sx, sy, 1, 0, 0, 0, -dx * sx, -dx * sy]);
    values.push(dx);
    matrix.push([0, 0, 0, sx, sy, 1, -dy * sx, -dy * sy]);
    values.push(dy);
  }
  for (let row = 0; row < 8; row += 1) {
    let pivot = row;
    for (let candidate = row + 1; candidate < 8; candidate += 1) {
      if (Math.abs(matrix[candidate][row]) > Math.abs(matrix[pivot][row])) pivot = candidate;
    }
    if (pivot !== row) {
      [matrix[row], matrix[pivot]] = [matrix[pivot], matrix[row]];
      [values[row], values[pivot]] = [values[pivot], values[row]];
    }
    const divisor = matrix[row][row] || 1e-12;
    for (let col = row; col < 8; col += 1) matrix[row][col] /= divisor;
    values[row] /= divisor;
    for (let nextRow = 0; nextRow < 8; nextRow += 1) {
      if (nextRow === row) continue;
      const factor = matrix[nextRow][row];
      if (factor === 0) continue;
      for (let col = row; col < 8; col += 1) matrix[nextRow][col] -= factor * matrix[row][col];
      values[nextRow] -= factor * values[row];
    }
  }
  return [...values, 1];
}

function applyPerspectiveTransform(canvas: HTMLCanvasElement, options: PerspectiveTransformOptions) {
  if (!options.enabled || !options.points) return canvas;
  const { width: srcWidth, height: srcHeight } = canvas;
  const srcContext = canvas.getContext("2d");
  if (!srcContext) throw new Error("Canvas context unavailable.");
  const source = srcContext.getImageData(0, 0, srcWidth, srcHeight);
  const outputWidth = Math.max(1, Math.round(options.outputWidth ?? Math.max(
    Math.hypot(options.points.topRight.x - options.points.topLeft.x, options.points.topRight.y - options.points.topLeft.y),
    Math.hypot(options.points.bottomRight.x - options.points.bottomLeft.x, options.points.bottomRight.y - options.points.bottomLeft.y),
  )));
  const outputHeight = Math.max(1, Math.round(options.outputHeight ?? Math.max(
    Math.hypot(options.points.bottomLeft.x - options.points.topLeft.x, options.points.bottomLeft.y - options.points.topLeft.y),
    Math.hypot(options.points.bottomRight.x - options.points.topRight.x, options.points.bottomRight.y - options.points.topRight.y),
  )));
  const output = createCanvas(outputWidth, outputHeight);
  const outContext = output.getContext("2d");
  if (!outContext) throw new Error("Canvas context unavailable.");
  const src = [
    { x: 0, y: 0 },
    { x: srcWidth - 1, y: 0 },
    { x: srcWidth - 1, y: srcHeight - 1 },
    { x: 0, y: srcHeight - 1 },
  ];
  const dst = [
    options.points.topLeft,
    options.points.topRight,
    options.points.bottomRight,
    options.points.bottomLeft,
  ];
  const inverse = solveHomography(dst, src);
  const srcData = source.data;
  const outImage = outContext.createImageData(outputWidth, outputHeight);
  const dstData = outImage.data;
  for (let y = 0; y < outputHeight; y += 1) {
    for (let x = 0; x < outputWidth; x += 1) {
      const denom = inverse[6] * x + inverse[7] * y + inverse[8];
      const sx = (inverse[0] * x + inverse[1] * y + inverse[2]) / denom;
      const sy = (inverse[3] * x + inverse[4] * y + inverse[5]) / denom;
      const outIndex = (y * outputWidth + x) * 4;
      if (Number.isNaN(sx) || Number.isNaN(sy) || sx < 0 || sy < 0 || sx >= srcWidth || sy >= srcHeight) {
        dstData[outIndex + 3] = 0;
        continue;
      }
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = Math.min(srcWidth - 1, x0 + 1);
      const y1 = Math.min(srcHeight - 1, y0 + 1);
      const tx = sx - x0;
      const ty = sy - y0;
      const i00 = (y0 * srcWidth + x0) * 4;
      const i10 = (y0 * srcWidth + x1) * 4;
      const i01 = (y1 * srcWidth + x0) * 4;
      const i11 = (y1 * srcWidth + x1) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        const a = srcData[i00 + channel] * (1 - tx) + srcData[i10 + channel] * tx;
        const b = srcData[i01 + channel] * (1 - tx) + srcData[i11 + channel] * tx;
        dstData[outIndex + channel] = Math.round(a * (1 - ty) + b * ty);
      }
    }
  }
  outContext.putImageData(outImage, 0, 0);
  return output;
}

export async function importImageFile(file: File, options: {
  transparentBackground: TransparentBackgroundOptions;
  perspective: PerspectiveTransformOptions;
}) {
  const bitmap = await loadBitmap(file);
  let canvas = drawBitmap(bitmap);
  canvas = applyTransparentBackground(canvas, options.transparentBackground);
  canvas = applyPerspectiveTransform(canvas, options.perspective);
  const bytes = await canvasToPngBytes(canvas);
  return { bytes, width: canvas.width, height: canvas.height };
}
