import assert from "node:assert/strict";
import test from "node:test";
import { createStorageAdapter } from "../src/shared/storage/storageAdapter";
import { LocalApiStorageAdapter } from "../src/shared/storage/localApiStorageAdapter";
import { StaticReadonlyStorageAdapter } from "../src/shared/storage/staticReadonlyStorageAdapter";

function withFetchStub<T>(impl: typeof fetch, run: () => Promise<T> | T) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = impl;
  return Promise.resolve(run()).finally(() => {
    globalThis.fetch = originalFetch;
  });
}

test("createStorageAdapter returns the correct implementation for each mode", () => {
  assert.ok(createStorageAdapter("local-edit") instanceof LocalApiStorageAdapter);
  assert.ok(createStorageAdapter("readonly-pages") instanceof StaticReadonlyStorageAdapter);
});

test("static readonly adapter reads JSON from the static data tree", async () => {
  const adapter = new StaticReadonlyStorageAdapter();
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const manifest = {
    schemaVersion: 1,
    appName: "mynote",
    appVersion: "0.1.0",
    subjectOrder: [],
    subjects: [],
  };

  await withFetchStub(
    (async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), init });
      const payload =
        String(input) === "/api/subjects"
          ? {
              schemaVersion: 1,
              id: "subject-a",
              name: "数学",
              description: "",
              createdAt: "2026-05-30T00:00:00.000Z",
              updatedAt: "2026-05-30T00:00:00.000Z",
              noteOrder: [],
              notes: [],
            }
          : manifest;
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch,
    async () => {
      const loadedManifest = await adapter.loadManifest();
      assert.deepEqual(loadedManifest, manifest);
    },
  );

  assert.equal(requests[0]?.url, "/data/manifest.json");
});

test("local api adapter issues the expected requests", async () => {
  const adapter = new LocalApiStorageAdapter();
  const requests: Array<{ url: string; init?: RequestInit }> = [];

  await withFetchStub(
    (async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), init });
      return new Response(JSON.stringify({ schemaVersion: 1, id: "subject-a", name: "数学", path: "subjects/subject-a.json" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch,
    async () => {
      await adapter.loadSubject("subject-a");
      await adapter.saveManifest({
        schemaVersion: 1,
        appName: "mynote",
        appVersion: "0.1.0",
        subjectOrder: [],
        subjects: [],
      });
      await adapter.createSubject({ name: "数学" });
    },
  );

  assert.equal(requests[0]?.url, "/api/subjects/subject-a");
  assert.equal(requests[0]?.init?.method, undefined);
  assert.equal(requests[1]?.url, "/api/manifest");
  assert.equal(requests[1]?.init?.method, "PUT");
  assert.equal(requests[2]?.url, "/api/subjects");
  assert.equal(requests[2]?.init?.method, "POST");
});

test("readonly writes fail immediately", async () => {
  const adapter = new StaticReadonlyStorageAdapter();
  await assert.rejects(adapter.saveManifest({
    schemaVersion: 1,
    appName: "mynote",
    appVersion: "0.1.0",
    subjectOrder: [],
    subjects: [],
  }), /Readonly mode does not allow writes/);
});

test("readonly adapter rejects all write-oriented methods", async () => {
  const adapter = new StaticReadonlyStorageAdapter();
  const writeCalls: Array<Promise<unknown>> = [
    adapter.saveSubject({
      schemaVersion: 1,
      id: "subject-a",
      name: "数学",
      description: "",
      createdAt: "2026-05-30T00:00:00.000Z",
      updatedAt: "2026-05-30T00:00:00.000Z",
      noteOrder: [],
      notes: [],
    }),
    adapter.saveNoteMeta({
      schemaVersion: 1,
      id: "note-a",
      subjectId: "subject-a",
      title: "微分積分",
      description: "",
      createdAt: "2026-05-30T00:00:00.000Z",
      updatedAt: "2026-05-30T00:00:00.000Z",
    }),
    adapter.saveNote({
      schemaVersion: 1,
      id: "note-a",
      subjectId: "subject-a",
      title: "微分積分",
      createdAt: "2026-05-30T00:00:00.000Z",
      updatedAt: "2026-05-30T00:00:00.000Z",
      canvas: {
        type: "infinite",
        viewport: { x: 0, y: 0, scale: 1 },
        grid: { mode: "free", snapStep: 10, gridSize: 100, visible: false },
        elements: [],
      },
    }),
    adapter.createNote({ subjectId: "subject-a", title: "新規" }),
    adapter.deleteSubject("subject-a"),
    adapter.deleteNote("subject-a", "note-a"),
    adapter.writePngAsset({ subjectId: "subject-a", noteId: "note-a", bytes: new Uint8Array([1, 2, 3]), fileName: "image.png" }),
    adapter.deleteAsset({ subjectId: "subject-a", noteId: "note-a", path: "assets/images/image.png" }),
    adapter.generateThumbnail({ subjectId: "subject-a", noteId: "note-a" }),
  ];

  await Promise.all(writeCalls.map((call) => assert.rejects(call, /Readonly mode does not allow writes/)));
});
