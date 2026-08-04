import { vec } from './core/geometry/vec2';
import { pick } from './core/geometry/hit';
import { createDocument, findBond, type Document } from './core/model/document';
import { ACS1996 } from './core/style/presets';
import type { StyleSheet } from './core/style/stylesheet';
import type { Command } from './core/commands/command';
import { History } from './core/commands/history';
import { SetBondOrder } from './core/commands/ops';
import { renderDocument } from './render/renderer';
import { clientToPt } from './render/viewport';
import type { Decoration } from './render/decorators';
import { BondTool } from './interaction/tools/bond';
import type { PointerInfo, Tool, ToolContext } from './interaction/tools';
import { handleKeyDown } from './interaction/keyboard';

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface EditorConfig {
  style?: StyleSheet;
  document?: Document;
  onHistoryChange?: (canUndo: boolean, canRedo: boolean) => void;
}

export class Editor implements ToolContext {
  readonly style: StyleSheet;
  private readonly history: History;
  private readonly tool: Tool;
  private readonly svg: SVGSVGElement;
  private decorations: Decoration[] = [];
  private nextId: number;
  private lastPointer: PointerInfo | null = null;
  private readonly onHistoryChange: ((canUndo: boolean, canRedo: boolean) => void) | undefined;

  constructor(mount: HTMLElement, config: EditorConfig = {}) {
    this.style = config.style ?? ACS1996;
    const initial = config.document ?? createDocument();
    this.history = new History(initial);
    this.nextId = initial.meta.nextId;
    this.onHistoryChange = config.onHistoryChange;
    this.tool = new BondTool();

    this.svg = document.createElementNS(SVG_NS, 'svg');
    this.svg.setAttribute('class', 'canvas');
    mount.appendChild(this.svg);

    this.attachPointer(mount);
    this.attachKeyboard();
    this.render();
  }

  get document(): Document {
    return this.history.document;
  }

  commit(command: Command): void {
    this.history.commit(command);
    this.render();
  }

  allocIds(n: number): number[] {
    const ids = Array.from({ length: n }, (_, i) => this.nextId + i);
    this.nextId += n;
    return ids;
  }

  setDecorations(decorations: Decoration[]): void {
    this.decorations = decorations;
    this.render();
  }

  undo(): void {
    if (this.history.undo()) this.render();
  }

  redo(): void {
    if (this.history.redo()) this.render();
  }

  private render(): void {
    renderDocument(document, this.svg, this.history.document, this.style, this.decorations);
    this.onHistoryChange?.(this.history.canUndo, this.history.canRedo);
  }

  private toPtSpace(e: PointerEvent): PointerInfo {
    const rect = this.svg.getBoundingClientRect();
    const vb = this.svg.viewBox.baseVal;
    return {
      pos: clientToPt(vec(e.clientX, e.clientY), rect, vb),
      alt: e.altKey,
      shift: e.shiftKey,
    };
  }

  private attachPointer(mount: HTMLElement): void {
    mount.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      mount.setPointerCapture(e.pointerId);
      this.lastPointer = this.toPtSpace(e);
      this.tool.onDown?.(this.lastPointer, this);
    });
    mount.addEventListener('pointermove', (e) => {
      const info = this.toPtSpace(e);
      this.lastPointer = info;
      if (e.buttons & 1) this.tool.onMove?.(info, this);
      else this.tool.onHover?.(info, this);
    });
    mount.addEventListener('pointerup', (e) => {
      if (!this.lastPointer) return;
      this.tool.onUp?.(this.toPtSpace(e), this);
      this.lastPointer = null;
    });
  }

  private attachKeyboard(): void {
    window.addEventListener('keydown', (e) => {
      const handled = handleKeyDown(e, {
        undo: () => this.undo(),
        redo: () => this.redo(),
        setBondOrder: (order) => {
          if (!this.lastPointer) return;
          const hit = pick(this.document, this.lastPointer.pos, { atomRadius: 5, bondTolerance: 3 });
          if (hit?.kind === 'bond' && findBond(this.document, hit.id)) {
            this.commit(new SetBondOrder(hit.id, order));
          }
        },
      });
      if (handled) e.preventDefault();
    });
  }
}
