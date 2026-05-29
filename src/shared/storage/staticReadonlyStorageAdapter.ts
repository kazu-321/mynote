import type { StorageAdapter } from "./storageAdapter";
import type { AppManifest } from "../../features/notes/model/manifestTypes";
import type { SubjectData } from "../../features/notes/model/subjectTypes";
import type { NoteData, NoteMeta, CreateSubjectInput, CreateNoteInput, WritePngAssetInput, DeleteAssetInput, GenerateThumbnailInput, AssetRef } from "../../features/notes/model/noteTypes";
import type { AppMode } from "../../app/appMode";

const readonlyError = () => new Error("Readonly mode does not allow writes.");

function staticDataPath(path: string) {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return `/data/${path}`;
  }
  return new URL(`data/${path}`, document.baseURI).toString();
}

async function readJson<T>(path: string): Promise<T> {
  const response = await fetch(staticDataPath(path));
  if (!response.ok) throw new Error(`Failed to load ${path}: ${response.status}`);
  return response.json() as Promise<T>;
}

export class StaticReadonlyStorageAdapter implements StorageAdapter {
  getAppMode(): AppMode { return "readonly-pages"; }
  loadManifest() { return readJson<AppManifest>("manifest.json"); }
  saveManifest(_: AppManifest) { return Promise.reject(readonlyError()); }
  loadSubject(subjectId: string) { return readJson<SubjectData>(`subjects/${subjectId}.json`); }
  saveSubject(_: SubjectData) { return Promise.reject(readonlyError()); }
  loadNoteMeta(subjectId: string, noteId: string) { return readJson<NoteMeta>(`notes/${subjectId}/${noteId}/meta.json`); }
  saveNoteMeta(_: NoteMeta) { return Promise.reject(readonlyError()); }
  loadNote(subjectId: string, noteId: string) { return readJson<NoteData>(`notes/${subjectId}/${noteId}/note.json`); }
  saveNote(_: NoteData) { return Promise.reject(readonlyError()); }
  createSubject(_: CreateSubjectInput) { return Promise.reject(readonlyError()); }
  deleteSubject(_: string) { return Promise.reject(readonlyError()); }
  createNote(_: CreateNoteInput) { return Promise.reject(readonlyError()); }
  deleteNote(_subjectId: string, _noteId: string) { return Promise.reject(readonlyError()); }
  writePngAsset(_: WritePngAssetInput) { return Promise.reject(readonlyError()); }
  deleteAsset(_: DeleteAssetInput) { return Promise.reject(readonlyError()); }
  generateThumbnail(_: GenerateThumbnailInput) { return Promise.reject(readonlyError()); }
}
