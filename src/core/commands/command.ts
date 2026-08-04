import type { Document } from '../model/document';

export interface Command {
  do(doc: Document): Document;   // pure: returns new document
  undo(doc: Document): Document; // inverse
  label?: string | undefined;    // for a future undo menu ("Draw bond")
}

/** Groups a whole pointer gesture into one undoable unit. */
export class CompoundCommand implements Command {
  constructor(
    private readonly commands: Command[],
    public readonly label?: string,
  ) {}

  do(doc: Document): Document {
    return this.commands.reduce((d, c) => c.do(d), doc);
  }

  undo(doc: Document): Document {
    return [...this.commands].reverse().reduce((d, c) => c.undo(d), doc);
  }
}
