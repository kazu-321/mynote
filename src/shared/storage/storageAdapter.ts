import type { AppMode } from "../../app/appMode";
import type {
  AssetRef,
  CreateNoteInput,
  CreateSubjectInput,
  DeleteAssetInput,
  GenerateThumbnailInput,
  NoteData,
  NoteMeta,
  WritePngAssetInput,
} from "../../features/notes/model/noteTypes";
import type { AppManifest } from "../../features/notes/model/manifestTypes";
import type { SubjectData } from "../../features/notes/model/subjectTypes";
import { LocalApiStorageAdapter } from "./localApiStorageAdapter";
import { StaticReadonlyStorageAdapter } from "./staticReadonlyStorageAdapter";

export interface StorageAdapter {
  getAppMode(): AppMode;
  loadManifest(): Promise<AppManifest>;
  saveManifest(manifest: AppManifest): Promise<void>;
  loadSubject(subjectId: string): Promise<SubjectData>;
  saveSubject(subject: SubjectData): Promise<void>;
  loadNoteMeta(subjectId: string, noteId: string): Promise<NoteMeta>;
  saveNoteMeta(meta: NoteMeta): Promise<void>;
  loadNote(subjectId: string, noteId: string): Promise<NoteData>;
  saveNote(note: NoteData): Promise<void>;
  createSubject(input: CreateSubjectInput): Promise<SubjectData>;
  deleteSubject(subjectId: string): Promise<void>;
  createNote(input: CreateNoteInput): Promise<NoteData>;
  deleteNote(subjectId: string, noteId: string): Promise<void>;
  writePngAsset(input: WritePngAssetInput): Promise<AssetRef>;
  deleteAsset(input: DeleteAssetInput): Promise<void>;
  generateThumbnail(input: GenerateThumbnailInput): Promise<AssetRef>;
}

export function createStorageAdapter(mode: AppMode): StorageAdapter {
  return mode === "local-edit" ? new LocalApiStorageAdapter() : new StaticReadonlyStorageAdapter();
}
