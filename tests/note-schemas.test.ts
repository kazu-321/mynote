import assert from "node:assert/strict";
import test from "node:test";
import { manifestSchema, noteSchema, noteMetaSchema, subjectSchema } from "../src/features/notes/model/noteSchemas";

const baseTimestamp = "2026-05-30T00:00:00.000Z";

const manifest = {
  schemaVersion: 1,
  appName: "mynote",
  appVersion: "0.1.0",
  subjectOrder: ["subject-a"],
  subjects: [
    {
      id: "subject-a",
      name: "数学",
      path: "subjects/subject-a.json",
    },
  ],
};

const subject = {
  schemaVersion: 1,
  id: "subject-a",
  name: "数学",
  description: "",
  createdAt: baseTimestamp,
  updatedAt: baseTimestamp,
  noteOrder: ["note-a"],
  notes: [
    {
      id: "note-a",
      title: "微分積分",
      metaPath: "notes/subject-a/note-a/meta.json",
      notePath: "notes/subject-a/note-a/note.json",
    },
  ],
};

const noteMeta = {
  schemaVersion: 1,
  id: "note-a",
  subjectId: "subject-a",
  title: "微分積分",
  description: "",
  createdAt: baseTimestamp,
  updatedAt: baseTimestamp,
  thumbnail: "assets/thumbnails/thumbnail.png",
};

const note = {
  schemaVersion: 1,
  id: "note-a",
  subjectId: "subject-a",
  title: "微分積分",
  createdAt: baseTimestamp,
  updatedAt: baseTimestamp,
  canvas: {
    type: "infinite",
    viewport: { x: 0, y: 0, scale: 1 },
    grid: { mode: "free", snapStep: 10, gridSize: 100, visible: false },
    elements: [
      {
        id: "element-a",
        type: "text",
        x: 10,
        y: 20,
        width: 200,
        height: 80,
        rotation: 0,
        zIndex: 1,
        createdAt: baseTimestamp,
        updatedAt: baseTimestamp,
        content: "Hello",
        format: "plain",
        style: {
          fontSize: 18,
          color: "#1f1a17",
          backgroundColor: "rgba(255,255,255,0.96)",
          padding: 12,
        },
      },
      {
        id: "element-b",
        type: "image",
        x: 40,
        y: 120,
        width: 320,
        height: 240,
        rotation: 0,
        zIndex: 2,
        createdAt: baseTimestamp,
        updatedAt: baseTimestamp,
        src: "assets/images/image_001.png",
        sourceType: "image",
      },
    ],
  },
};

test("note schemas accept the phase1 data model", () => {
  assert.deepEqual(manifestSchema.parse(manifest), manifest);
  assert.deepEqual(subjectSchema.parse(subject), subject);
  assert.deepEqual(noteMetaSchema.parse(noteMeta), noteMeta);
  assert.deepEqual(noteSchema.parse(note), note);
});

test("note schema rejects incomplete canvas payloads", () => {
  assert.throws(
    () =>
      noteSchema.parse({
        ...note,
        canvas: {
          ...note.canvas,
          elements: [
            {
              ...note.canvas.elements[0],
              type: "text",
              content: undefined,
            },
          ],
        },
      }),
  );
});
