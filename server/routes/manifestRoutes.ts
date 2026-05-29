import { Router } from "express";
import { manifestPath } from "../utils/paths";
import { readJsonFile, writeJsonFile } from "../utils/json";

export const manifestRoutes = Router()
  .get("/", async (_req, res, next) => {
    try {
      res.json(await readJsonFile(manifestPath));
    } catch (error) {
      next(error);
    }
  })
  .put("/", async (req, res, next) => {
    try {
      await writeJsonFile(manifestPath, req.body);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });
