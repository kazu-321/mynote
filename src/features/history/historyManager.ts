import type { CanvasCommand, CanvasEditorState } from "./commandTypes";

export class HistoryManager {
  private readonly past: CanvasCommand[] = [];

  private readonly future: CanvasCommand[] = [];

  execute(command: CanvasCommand, state: CanvasEditorState) {
    const nextState = command.redo(state);
    if (nextState === state) return state;
    this.past.push(command);
    this.future.length = 0;
    return nextState;
  }

  undo(state: CanvasEditorState) {
    const command = this.past.pop();
    if (!command) return state;
    this.future.push(command);
    return command.undo(state);
  }

  redo(state: CanvasEditorState) {
    const command = this.future.pop();
    if (!command) return state;
    this.past.push(command);
    return command.redo(state);
  }

  clear() {
    this.past.length = 0;
    this.future.length = 0;
  }
}
