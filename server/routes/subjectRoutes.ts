import { Router } from "express";
import { rm } from "node:fs/promises";
import { readJsonFile, writeJsonFile } from "../utils/json";
import { manifestPath, subjectPath } from "../utils/paths";

function isMissingFile(error: unknown) {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === "ENOENT";
}

async function loadManifest(): Promise<any> {
  return readJsonFile(manifestPath);
}

export const subjectRoutes = Router()
  .get("/:subjectId", async (req, res, next) => {
    try {
      res.json(await readJsonFile(subjectPath(req.params.subjectId)));
    } catch (error) {
      if (isMissingFile(error)) {
        res.status(404).json({ error: "Subject not found" });
        return;
      }
      next(error);
    }
  })
  .put("/:subjectId", async (req, res, next) => {
    try {
      await writeJsonFile(subjectPath(req.params.subjectId), req.body);
      res.status(204).end();
    } catch (error) {
      if (isMissingFile(error)) {
        res.status(404).json({ error: "Subject not found" });
        return;
      }
      next(error);
    }
  })
  .post("/", async (req, res, next) => {
    try {
      const now = new Date().toISOString();
      const subjectId = crypto.randomUUID();
      const subject = {
        schemaVersion: 1,
        id: subjectId,
        name: req.body?.name ?? "Untitled",
        description: "",
        createdAt: now,
        updatedAt: now,
        noteOrder: [],
        notes: [],
      };
      const manifest = await loadManifest();
      manifest.subjectOrder.push(subjectId);
      manifest.subjects.push({ id: subjectId, name: subject.name, path: `subjects/${subjectId}.json` });
      await writeJsonFile(manifestPath, manifest);
      await writeJsonFile(subjectPath(subjectId), subject);
      res.json(subject);
    } catch (error) {
      next(error);
    }
  })
  .delete("/:subjectId", async (req, res, next) => {
    try {
      const subject = await readJsonFile<any>(subjectPath(req.params.subjectId));
      if (subject.notes.length > 0) {
        res.status(400).json({ error: "Subject is not empty" });
        return;
      }
      await rm(subjectPath(req.params.subjectId), { force: true });
      const manifest = await loadManifest();
      manifest.subjectOrder = manifest.subjectOrder.filter((id: string) => id !== req.params.subjectId);
      manifest.subjects = manifest.subjects.filter((item: any) => item.id !== req.params.subjectId);
      await writeJsonFile(manifestPath, manifest);
      res.status(204).end();
    } catch (error) {
      if (isMissingFile(error)) {
        res.status(404).json({ error: "Subject not found" });
        return;
      }
      next(error);
    }
  });
