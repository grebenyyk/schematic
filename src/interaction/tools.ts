import type { Vec2 } from '../core/geometry/vec2';
import type { Document } from '../core/model/document';
import type { StyleSheet } from '../core/style/stylesheet';
import type { Command } from '../core/commands/command';
import type { Decoration } from '../render/decorators';

export interface PointerInfo {
  pos: Vec2; // pt-space (style points), not pixels
  alt: boolean;
  shift: boolean;
}

export interface Selection {
  atoms: Set<number>;
  bonds: Set<number>;
}

export interface ToolContext {
  readonly document: Document;
  readonly style: StyleSheet;
  commit(command: Command): void;
  /** Reserve n fresh ids for atoms/bonds a gesture is about to create. */
  allocIds(n: number): number[];
  setDecorations(decorations: Decoration[]): void;
  getSelection(): Selection;
  setSelection(selection: Selection): void;
  /** Show the selection translated by delta as a live preview (null = off). */
  setPreviewMove(delta: Vec2 | null): void;
  /** Show the selection rotated around center as a live preview (null = off). */
  setPreviewRotate(preview: { center: Vec2; angle: number } | null): void;
}

export interface Tool {
  onDown?(e: PointerInfo, ctx: ToolContext): void;
  onMove?(e: PointerInfo, ctx: ToolContext): void;
  onUp?(e: PointerInfo, ctx: ToolContext): void;
  onHover?(e: PointerInfo, ctx: ToolContext): void;
}
