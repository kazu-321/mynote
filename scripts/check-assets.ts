import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { manifestSchema, noteSchema, subjectSchema } from "../src/features/notes/model/noteSchemas";

const dataRoot = join("public", "data");
const assetsRootName = "assets";

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

async function listFilesRecursive(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = join(directory, entry.name);
      if (entry.isDirectory()) return listFilesRecursive(fullPath);
      return [fullPath];
    }),
  );
  return nested.flat();
}

async function main() {
  const manifest = manifestSchema.parse(await readJson<unknown>(join(dataRoot, "manifest.json")));
  for (const subjectRef of manifest.subjects) {
    const subject = subjectSchema.parse(await readJson<unknown>(join(dataRoot, subjectRef.path)));
    for (const noteId of subject.noteOrder) {
      const notePath = join(dataRoot, "notes", subject.id, noteId, "note.json");
      const note = noteSchema.parse(await readJson<unknown>(notePath));
      const noteDir = join(dataRoot, "notes", subject.id, note.id);
      const assetsDir = join(noteDir, assetsRootName);

      for (const element of note.canvas.elements) {
        if (element.type !== "image") continue;
        if (!element.src.startsWith("assets/")) {
          throw new Error(`Image asset path must stay inside assets/: ${element.src}`);
        }
        if (extname(element.src).toLowerCase() !== ".png") {
          throw new Error(`Image asset must be PNG: ${element.src}`);
        }
        const assetPath = join(noteDir, element.src);
        await stat(assetPath);
      }

      try {
        const assetFiles = await listFilesRecursive(assetsDir);
        for (const filePath of assetFiles) {
          if (extname(filePath).toLowerCase() !== ".png") {
            throw new Error(`Non-PNG asset found: ${relative(noteDir, filePath)}`);
          }
        }
      } catch (error) {
        if (!(error instanceof Error) || (error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error;
        }
      }
    }
  }
  console.log("asset check valid");
}

await main();
