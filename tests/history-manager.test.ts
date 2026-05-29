import assert from "node:assert/strict";
import test from "node:test";
import { createSnapshotCanvasCommand } from "../src/features/history/commandTypes";
import { HistoryManager } from "../src/features/history/historyManager";

const initialState = {
  elements: [],
  grid: { mode: "free" as const, snapStep: 10, gridSize: 100, visible: false },
};

test("history manager executes, undoes, and redoes commands", () => {
  const history = new HistoryManager();
  const nextState = {
    ...initialState,
    grid: { ...initialState.grid, mode: "assisted" as const },
  };
  const command = createSnapshotCanvasCommand("toggle grid", initialState, nextState);
  const applied = history.execute(command, initialState);
  assert.deepEqual(applied, nextState);
  const undone = history.undo(applied);
  assert.deepEqual(undone, initialState);
  const redone = history.redo(undone);
  assert.deepEqual(redone, nextState);
});
