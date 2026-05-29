import path from "node:path";
export const dataRoot = path.resolve("public/data");
export const manifestPath = path.join(dataRoot, "manifest.json");
export const subjectsDir = path.join(dataRoot, "subjects");
export const notesDir = path.join(dataRoot, "notes");
export function subjectPath(subjectId: string) {
  return path.join(subjectsDir, `${subjectId}.json`);
}
export function noteMetaPath(subjectId: string, noteId: string) {
  return path.join(notesDir, subjectId, noteId, "meta.json");
}
export function noteDataPath(subjectId: string, noteId: string) {
  return path.join(notesDir, subjectId, noteId, "note.json");
}
export function noteAssetPath(subjectId: string, noteId: string, assetPath: string) {
  return path.join(notesDir, subjectId, noteId, assetPath);
}
