import { Fragment, useEffect, useMemo, useState } from "react";
import type { DragEvent, FormEvent } from "react";
import { appConfig } from "./app/config";
import { createStorageAdapter } from "./shared/storage/storageAdapter";
import type { AppManifest } from "./features/notes/model/manifestTypes";
import type { SubjectData } from "./features/notes/model/subjectTypes";
import type { NoteMeta } from "./features/notes/model/noteTypes";
import { nowIso } from "./shared/utils/time";
import { Modal } from "./shared/components/Modal";
import { IconButton } from "./shared/components/IconButton";
import { navigateHome, navigateToNote, readRouteState } from "./app/router";
import { NoteEditorPage } from "./pages/NoteEditorPage/NoteEditorPage";

type DragKind = "subject" | "note";
type SubjectDropTarget = string | "__end__" | null;
type NoteDropTarget = { subjectId: string; noteId: string | "__end__" | null } | null;

type DialogState =
  | { kind: "create-subject" }
  | { kind: "rename-subject"; subjectId: string; value: string }
  | { kind: "create-note"; subjectId: string }
  | { kind: "rename-note"; subjectId: string; noteId: string; value: string }
  | { kind: "confirm-delete"; target: "subject" | "note"; subjectId: string; noteId?: string };

type DragState = { kind: DragKind; subjectId: string; noteId?: string } | null;

function isMissingFileError(error: unknown) {
  return error instanceof Error && (error.message.includes("ENOENT") || error.message.includes("404"));
}

export default function App() {
  const [routeTick, setRouteTick] = useState(0);
  const [manifest, setManifest] = useState<AppManifest | null>(null);
  const [subjects, setSubjects] = useState<Record<string, SubjectData>>({});
  const [notes, setNotes] = useState<Record<string, NoteMeta>>({});
  const [openSubjectId, setOpenSubjectId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [dialogValue, setDialogValue] = useState("");
  const [dragState, setDragState] = useState<DragState>(null);
  const [subjectDropTarget, setSubjectDropTarget] = useState<SubjectDropTarget>(null);
  const [noteDropTarget, setNoteDropTarget] = useState<NoteDropTarget>(null);

  const storage = useMemo(() => createStorageAdapter(appConfig.mode), []);
  const route = useMemo(() => readRouteState(), [routeTick]);

  useEffect(() => {
    const onPopState = () => setRouteTick((current) => current + 1);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    storage.loadManifest().then(setManifest).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : String(err));
    });
  }, []);

  useEffect(() => {
    if (!manifest) return;
    let cancelled = false;
    Promise.allSettled(
      manifest.subjects.map(async (subject) => {
        const data = await storage.loadSubject(subject.id);
        const noteIds = data.noteOrder.length > 0 ? data.noteOrder : data.notes.map((note) => note.id);
        const meta = await Promise.all(noteIds.map((noteId) => storage.loadNoteMeta(subject.id, noteId)));
        return [subject.id, data, meta] as const;
      }),
    )
      .then((results) => {
        if (cancelled) return;
        const subjectMap: Record<string, SubjectData> = {};
        const noteMap: Record<string, NoteMeta> = {};
        const missingSubjectIds: string[] = [];
        for (const result of results) {
          if (result.status === "fulfilled") {
            const [subjectId, subjectData, noteMetas] = result.value;
            subjectMap[subjectId] = subjectData;
            for (const meta of noteMetas) noteMap[`${subjectId}:${meta.id}`] = meta;
          } else if (isMissingFileError(result.reason)) {
            const match = String(result.reason).match(/subjects\/([0-9a-f-]+)\.json/i);
            if (match) missingSubjectIds.push(match[1]);
          } else {
            throw result.reason;
          }
        }
        setSubjects(subjectMap);
        setNotes(noteMap);
        setOpenSubjectId((current) => (current && subjectMap[current] ? current : manifest.subjectOrder.find((id) => subjectMap[id]) ?? null));
        if (missingSubjectIds.length > 0 && appConfig.mode === "local-edit") {
          const cleanedManifest = {
            ...manifest,
            subjectOrder: manifest.subjectOrder.filter((id) => !missingSubjectIds.includes(id)),
            subjects: manifest.subjects.filter((subject) => !missingSubjectIds.includes(subject.id)),
          };
          void storage.saveManifest(cleanedManifest);
          setManifest(cleanedManifest);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [manifest, storage]);

  function openDialog(next: DialogState, value = "") {
    setDialog(next);
    setDialogValue(value);
  }

  function closeDialog() {
    setDialog(null);
    setDialogValue("");
  }

  function clearDragTargets() {
    setDragState(null);
    setSubjectDropTarget(null);
    setNoteDropTarget(null);
  }

  async function refreshManifestAndSubjects() {
    const nextManifest = await storage.loadManifest();
    const nextSubjectsResult = await Promise.allSettled(
      nextManifest.subjects.map(async (subject) => [subject.id, await storage.loadSubject(subject.id)] as const),
    );
    const nextSubjects: Array<readonly [string, SubjectData]> = [];
    const missingSubjectIds: string[] = [];
    for (const result of nextSubjectsResult) {
      if (result.status === "fulfilled") {
        nextSubjects.push(result.value);
      } else if (isMissingFileError(result.reason)) {
        const match = String(result.reason).match(/subjects\/([0-9a-f-]+)\.json/i);
        if (match) missingSubjectIds.push(match[1]);
      } else {
        throw result.reason;
      }
    }
    const noteSettled = await Promise.allSettled(
      nextSubjects.flatMap(([subjectId, subject]) => {
        const noteIds = subject.noteOrder.length > 0 ? subject.noteOrder : subject.notes.map((note) => note.id);
        return noteIds.map(async (noteId) => [subjectId, await storage.loadNoteMeta(subjectId, noteId)] as const);
      }),
    );
    const nextNotes = noteSettled.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
    const cleanedManifest =
      missingSubjectIds.length > 0
        ? {
            ...nextManifest,
            subjectOrder: nextManifest.subjectOrder.filter((id) => !missingSubjectIds.includes(id)),
            subjects: nextManifest.subjects.filter((subject) => !missingSubjectIds.includes(subject.id)),
          }
        : nextManifest;
    setManifest(cleanedManifest);
    if (missingSubjectIds.length > 0 && appConfig.mode === "local-edit") {
      void storage.saveManifest(cleanedManifest);
    }
    setSubjects(Object.fromEntries(nextSubjects));
    setNotes(Object.fromEntries(nextNotes.map(([subjectId, note]) => [`${subjectId}:${note.id}`, note])));
  }

  async function createSubject(name: string) {
    const subject = await storage.createSubject({ name });
    await refreshManifestAndSubjects();
    setOpenSubjectId(subject.id);
  }

  async function renameSubject(subjectId: string, name: string) {
    const subject = subjects[subjectId];
    const next = { ...subject, name, updatedAt: nowIso() };
    await storage.saveSubject(next);
    await refreshManifestAndSubjects();
  }

  async function createNote(subjectId: string, title: string) {
    await storage.createNote({ subjectId, title });
    await refreshManifestAndSubjects();
    setOpenSubjectId(subjectId);
  }

  async function renameNote(subjectId: string, noteId: string, title: string) {
    const note = notes[`${subjectId}:${noteId}`];
    const next = { ...note, title, updatedAt: nowIso() };
    await storage.saveNoteMeta(next);
    await refreshManifestAndSubjects();
  }

  async function deleteSubject(subjectId: string) {
    await storage.deleteSubject(subjectId);
    await refreshManifestAndSubjects();
    setOpenSubjectId((current) => (current === subjectId ? null : current));
  }

  async function deleteNote(subjectId: string, noteId: string) {
    await storage.deleteNote(subjectId, noteId);
    await refreshManifestAndSubjects();
  }

  async function submitDialog(event: FormEvent) {
    event.preventDefault();
    if (!dialog) return;
    const value = dialogValue.trim();
    if (!value) return;
    if (dialog.kind === "create-subject") await createSubject(value);
    if (dialog.kind === "rename-subject") await renameSubject(dialog.subjectId, value);
    if (dialog.kind === "create-note") await createNote(dialog.subjectId, value);
    if (dialog.kind === "rename-note") await renameNote(dialog.subjectId, dialog.noteId, value);
    closeDialog();
  }

  async function confirmDelete() {
    if (!dialog || dialog.kind !== "confirm-delete") return;
    if (dialog.target === "subject") await deleteSubject(dialog.subjectId);
    if (dialog.target === "note" && dialog.noteId) await deleteNote(dialog.subjectId, dialog.noteId);
    closeDialog();
  }

  function startDrag(kind: DragKind, subjectId: string, noteId?: string, event?: DragEvent<HTMLButtonElement>) {
    setSubjectDropTarget(null);
    setNoteDropTarget(null);
    setDragState({ kind, subjectId, noteId });
    if (!event) return;
    const target = event.currentTarget.closest(kind === "subject" ? ".subject-card" : ".note-row") as HTMLElement | null;
    if (target) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setDragImage(target, target.clientWidth / 2, target.clientHeight / 2);
    }
  }

  async function reorderSubject(targetSubjectId: string | "__end__") {
    if (!manifest || dragState?.kind !== "subject") return;
    if (targetSubjectId !== "__end__" && dragState.subjectId === targetSubjectId) return;
    const fromIndex = manifest.subjectOrder.indexOf(dragState.subjectId);
    if (fromIndex < 0) return;
    const nextOrder = [...manifest.subjectOrder];
    const [moved] = nextOrder.splice(fromIndex, 1);
    const insertIndex = targetSubjectId === "__end__" ? nextOrder.length : Math.max(0, nextOrder.indexOf(targetSubjectId));
    nextOrder.splice(insertIndex, 0, moved);
    const nextManifest = { ...manifest, subjectOrder: nextOrder };
    await storage.saveManifest(nextManifest);
    setManifest(nextManifest);
    clearDragTargets();
  }

  async function reorderNote(subjectId: string, targetNoteId: string | "__end__") {
    if (dragState?.kind !== "note" || dragState.subjectId !== subjectId || !dragState.noteId) return;
    if (targetNoteId !== "__end__" && dragState.noteId === targetNoteId) return;
    const subject = subjects[subjectId];
    const fromIndex = subject.noteOrder.indexOf(dragState.noteId);
    if (fromIndex < 0) return;
    const nextOrder = [...subject.noteOrder];
    const [moved] = nextOrder.splice(fromIndex, 1);
    const insertIndex = targetNoteId === "__end__" ? nextOrder.length : Math.max(0, nextOrder.indexOf(targetNoteId));
    nextOrder.splice(insertIndex, 0, moved);
    const nextNotes = [...subject.notes];
    const [movedNote] = nextNotes.splice(
      nextNotes.findIndex((note) => note.id === dragState.noteId),
      1,
    );
    if (movedNote) nextNotes.splice(insertIndex, 0, movedNote);
    const nextSubject = { ...subject, noteOrder: nextOrder, notes: nextNotes, updatedAt: nowIso() };
    await storage.saveSubject(nextSubject);
    setSubjects((current) => ({ ...current, [subjectId]: nextSubject }));
    clearDragTargets();
  }

  if (route.kind === "note") {
    return <NoteEditorPage subjectId={route.subjectId} noteId={route.noteId} onBack={navigateHome} />;
  }

  return (
    <main className="app-shell">
      <section className="panel">
        <div className="eyebrow">mynote</div>
        <h1>Home</h1>
        <p>Mode: <strong>{appConfig.mode}</strong></p>
        {appConfig.mode === "local-edit" ? (
          <IconButton
            label="教科を追加"
            icon="+"
            onClick={() => openDialog({ kind: "create-subject" })}
          />
        ) : (
          <p className="muted">Readonly mode</p>
        )}
        {error ? (
          <p className="error">{error}</p>
        ) : manifest ? (
          <div className="subject-list">
            {appConfig.mode === "local-edit" && (
              <div
                className={`subject-drop-start ${dragState?.kind === "subject" && subjectDropTarget === (manifest.subjectOrder.find((id) => subjects[id]) ?? "__end__") ? "active" : ""}`}
                onDragOver={(event) => {
                  if (dragState?.kind === "subject") {
                    event.preventDefault();
                    setSubjectDropTarget(manifest.subjectOrder.find((id) => subjects[id]) ?? "__end__");
                  }
                }}
                onDrop={() => void reorderSubject(manifest.subjectOrder.find((id) => subjects[id]) ?? "__end__")}
              >
                {dragState?.kind === "subject" && subjectDropTarget === (manifest.subjectOrder.find((id) => subjects[id]) ?? "__end__") && <div className="insert-line" aria-hidden="true" />}
              </div>
            )}
            {manifest.subjectOrder.map((subjectId) => {
              const subject = subjects[subjectId];
              if (!subject) return null;
              const isOpen = openSubjectId === subjectId;
              const subjectIndex = manifest.subjectOrder.indexOf(subjectId);
              const nextSubjectId = manifest.subjectOrder.slice(subjectIndex + 1).find((id) => subjects[id]) ?? "__end__";
              const showSubjectInsertBefore = dragState?.kind === "subject" && dragState.subjectId !== subjectId && subjectDropTarget === subjectId;
              return (
                <div key={subjectId} className="subject-block">
                  {showSubjectInsertBefore && <div className="insert-line" aria-hidden="true" />}
                  <article
                    className={`subject-card ${isOpen ? "open" : "closed"} ${dragState?.kind === "subject" && dragState.subjectId === subjectId ? "dragging" : ""}`}
                    onDragEnter={(event) => {
                      if (appConfig.mode === "local-edit" && dragState?.kind === "subject") {
                        event.preventDefault();
                        setSubjectDropTarget(subjectId);
                      }
                    }}
                    onDragOver={(event) => {
                      if (appConfig.mode === "local-edit" && dragState?.kind === "subject") {
                        event.preventDefault();
                        const rect = event.currentTarget.getBoundingClientRect();
                        const shouldMoveAfter = event.clientY > rect.top + rect.height * 0.65;
                        setSubjectDropTarget(shouldMoveAfter ? nextSubjectId : subjectId);
                      }
                    }}
                    onDrop={() => void reorderSubject(subjectDropTarget ?? subjectId)}
                  >
                  <header className="subject-header">
                    <div className="subject-head-left">
                      {appConfig.mode === "local-edit" ? (
                        <button
                          className="drag-handle subject-drag"
                          draggable
                          onDragStart={(event) => startDrag("subject", subjectId, undefined, event)}
                          onDragEnd={clearDragTargets}
                          title="並べ替え"
                        >
                          ☰
                        </button>
                      ) : (
                        <span className="drag-handle placeholder" />
                      )}
                      <button className="subject-title" onClick={() => setOpenSubjectId(isOpen ? null : subjectId)}>
                        {isOpen ? "▾" : "▸"} {subject.name}
                      </button>
                      {appConfig.mode === "local-edit" && (
                        <IconButton
                          label="編集"
                          icon="✎"
                          className="compact-action"
                          onClick={() => openDialog({ kind: "rename-subject", subjectId, value: subject.name }, subject.name)}
                        />
                      )}
                    </div>
                    {appConfig.mode === "local-edit" && (
                      <div className="actions">
                        <IconButton label="ノートを追加" icon="+" onClick={() => openDialog({ kind: "create-note", subjectId })} />
                        <IconButton
                          tone="danger"
                          label="削除"
                          icon="🗑"
                          onClick={() => openDialog({ kind: "confirm-delete", target: "subject", subjectId })}
                          disabled={subject.notes.length > 0}
                        />
                      </div>
                    )}
                  </header>
                  {isOpen && (
                    <ul className="note-list">
                      {appConfig.mode === "local-edit" && (
                        <li
                          className={`note-insert-zone ${dragState?.kind === "note" && noteDropTarget?.subjectId === subjectId && noteDropTarget.noteId === (subject.noteOrder.find((id) => notes[`${subjectId}:${id}`]) ?? "__end__") ? "active" : ""}`}
                          onDragOver={(event) => {
                            if (dragState?.kind === "note") {
                              event.preventDefault();
                              setNoteDropTarget({ subjectId, noteId: subject.noteOrder.find((id) => notes[`${subjectId}:${id}`]) ?? "__end__" });
                            }
                          }}
                          onDrop={() => void reorderNote(subjectId, subject.noteOrder.find((id) => notes[`${subjectId}:${id}`]) ?? "__end__")}
                        >
                          {dragState?.kind === "note" && noteDropTarget?.subjectId === subjectId && noteDropTarget.noteId === (subject.noteOrder.find((id) => notes[`${subjectId}:${id}`]) ?? "__end__") && <span className="insert-line" aria-hidden="true" />}
                        </li>
                      )}
                      {subject.noteOrder.map((noteId) => {
                        const note = notes[`${subjectId}:${noteId}`];
                        if (!note) return null;
                        const noteIndex = subject.noteOrder.indexOf(noteId);
                        const nextNoteId = subject.noteOrder.slice(noteIndex + 1).find((id) => notes[`${subjectId}:${id}`]) ?? "__end__";
                        const showNoteInsertBefore = dragState?.kind === "note" && dragState.subjectId === subjectId && dragState.noteId !== noteId && noteDropTarget?.subjectId === subjectId && noteDropTarget.noteId === noteId;
                        return (
                          <Fragment key={noteId}>
                            {showNoteInsertBefore && (
                              <li className="note-insert-zone active" aria-hidden="true">
                                <span className="insert-line" />
                              </li>
                            )}
                            <li
                              className={`note-row ${dragState?.kind === "note" && dragState.subjectId === subjectId && dragState.noteId === noteId ? "dragging" : ""}`}
                              onDragEnter={(event) => {
                                if (appConfig.mode === "local-edit" && dragState?.kind === "note") {
                                  event.preventDefault();
                                  setNoteDropTarget({ subjectId, noteId });
                                }
                              }}
                              onDragOver={(event) => {
                                if (appConfig.mode === "local-edit" && dragState?.kind === "note") {
                                  event.preventDefault();
                                  const rect = event.currentTarget.getBoundingClientRect();
                                  const shouldMoveAfter = event.clientY > rect.top + rect.height * 0.65;
                                  setNoteDropTarget({ subjectId, noteId: shouldMoveAfter ? nextNoteId : noteId });
                                }
                              }}
                              onDrop={() => void reorderNote(subjectId, noteDropTarget?.subjectId === subjectId ? noteDropTarget.noteId ?? noteId : noteId)}
                            >
                              {appConfig.mode === "local-edit" ? (
                                <button
                                  className="drag-handle"
                                  draggable
                                  onDragStart={(event) => startDrag("note", subjectId, noteId, event)}
                                  onDragEnd={clearDragTargets}
                                  title="並べ替え"
                                >
                                  ☰
                                </button>
                              ) : (
                                <span className="drag-handle placeholder" />
                              )}
                              <span className="note-main">
                                <button className="note-title-button" onClick={() => navigateToNote(subjectId, noteId)}>
                                  <span className="note-title">{note.title}</span>
                                </button>
                                {appConfig.mode === "local-edit" && (
                                  <IconButton
                                    label="編集"
                                    icon="✎"
                                    className="compact-action note-edit-action"
                                    onClick={() => openDialog({ kind: "rename-note", subjectId, noteId, value: note.title }, note.title)}
                                  />
                                )}
                              </span>
                              {appConfig.mode === "local-edit" && (
                                <span className="actions">
                                  <IconButton
                                    tone="danger"
                                    label="削除"
                                    icon="🗑"
                                    onClick={() => openDialog({ kind: "confirm-delete", target: "note", subjectId, noteId })}
                                  />
                                </span>
                              )}
                            </li>
                          </Fragment>
                        );
                      })}
                      {appConfig.mode === "local-edit" && (
                        <li
                          className={`note-insert-zone ${dragState?.kind === "note" && noteDropTarget?.subjectId === subjectId && noteDropTarget.noteId === "__end__" ? "active" : ""}`}
                          onDragOver={(event) => {
                            if (dragState?.kind === "note") {
                              event.preventDefault();
                              setNoteDropTarget({ subjectId, noteId: "__end__" });
                            }
                          }}
                          onDrop={() => void reorderNote(subjectId, "__end__")}
                        >
                          {dragState?.kind === "note" && noteDropTarget?.subjectId === subjectId && noteDropTarget.noteId === "__end__" && <span className="insert-line" aria-hidden="true" />}
                        </li>
                      )}
                    </ul>
                  )}
                  </article>
                </div>
              );
            })}
            {appConfig.mode === "local-edit" && (
              <div
                className={`subject-drop-end ${dragState?.kind === "subject" && subjectDropTarget === "__end__" ? "active" : ""}`}
                onDragOver={(event) => {
                  if (dragState?.kind === "subject") {
                    event.preventDefault();
                    setSubjectDropTarget("__end__");
                  }
                }}
                onDrop={() => void reorderSubject("__end__")}
              >
                {dragState?.kind === "subject" && subjectDropTarget === "__end__" && <div className="insert-line insert-line-end" aria-hidden="true" />}
              </div>
            )}
          </div>
        ) : (
          <p>Loading manifest...</p>
        )}
      </section>

      <Modal open={dialog !== null} title="入力" onClose={closeDialog}>
        {dialog?.kind === "confirm-delete" ? (
          <div className="modal-actions">
            <p>本当に削除しますか?</p>
            <div className="actions">
              <IconButton label="キャンセル" icon="×" onClick={closeDialog} />
              <IconButton tone="danger" label="削除" icon="🗑" onClick={() => void confirmDelete()} />
            </div>
          </div>
        ) : (
          <form onSubmit={(event) => void submitDialog(event)} className="modal-form">
            <label className="modal-field">
              <span>名前</span>
              <input autoFocus value={dialogValue} onChange={(event) => setDialogValue(event.target.value)} />
            </label>
            <div className="actions">
              <IconButton type="button" label="キャンセル" icon="×" onClick={closeDialog} />
              <IconButton type="submit" label="OK" icon="✓" />
            </div>
          </form>
        )}
      </Modal>
    </main>
  );
}
