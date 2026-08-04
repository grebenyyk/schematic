export interface KeyEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

export interface KeyController {
  undo(): void;
  redo(): void;
  /** Set bond order of the currently hovered bond (no-op when none). */
  setBondOrder(order: 1 | 2 | 3): void;
  /** Delete the currently hovered atom/bond (no-op when none). */
  delete(): void;
  /** Ctrl+A. */
  selectAll(): void;
  /** Esc. */
  clearSelection(): void;
}

/** Returns true when the key was handled (caller should preventDefault). */
export function handleKeyDown(e: KeyEvent, controller: KeyController): boolean {
  const mod = e.ctrlKey || e.metaKey;

  if (!mod && (e.key === '1' || e.key === '2' || e.key === '3')) {
    controller.setBondOrder(Number(e.key) as 1 | 2 | 3);
    return true;
  }
  if (!mod && (e.key === 'Delete' || e.key === 'Backspace')) {
    controller.delete();
    return true;
  }
  if (mod && e.key.toLowerCase() === 'a') {
    controller.selectAll();
    return true;
  }
  if (!mod && e.key === 'Escape') {
    controller.clearSelection();
    return true;
  }
  if (mod && e.key.toLowerCase() === 'z') {
    if (e.shiftKey) controller.redo();
    else controller.undo();
    return true;
  }
  if (mod && e.key.toLowerCase() === 'y') {
    controller.redo();
    return true;
  }
  return false;
}
