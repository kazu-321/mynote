import { Router } from "express";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { noteAssetPath } from "../utils/paths";

function assetFileName(fileName?: string) {
  const base = path.basename(fileName && fileName.trim() ? fileName : `${crypto.randomUUID()}.png`);
  return base.toLowerCase().endsWith(".png") ? base : `${base}.png`;
}

export const assetRoutes = Router()
  .post("/:subjectId/notes/:noteId/assets", async (req, res, next) => {
    try {
      const bytes = Array.isArray(req.body?.bytes) ? Uint8Array.from(req.body.bytes) : null;
      if (!bytes) {
        res.status(400).json({ error: "Missing bytes" });
        return;
      }
      const fileName = assetFileName(req.body?.fileName);
      const assetRelativePath = path.posix.join("assets", "images", fileName);
      const filePath = noteAssetPath(req.params.subjectId, req.params.noteId, assetRelativePath);
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, Buffer.from(bytes));
      res.json({ path: assetRelativePath });
    } catch (error) {
      next(error);
    }
  })
  .delete("/:subjectId/notes/:noteId/assets", async (req, res, next) => {
    try {
      const assetPath = String(req.body?.path ?? "");
      if (!assetPath) {
        res.status(400).json({ error: "Missing path" });
        return;
      }
      const filePath = noteAssetPath(req.params.subjectId, req.params.noteId, assetPath);
      await rm(filePath, { force: true });
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });
