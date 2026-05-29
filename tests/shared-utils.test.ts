import assert from "node:assert/strict";
import test from "node:test";
import { assert as assertCondition } from "../src/shared/utils/assert";
import { clamp } from "../src/shared/utils/clamp";
import { createUuid } from "../src/shared/utils/id";
import { joinPath } from "../src/shared/utils/path";
import { nowIso } from "../src/shared/utils/time";

test("clamp keeps values inside the inclusive range", () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-1, 0, 10), 0);
  assert.equal(clamp(11, 0, 10), 10);
});

test("joinPath normalizes repeated slashes and skips empty segments", () => {
  assert.equal(joinPath("api", "", "/subjects/", "note"), "api/subjects/note");
});

test("assert throws with the provided message", () => {
  assert.throws(() => assertCondition(false, "boom"), /boom/);
  assert.doesNotThrow(() => assertCondition(true, "boom"));
});

test("createUuid returns a uuid-shaped string", () => {
  assert.match(createUuid(), /^[0-9a-f-]{36}$/i);
});

test("nowIso returns a parseable ISO timestamp", () => {
  assert.doesNotThrow(() => new Date(nowIso()).toISOString());
});
