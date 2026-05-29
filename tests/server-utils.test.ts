import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ApiError } from "../server/utils/errors";
import { readJsonFile, writeJsonFile } from "../server/utils/json";
import { dataRoot, manifestPath, noteDataPath, noteMetaPath, subjectPath } from "../server/utils/paths";

test("server path helpers point under public/data", () => {
  assert.match(dataRoot, /public[\\/]data$/);
  assert.equal(manifestPath.endsWith("public/data/manifest.json") || manifestPath.endsWith("public\\data\\manifest.json"), true);
  assert.equal(subjectPath("subject-a").endsWith("public/data/subjects/subject-a.json") || subjectPath("subject-a").endsWith("public\\data\\subjects\\subject-a.json"), true);
  assert.equal(noteMetaPath("subject-a", "note-a").includes("notes"), true);
  assert.equal(noteDataPath("subject-a", "note-a").includes("notes"), true);
});

test("writeJsonFile creates directories and readJsonFile round-trips data", async () => {
  const root = await mkdtemp(join(tmpdir(), "mynote-json-"));
  try {
    const filePath = join(root, "nested", "payload.json");
    const payload = { hello: "world", count: 3 };
    await writeJsonFile(filePath, payload);
    assert.deepEqual(await readJsonFile(filePath), payload);
    assert.deepEqual(JSON.parse(await readFile(filePath, "utf8")), payload);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ApiError keeps status and message", () => {
  const error = new ApiError(418, "teapot");
  assert.equal(error.status, 418);
  assert.equal(error.message, "teapot");
});
