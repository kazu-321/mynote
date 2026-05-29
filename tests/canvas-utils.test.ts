import assert from "node:assert/strict";
import test from "node:test";
import { screenToWorld, snapToStep, worldToScreen } from "../src/features/canvas/utils/coordinates";

test("screen and world coordinates round-trip through the viewport", () => {
  const viewport = { x: 120, y: -80, scale: 2 };
  const worldPoint = { x: -15.5, y: 32 };

  const screenPoint = worldToScreen(worldPoint, viewport);

  assert.deepEqual(screenPoint, { x: 89, y: -16 });
  assert.deepEqual(screenToWorld(screenPoint, viewport), worldPoint);
});

test("snapToStep rounds to the nearest positive step", () => {
  assert.equal(snapToStep(14.9, 10), 10);
  assert.equal(snapToStep(15.1, 10), 20);
  assert.equal(snapToStep(12.5, 0), 12.5);
  assert.equal(snapToStep(12.5, -4), 12.5);
});
