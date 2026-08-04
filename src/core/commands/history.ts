import type { Document } from '../model/document';
import type { Command } from './command';

export class History {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];

  constructor(private doc: Document) {}

  get document(): Document {
    return this.doc;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** The one mutation path: apply a command and push it on the undo stack. */
  commit(command: Command): void {
    this.doc = command.do(this.doc);
    this.undoStack.push(command);
    this.redoStack = [];
  }

  undo(): boolean {
    const command = this.undoStack.pop();
    if (!command) return false;
    this.doc = command.undo(this.doc);
    this.redoStack.push(command);
    return true;
  }

  redo(): boolean {
    const command = this.redoStack.pop();
    if (!command) return false;
    this.doc = command.do(this.doc);
    this.undoStack.push(command);
    return true;
  }
}
