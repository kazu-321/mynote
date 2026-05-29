import { Router } from "express";
import { mkdir, rm } from "node:fs/promises";
import { readJsonFile, writeJsonFile } from "../utils/json";
import { manifestPath, noteDataPath, noteMetaPath, subjectPath } from "../utils/paths";

function isMissingFile(error: unknown) {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === "ENOENT";
}

async function loadManifest(): Promise<any> {
  return readJsonFile(manifestPath);
}

async function loadSubject(subjectId: string): Promise<any> {
  return readJsonFile(subjectPath(subjectId));
}

export const noteRoutes = Router()
  .get("/:subjectId/notes/:noteId", async (req, res, next) => {
    try {
      res.json(await readJsonFile(noteDataPath(req.params.subjectId, req.params.noteId)));
    } catch (error) {
      if (isMissingFile(error)) {
        res.status(404).json({ error: "Note not found" });
        return;
      }
      next(error);
    }
  })
  .put("/:subjectId/notes/:noteId", async (req, res, next) => {
    try {
      await writeJsonFile(noteDataPath(req.params.subjectId, req.params.noteId), req.body);
      res.status(204).end();
    } catch (error) {
      if (isMissingFile(error)) {
        res.status(404).json({ error: "Note not found" });
        return;
      }
      next(error);
    }
  })
  .get("/:subjectId/notes/:noteId/meta", async (req, res, next) => {
    try {
      res.json(await readJsonFile(noteMetaPath(req.params.subjectId, req.params.noteId)));
    } catch (error) {
      if (isMissingFile(error)) {
        res.status(404).json({ error: "Note not found" });
        return;
      }
      next(error);
    }
  })
  .put("/:subjectId/notes/:noteId/meta", async (req, res, next) => {
    try {
      await writeJsonFile(noteMetaPath(req.params.subjectId, req.params.noteId), req.body);
      res.status(204).end();
    } catch (error) {
      if (isMissingFile(error)) {
        res.status(404).json({ error: "Note not found" });
        return;
      }
      next(error);
    }
  })
  .post("/:subjectId/notes", async (req, res, next) => {
    try {
      const now = new Date().toISOString();
      const noteId = crypto.randomUUID();
      const subjectId = req.params.subjectId;
      const title = req.body?.title ?? "Untitled note";
      const note = {
        schemaVersion: 1,
        id: noteId,
        subjectId,
        title,
        description: "",
        createdAt: now,
        updatedAt: now,
        thumbnail: undefined,
      };
      const data = {
        schemaVersion: 1,
        id: noteId,
        subjectId,
        title,
        createdAt: now,
        updatedAt: now,
        canvas: {
          type: "infinite",
          viewport: { x: 0, y: 0, scale: 1 },
          grid: { mode: "free", snapStep: 10, gridSize: 100, visible: false },
          elements: [],
        },
      };
      const subject = await loadSubject(subjectId);
      subject.noteOrder.push(noteId);
      subject.notes.push({
        id: noteId,
        title,
        metaPath: `notes/${subjectId}/${noteId}/meta.json`,
        notePath: `notes/${subjectId}/${noteId}/note.json`,
      });
      subject.updatedAt = now;
      await writeJsonFile(subjectPath(subjectId), subject);
      await writeJsonFile(noteMetaPath(subjectId, noteId), note);
      await writeJsonFile(noteDataPath(subjectId, noteId), data);
      res.json(data);
    } catch (error) {
      if (isMissingFile(error)) {
        res.status(404).json({ error: "Subject not found" });
        return;
      }
      next(error);
    }
  })
  .delete("/:subjectId/notes/:noteId", async (req, res, next) => {
    try {
      const subjectId = req.params.subjectId;
      const noteId = req.params.noteId;
      const subject = await loadSubject(subjectId);
      subject.noteOrder = subject.noteOrder.filter((id: string) => id !== noteId);
      subject.notes = subject.notes.filter((item: any) => item.id !== noteId);
      subject.updatedAt = new Date().toISOString();
      await writeJsonFile(subjectPath(subjectId), subject);
      await rm(noteMetaPath(subjectId, noteId), { force: true });
      await rm(noteDataPath(subjectId, noteId), { force: true });
      res.status(204).end();
    } catch (error) {
      if (isMissingFile(error)) {
        res.status(404).json({ error: "Note not found" });
        return;
      }
      next(error);
    }
  });
