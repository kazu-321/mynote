import express from "express";
import { manifestRoutes } from "./routes/manifestRoutes";
import { subjectRoutes } from "./routes/subjectRoutes";
import { noteRoutes } from "./routes/noteRoutes";
import { assetRoutes } from "./routes/assetRoutes";

export function createApp() {
  const app = express();
  app.use(express.json({ limit: "20mb" }));
  app.use("/api/manifest", manifestRoutes);
  app.use("/api/subjects", subjectRoutes);
  app.use("/api/subjects", noteRoutes);
  app.use("/api/subjects", assetRoutes);
  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  });
  return app;
}
