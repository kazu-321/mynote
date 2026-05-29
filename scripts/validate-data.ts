import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { manifestSchema, noteSchema, subjectSchema } from "../src/features/notes/model/noteSchemas";

const manifest = JSON.parse(await readFile("public/data/manifest.json", "utf8"));
manifestSchema.parse(manifest);
for (const subject of manifest.subjects) {
  const subjectData = JSON.parse(await readFile(join("public/data", subject.path), "utf8"));
  subjectSchema.parse(subjectData);
  for (const noteId of subjectData.noteOrder) {
    const notePath = join("public/data", "notes", subject.id, noteId, "note.json");
    const noteData = JSON.parse(await readFile(notePath, "utf8"));
    noteSchema.parse(noteData);
  }
}
console.log("data valid");
