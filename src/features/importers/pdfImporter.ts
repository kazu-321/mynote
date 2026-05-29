import type { PdfImportQuality } from "../notes/model/noteTypes";

export const PDF_IMPORT_SCALES = {
  light: 1.0,
  standard: 1.5,
  high: 2.0,
  ultra: 3.0,
} as const;

export type PdfPageAsset = {
  bytes: Uint8Array;
  width: number;
  height: number;
  pageNumber: number;
};

function canvasToPngBytes(canvas: HTMLCanvasElement) {
  return new Promise<Uint8Array>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Failed to encode PDF page as PNG."));
        return;
      }
      void blob.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer))).catch(reject);
    }, "image/png");
  });
}

export async function importPdfPages(file: File, quality: PdfImportQuality, customScale?: number) {
  const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({ data, useWorkerFetch: false });
  const pdf = await loadingTask.promise;
  const scale = quality === "custom" ? Math.max(0.1, customScale ?? 1) : PDF_IMPORT_SCALES[quality];
  const pages: PdfPageAsset[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas context unavailable.");
    await page.render({ canvasContext: context, viewport }).promise;
    pages.push({
      bytes: await canvasToPngBytes(canvas),
      width: canvas.width,
      height: canvas.height,
      pageNumber,
    });
  }
  return pages;
}
