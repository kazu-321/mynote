import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createApp } from "../server/app";

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

test("api routes serve health and existing data", async () => {
  const manifest = await readJson<{ subjects: Array<{ id: string }>; subjectOrder: string[] }>("./public/data/manifest.json");
  const subjectId = manifest.subjectOrder[0];
  const subject = await readJson<{ noteOrder: string[] }>("./public/data/subjects/" + subjectId + ".json");
  const noteId = subject.noteOrder[0];

  const server = createServer(createApp());
  server.listen(0);
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected an ephemeral port");

  try {
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const health = await fetch(`${baseUrl}/api/health`).then((response) => response.json() as Promise<{ ok: boolean }>);
    assert.deepEqual(health, { ok: true });

    const loadedManifest = await fetch(`${baseUrl}/api/manifest`).then((response) => response.json() as Promise<{ appName: string; subjectOrder: string[] }>);
    assert.equal(loadedManifest.appName, "mynote");
    assert.deepEqual(loadedManifest.subjectOrder.slice(0, 1), manifest.subjectOrder.slice(0, 1));

    const loadedSubject = await fetch(`${baseUrl}/api/subjects/${subjectId}`).then((response) => response.json() as Promise<{ id: string }>);
    assert.equal(loadedSubject.id, subjectId);

    const loadedNoteMeta = await fetch(`${baseUrl}/api/subjects/${subjectId}/notes/${noteId}/meta`).then((response) => response.json() as Promise<{ id: string }>);
    assert.equal(loadedNoteMeta.id, noteId);

    const loadedNote = await fetch(`${baseUrl}/api/subjects/${subjectId}/notes/${noteId}`).then((response) => response.json() as Promise<{ id: string; canvas: { type: string } }>);
    assert.equal(loadedNote.id, noteId);
    assert.equal(loadedNote.canvas.type, "infinite");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
