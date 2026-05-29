import type { StorageAdapter } from "./storageAdapter";
import type { AppManifest } from "../../features/notes/model/manifestTypes";
import type { SubjectData } from "../../features/notes/model/subjectTypes";
import type { NoteData, NoteMeta, CreateSubjectInput, CreateNoteInput, WritePngAssetInput, DeleteAssetInput, GenerateThumbnailInput, AssetRef } from "../../features/notes/model/noteTypes";
import type { AppMode } from "../../app/appMode";

async function request(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await request(url, init);
  if (!response.ok) throw new Error(`API error ${response.status} for ${url}`);
  return response.json() as Promise<T>;
}

async function noContent(url: string, init?: RequestInit): Promise<void> {
  const response = await request(url, init);
  if (!response.ok) throw new Error(`API error ${response.status} for ${url}`);
}

export class LocalApiStorageAdapter implements StorageAdapter {
  getAppMode(): AppMode { return "local-edit"; }
  loadManifest() { return json<AppManifest>("/api/manifest"); }
  saveManifest(manifest: AppManifest) { return noContent("/api/manifest", { method: "PUT", body: JSON.stringify(manifest) }); }
  loadSubject(subjectId: string) { return json<SubjectData>(`/api/subjects/${subjectId}`); }
  saveSubject(subject: SubjectData) { return noContent(`/api/subjects/${subject.id}`, { method: "PUT", body: JSON.stringify(subject) }); }
  loadNoteMeta(subjectId: string, noteId: string) { return json<NoteMeta>(`/api/subjects/${subjectId}/notes/${noteId}/meta`); }
  saveNoteMeta(meta: NoteMeta) { return noContent(`/api/subjects/${meta.subjectId}/notes/${meta.id}/meta`, { method: "PUT", body: JSON.stringify(meta) }); }
  loadNote(subjectId: string, noteId: string) { return json<NoteData>(`/api/subjects/${subjectId}/notes/${noteId}`); }
  saveNote(note: NoteData) { return noContent(`/api/subjects/${note.subjectId}/notes/${note.id}`, { method: "PUT", body: JSON.stringify(note) }); }
  createSubject(input: CreateSubjectInput) { return json<SubjectData>("/api/subjects", { method: "POST", body: JSON.stringify(input) }); }
  deleteSubject(subjectId: string) { return noContent(`/api/subjects/${subjectId}`, { method: "DELETE" }); }
  createNote(input: CreateNoteInput) { return json<NoteData>(`/api/subjects/${input.subjectId}/notes`, { method: "POST", body: JSON.stringify(input) }); }
  deleteNote(subjectId: string, noteId: string) { return noContent(`/api/subjects/${subjectId}/notes/${noteId}`, { method: "DELETE" }); }
  writePngAsset(input: WritePngAssetInput) { return json<AssetRef>(`/api/subjects/${input.subjectId}/notes/${input.noteId}/assets`, { method: "POST", body: JSON.stringify({ fileName: input.fileName, bytes: Array.from(input.bytes) }) }); }
  deleteAsset(input: DeleteAssetInput) { return noContent(`/api/subjects/${input.subjectId}/notes/${input.noteId}/assets`, { method: "DELETE", body: JSON.stringify({ path: input.path }) }); }
  generateThumbnail(input: GenerateThumbnailInput) { return json<AssetRef>(`/api/subjects/${input.subjectId}/notes/${input.noteId}/thumbnail`, { method: "POST" }); }
}
