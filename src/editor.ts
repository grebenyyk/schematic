import { vec, type Vec2 } from './core/geometry/vec2';
import { pick } from './core/geometry/hit';
import { createDocument, findAtom, findBond, type Document } from './core/model/document';
import { ACS1996 } from './core/style/presets';
import type { StyleSheet } from './core/style/stylesheet';
import type { Command } from './core/commands/command';
import { History } from './core/commands/history';
import { SetBondOrder, SetElement, SetCharge, AddAtom, DeleteAtoms, DeleteBonds, MoveAtoms, RotateAtoms } from './core/commands/ops';
import { CompoundCommand } from './core/commands/command';
import { ElementTyper } from './interaction/element-typer';
import { canSetBondOrder } from './core/chem/valence';
import { selectionDecorations } from './interaction/tools/select';
import type { Selection } from './interaction/tools';
import { renderDocument, contentViewBox } from './render/renderer';
import { clientToPt, updateCamera, type Camera } from './render/viewport';
import type { Decoration } from './render/decorators';
import { BondTool } from './interaction/tools/bond';
import { ChainTool } from './interaction/tools/chain';
import { SelectTool } from './interaction/tools/select';
import type { PointerInfo, Tool, ToolContext } from './interaction/tools';
import { handleKeyDown } from './interaction/keyboard';

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface EditorConfig {
  style?: StyleSheet;
  document?: Document;
  onHistoryChange?: (canUndo: boolean, canRedo: boolean) => void;
  onDocumentChange?: (doc: Document) => void;
}

export class Editor implements ToolContext {
  readonly style: StyleSheet;
  private history: History;
  private tool: Tool;
  private readonly svg: SVGSVGElement;
  private decorations: Decoration[] = [];
  private nextId: number;
  private lastPointer: PointerInfo | null = null;
  private readonly onHistoryChange: ((canUndo: boolean, canRedo: boolean) => void) | undefined;
  private readonly onDocumentChange: ((doc: Document) => void) | undefined;

  constructor(mount: HTMLElement, config: EditorConfig = {}) {
    this.style = config.style ?? ACS1996;
    const initial = config.document ?? createDocument();
    this.history = new History(initial);
    this.nextId = initial.meta.nextId;
    this.onHistoryChange = config.onHistoryChange;
    this.onDocumentChange = config.onDocumentChange;
    this.tool = new BondTool();

    this.svg = document.createElementNS(SVG_NS, 'svg');
    this.svg.setAttribute('class', 'canvas');
    this.svg.setAttribute('preserveAspectRatio', 'xMinYMin meet');
    mount.appendChild(this.svg);

    this.attachPointer(mount);
    this.attachKeyboard();
    this.render();
  }

  get document(): Document {
    return this.history.document;
  }

  setTool(tool: Tool): void {
    this.tool = tool;
    this.decorations = [];
    this.updateCursor();
    this.render();
  }

  private get toolKind(): 'bond' | 'chain' | 'select' {
    if (this.tool instanceof SelectTool) return 'select';
    if (this.tool instanceof ChainTool) return 'chain';
    return 'bond';
  }

  private draggingSelected = false;

  private overSelected(): boolean {
    if (!this.lastPointer) return false;
    const hit = pick(this.document, this.lastPointer.pos, { atomRadius: 5, bondTolerance: 3 });
    if (!hit) return false;
    return hit.kind === 'atom'
      ? this.selection.atoms.has(hit.id)
      : this.selection.bonds.has(hit.id);
  }

  private updateCursor(): void {
    const host = this.svg.parentElement;
    if (!host) return;
    if (this.toolKind !== 'select') {
      host.style.cursor = 'crosshair';
    } else if (this.draggingSelected) {
      host.style.cursor = 'grabbing';
    } else if (this.overSelected()) {
      host.style.cursor = 'grab';
    } else {
      host.style.cursor = 'default';
    }
  }

  private selection: Selection = { atoms: new Set(), bonds: new Set() };

  getSelection(): Selection {
    return this.selection;
  }

  setSelection(selection: Selection): void {
    this.selection = selection;
    this.render();
  }

  selectAll(): void {
    const atoms = new Set<number>();
    const bonds = new Set<number>();
    for (const mol of this.document.molecules) {
      for (const a of mol.atoms.values()) atoms.add(a.id);
      for (const b of mol.bonds.values()) bonds.add(b.id);
    }
    this.setSelection({ atoms, bonds });
  }

  /** Replace the whole document (import, demos, tests). Clears history. */
  loadDocument(doc: Document): void {
    this.history = new History(doc);
    this.nextId = doc.meta.nextId;
    this.decorations = [];
    this.render();
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

  private lastRenderedDoc: Document | null = null;
  private camera: Camera | null = null;
  private previewDelta: Vec2 | null = null;
  private previewRotate: { center: Vec2; angle: number } | null = null;

  setPreviewMove(delta: Vec2 | null): void {
    this.previewDelta = delta;
    this.render();
  }

  setPreviewRotate(preview: { center: Vec2; angle: number } | null): void {
    this.previewRotate = preview;
    this.render();
  }

  private render(): void {
    const base = this.history.document;
    // during a move/rotate drag, render the selection transformed
    let doc = base;
    let previewing = false;
    if (this.previewDelta && this.selection.atoms.size > 0) {
      doc = new MoveAtoms([...this.selection.atoms], this.previewDelta).do(base);
      previewing = true;
    } else if (this.previewRotate && this.selection.atoms.size > 0) {
      doc = new RotateAtoms(
        [...this.selection.atoms], this.previewRotate.center, this.previewRotate.angle).do(base);
      previewing = true;
    }
    // anchored, grow-only camera; frozen while a gesture previews
    const rect = this.svg.getBoundingClientRect();
    if (!previewing || !this.camera) {
      this.camera = updateCamera(
        this.camera, contentViewBox(doc, this.style), rect.width || 1, rect.height || 1);
    }
    const viewBox = {
      x: this.camera.x,
      y: this.camera.y,
      width: this.camera.scale * (rect.width || 1),
      height: this.camera.scale * (rect.height || 1),
    };
    let selDecos = selectionDecorations(doc, this.selection);
    if (this.previewRotate) selDecos = selDecos.filter((d) => d.type !== 'rotate-handle');
    renderDocument(document, this.svg, doc, this.style,
      [...selDecos, ...this.decorations], viewBox);
    this.onHistoryChange?.(this.history.canUndo, this.history.canRedo);
    if (base !== this.lastRenderedDoc) {
      this.lastRenderedDoc = base;
      this.onDocumentChange?.(base);
    }
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

  private focusedAt = -Infinity;
  private swallowNextDown = false;

  private attachPointer(mount: HTMLElement): void {
    // a click that activates an unfocused window must not draw: the browser
    // delivers it immediately after the window's focus event
    window.addEventListener('focus', () => {
      this.focusedAt = Date.now();
      this.swallowNextDown = true;
    });
    mount.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if (this.swallowNextDown) {
        this.swallowNextDown = false;
        if (Date.now() - this.focusedAt < 350) return;
      }
      mount.setPointerCapture(e.pointerId);
      this.lastPointer = this.toPtSpace(e);
      this.draggingSelected = this.toolKind === 'select' && this.overSelected();
      this.tool.onDown?.(this.lastPointer, this);
      this.updateCursor();
    });
    mount.addEventListener('pointermove', (e) => {
      const info = this.toPtSpace(e);
      this.lastPointer = info;
      if (e.buttons & 1) this.tool.onMove?.(info, this);
      else this.tool.onHover?.(info, this);
      this.updateCursor();
    });
    mount.addEventListener('pointerup', (e) => {
      if (!this.lastPointer) return;
      this.tool.onUp?.(this.toPtSpace(e), this);
      this.lastPointer = null;
      this.draggingSelected = false;
      this.updateCursor();
    });
  }

  private readonly typer = new ElementTyper((el) => this.applyElement(el));

  /** Element typed over an atom replaces it; over empty space places a new atom. */
  private applyElement(element: string): void {
    if (!this.lastPointer) return;
    const hit = pick(this.document, this.lastPointer.pos, { atomRadius: 5, bondTolerance: 3 });
    if (hit?.kind === 'atom') {
      this.commit(new SetElement(hit.id, element));
    } else {
      const [id] = this.allocIds(1);
      this.commit(new AddAtom(
        { id, element, pos: this.lastPointer.pos, charge: 0, hydrogens: null }, null));
    }
    this.refreshHover();
  }

  private applyCharge(delta: number): void {
    if (!this.lastPointer) return;
    const hit = pick(this.document, this.lastPointer.pos, { atomRadius: 5, bondTolerance: 3 });
    if (hit?.kind !== 'atom') return;
    const atom = findAtom(this.document, hit.id)!.atom;
    this.commit(new SetCharge(hit.id, atom.charge + delta));
    this.refreshHover();
  }

  /** Recompute the hover decoration after keyboard-driven document changes. */
  private refreshHover(): void {
    if (this.lastPointer) this.tool.onHover?.(this.lastPointer, this);
  }

  private attachKeyboard(): void {
    window.addEventListener('keydown', (e) => {
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.key === '+' || e.key === '=') { this.applyCharge(1); e.preventDefault(); return; }
        if (e.key === '-') { this.applyCharge(-1); e.preventDefault(); return; }
        if (/^[a-zA-Z]$/.test(e.key) && this.typer.key(e.key)) { e.preventDefault(); return; }
      }
      const handled = handleKeyDown(e, {
        undo: () => this.undo(),
        redo: () => this.redo(),
        delete: () => {
          const sel = this.selection;
          if (sel.atoms.size > 0 || sel.bonds.size > 0) {
            const commands = [];
            if (sel.atoms.size > 0) commands.push(new DeleteAtoms([...sel.atoms]));
            if (sel.bonds.size > 0) commands.push(new DeleteBonds([...sel.bonds]));
            this.commit(new CompoundCommand(commands, 'Delete selection'));
            this.setSelection({ atoms: new Set(), bonds: new Set() });
            return;
          }
          if (!this.lastPointer) return;
          const hit = pick(this.document, this.lastPointer.pos, { atomRadius: 5, bondTolerance: 3 });
          if (hit?.kind === 'atom') this.commit(new DeleteAtoms([hit.id]));
          else if (hit?.kind === 'bond') this.commit(new DeleteBonds([hit.id]));
          else return;
          this.refreshHover();
        },
        selectAll: () => this.selectAll(),
        clearSelection: () => this.setSelection({ atoms: new Set(), bonds: new Set() }),
        setBondOrder: (order) => {
          if (!this.lastPointer) return;
          const hit = pick(this.document, this.lastPointer.pos, { atomRadius: 5, bondTolerance: 3 });
          if (hit?.kind !== 'bond') return;
          const loc = findBond(this.document, hit.id);
          if (loc && canSetBondOrder(this.document.molecules[loc.moleculeIndex], hit.id, order)) {
            this.commit(new SetBondOrder(hit.id, order));
          }
        },
      });
      if (handled) e.preventDefault();
    });
  }
}
