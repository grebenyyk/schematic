import { vec, type Vec2 } from './core/geometry/vec2';
import { pick } from './core/geometry/hit';
import { createDocument, findAtom, findBond, allAtoms, type Document } from './core/model/document';
import { ACS1996 } from './core/style/presets';
import type { StyleSheet } from './core/style/stylesheet';
import type { Atom, Molecule } from './core/model/molecule';
import type { Command } from './core/commands/command';
import { History } from './core/commands/history';
import { SetBondOrder, SetElement, SetCharge, AddAtom, AddBond, AddArrow, AddPlus, DeleteAtoms, DeleteBonds, DeleteArrows, DeletePluses, MoveAtoms, MoveArrows, MovePluses, RotateAtoms } from './core/commands/ops';
import { parseSmiles } from './core/chem/smiles';
import { layoutMolecule } from './core/chem/layout';
import { serializeSelection, parseSelectionBlob, type SelectionBlob } from './core/clipboard';
import { CompoundCommand } from './core/commands/command';
import { ElementTyper } from './interaction/element-typer';
import { canSetBondOrder, chargeForElement } from './core/chem/valence';
import { selectionDecorations } from './interaction/tools/select';
import type { Selection } from './interaction/tools';
import { renderDocument, contentViewBox } from './render/renderer';
import { clientToPt, updateCamera, panCamera, zoomCamera, clampZoomFactor, type Camera } from './render/viewport';
import type { Decoration } from './render/decorators';
import { BondTool } from './interaction/tools/bond';
import { ChainTool } from './interaction/tools/chain';
import { SelectTool } from './interaction/tools/select';
import { ViewportTool } from './interaction/tools/viewport';
import { RingTool } from './interaction/tools/ring';
import type { PointerInfo, Tool, ToolContext } from './interaction/tools';
import { handleKeyDown } from './interaction/keyboard';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Wheel deltaY → zoom factor: exp(-deltaY * rate). ~15% per mouse notch, smooth on trackpad. */
const ZOOM_RATE = 0.0015;

export interface EditorConfig {
  style?: StyleSheet;
  document?: Document;
  onHistoryChange?: (canUndo: boolean, canRedo: boolean) => void;
  onDocumentChange?: (doc: Document, selection: Selection) => void;
  /** Tool hotkeys: 'v' always fires, 'b' only when the bond tool isn't active. */
  onToolShortcut?: (key: 'v' | 'b') => void;
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
  private readonly onToolShortcut: ((key: 'v' | 'b') => void) | undefined;
  private readonly onDocumentChange: ((doc: Document, selection: Selection) => void) | undefined;

  constructor(mount: HTMLElement, config: EditorConfig = {}) {
    this.style = config.style ?? ACS1996;
    const initial = config.document ?? createDocument();
    this.history = new History(initial);
    this.nextId = initial.meta.nextId;
    this.onHistoryChange = config.onHistoryChange;
    this.onDocumentChange = config.onDocumentChange;
    this.onToolShortcut = config.onToolShortcut;
    this.tool = new BondTool();

    this.svg = document.createElementNS(SVG_NS, 'svg');
    this.svg.setAttribute('class', 'canvas');
    this.svg.setAttribute('preserveAspectRatio', 'xMinYMin meet');
    mount.appendChild(this.svg);

    this.attachPointer(mount);
    this.attachKeyboard();
    this.attachPaste();
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

  private get toolKind(): 'bond' | 'chain' | 'select' | 'viewport' | 'ring' {
    if (this.tool instanceof SelectTool) return 'select';
    if (this.tool instanceof ChainTool) return 'chain';
    if (this.tool instanceof ViewportTool) return 'viewport';
    if (this.tool instanceof RingTool) return 'ring';
    return 'bond';
  }

  private draggingSelected = false;

  private overSelected(): boolean {
    if (!this.lastPointer) return false;
    const hit = pick(this.document, this.lastPointer.pos, { atomRadius: 5, bondTolerance: 3 });
    if (!hit) return false;
    return (
      (hit.kind === 'atom' && this.selection.atoms.has(hit.id)) ||
      (hit.kind === 'bond' && this.selection.bonds.has(hit.id)) ||
      (hit.kind === 'arrow' && (this.selection.arrows?.has(hit.id) ?? false)) ||
      (hit.kind === 'plus' && (this.selection.pluses?.has(hit.id) ?? false))
    );
  }

  private updateCursor(): void {
    const host = this.svg.parentElement;
    if (!host) return;
    if (this.toolKind === 'viewport') {
      host.style.cursor = this.panning ? 'grabbing' : 'grab';
    } else if (this.toolKind === 'select') {
      host.style.cursor = this.draggingSelected
        ? 'grabbing'
        : this.overSelected() ? 'grab' : 'default';
    } else {
      host.style.cursor = 'crosshair';
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
    this.setSelection({
      atoms,
      bonds,
      arrows: new Set(this.document.arrows.map((a) => a.id)),
      pluses: new Set(this.document.pluses.map((p) => p.id)),
    });
  }

  /** Replace the whole document (import, demos, tests). Clears history. */
  loadDocument(doc: Document): void {
    this.history = new History(doc);
    this.nextId = doc.meta.nextId;
    this.decorations = [];
    this.camera = null;
    this.cameraManual = false;
    this.render();
  }

  /** Reset the camera to fit all content (undo a manual pan/zoom). */
  fitToContent(): void {
    this.cameraManual = false;
    this.camera = null;
    this.render();
  }

  /**
   * Append laid-out molecules as new fragments, translated to sit just right of
   * the existing content, as one undoable command. Selects the pasted atoms.
   */
  addMolecules(mols: Molecule[]): void {
    if (mols.length === 0) return;
    const doc = this.document;
    let maxX = -Infinity;
    for (const a of allAtoms(doc)) maxX = Math.max(maxX, a.pos.x);
    const gap = this.style.bondLengthPt * 2;
    let cursorX = Number.isFinite(maxX) ? maxX + gap : 0;

    const commands: Command[] = [];
    const newAtoms: number[] = [];
    const newBonds: number[] = [];
    let nextMolIndex = doc.molecules.length;

    for (const mol of mols) {
      if (mol.atoms.size === 0) continue;
      let minX = Infinity;
      let fragMaxX = -Infinity;
      for (const a of mol.atoms.values()) {
        minX = Math.min(minX, a.pos.x);
        fragMaxX = Math.max(fragMaxX, a.pos.x);
      }
      const dx = cursorX - minX;
      cursorX += (Number.isFinite(fragMaxX) ? fragMaxX - minX : 0) + gap;

      const molIndex = nextMolIndex++;
      const idMap = new Map<number, number>();
      const ids = this.allocIds(mol.atoms.size + mol.bonds.size);
      let i = 0;
      let first = true;
      for (const a of mol.atoms.values()) {
        const id = ids[i++];
        idMap.set(a.id, id);
        newAtoms.push(id);
        const atom: Atom = { id, element: a.element, charge: a.charge, pos: { x: a.pos.x + dx, y: a.pos.y } };
        if (a.hydrogens !== undefined) atom.hydrogens = a.hydrogens;
        if (a.isotope !== undefined) atom.isotope = a.isotope;
        commands.push(new AddAtom(atom, first ? null : molIndex));
        first = false;
      }
      for (const b of mol.bonds.values()) {
        const id = ids[i++];
        newBonds.push(id);
        commands.push(new AddBond(
          { id, a: idMap.get(b.a)!, b: idMap.get(b.b)!, order: b.order, stereo: b.stereo }, molIndex));
      }
    }

    if (commands.length === 0) return;
    this.commit(new CompoundCommand(commands, 'Paste'));
    this.setSelection({ atoms: new Set(newAtoms), bonds: new Set(newBonds) });
    this.fitToContent();
    // switch to the select tool so the freshly pasted (selected) molecule can be moved immediately
    this.onToolShortcut?.('v');
  }

  /** Paste: a MOL blob (Phase D) or a SMILES string → laid-out fragments. */
  pasteText(text: string): void {
    const mols = parseSmiles(text.trim()).filter((m) => m.atoms.size > 0);
    if (mols.length === 0) return;
    for (const mol of mols) layoutMolecule(mol, this.style.bondLengthPt);
    this.addMolecules(mols);
  }

  /** Copy the current selection to the clipboard as a `schematic:` blob. */
  copySelection(): boolean {
    const sel = this.selection;
    const empty = sel.atoms.size === 0 && sel.bonds.size === 0 &&
      (sel.arrows?.size ?? 0) === 0 && (sel.pluses?.size ?? 0) === 0;
    if (empty) return false;
    void navigator.clipboard?.writeText('schematic:' + JSON.stringify(serializeSelection(this.document, sel)));
    return true;
  }

  /** Duplicate a selection blob one bond down-right of its source; select it. */
  private pasteSelection(blob: SelectionBlob): void {
    if (blob.atoms.length === 0 && blob.arrows.length === 0 && blob.pluses.length === 0) return;
    // the blob holds the source's positions; land the copy one bond down-right of it
    const dx = this.style.bondLengthPt;
    const dy = this.style.bondLengthPt;
    const doc = this.document;

    const atomN = blob.atoms.length;
    const bondN = blob.bonds.length;
    const arrowN = blob.arrows.length;
    const ids = this.allocIds(atomN + bondN + arrowN + blob.pluses.length);
    let i = 0;
    const idMap = new Map<number, number>();
    const commands: Command[] = [];
    const molIndex = doc.molecules.length;
    let appended = false;
    for (const a of blob.atoms) {
      const id = ids[i++];
      idMap.set(a.id, id);
      const atom: Atom = { id, element: a.element, charge: a.charge, pos: { x: a.x + dx, y: a.y + dy } };
      if (a.hydrogens !== null) atom.hydrogens = a.hydrogens;
      if (a.isotope !== undefined) atom.isotope = a.isotope;
      commands.push(new AddAtom(atom, appended ? molIndex : null));
      appended = true;
    }
    for (const b of blob.bonds) {
      const id = ids[i++];
      commands.push(new AddBond(
        { id, a: idMap.get(b.a)!, b: idMap.get(b.b)!, order: b.order, stereo: b.stereo }, molIndex));
    }
    for (const ar of blob.arrows) {
      const id = ids[i++];
      commands.push(new AddArrow({ id, from: { x: ar.fx + dx, y: ar.fy + dy }, to: { x: ar.tx + dx, y: ar.ty + dy } }));
    }
    for (const p of blob.pluses) {
      const id = ids[i++];
      commands.push(new AddPlus({ id, pos: { x: p.x + dx, y: p.y + dy } }));
    }

    this.commit(new CompoundCommand(commands, 'Paste'));
    this.setSelection({
      atoms: new Set([...idMap.values()]),
      bonds: new Set(ids.slice(atomN, atomN + bondN)),
      arrows: new Set(ids.slice(atomN + bondN, atomN + bondN + arrowN)),
      pluses: new Set(ids.slice(atomN + bondN + arrowN)),
    });
    // the copy is adjacent to the source (already in view); no refit needed
    this.onToolShortcut?.('v');
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
  private lastSelection: Selection | null = null;
  private camera: Camera | null = null;
  // once the user pans/zoomes, hold the camera fixed so the auto-fit can't snap it back
  private cameraManual = false;
  private panning = false;
  private panStartClient: Vec2 | null = null;
  private panStartCamera: Camera | null = null;
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

  private renderScheduled = false;

  /** Coalesce renders to one per animation frame — pointermove during a drag
   * can fire far faster than the screen refreshes, and each render rebuilds the
   * whole SVG, so without this the view throttles behind the cursor. */
  private render(): void {
    if (this.renderScheduled) return;
    this.renderScheduled = true;
    const run = (): void => {
      this.renderScheduled = false;
      this.renderNow();
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
    else run();
  }

  private renderNow(): void {
    const base = this.history.document;
    // during a move/rotate drag, render the selection transformed
    let doc = base;
    const sel = this.selection;
    const previewingMove = this.previewDelta !== null &&
      (sel.atoms.size > 0 || (sel.arrows?.size ?? 0) > 0 || (sel.pluses?.size ?? 0) > 0);
    const previewingRotate = this.previewRotate !== null && this.selection.atoms.size > 0;
    if (previewingMove) {
      let d = base;
      const delta = this.previewDelta!;
      if (sel.atoms.size) d = new MoveAtoms([...sel.atoms], delta).do(d);
      if (sel.arrows?.size) d = new MoveArrows([...sel.arrows], delta).do(d);
      if (sel.pluses?.size) d = new MovePluses([...sel.pluses], delta).do(d);
      doc = d;
    } else if (previewingRotate) {
      doc = new RotateAtoms(
        [...this.selection.atoms], this.previewRotate!.center, this.previewRotate!.angle).do(base);
    }
    // The auto-fit runs only when the view is free: not after a manual pan/zoom,
    // not during a preview gesture, and not while the select tool is active.
    // Moving/rotating a selection must never chase or jiggle the view — with a
    // dedicated pan/zoom tool and Ctrl+0 fit, the select tool freezes the camera
    // for its whole lifetime (including the release frame that used to re-fit).
    const rect = this.svg.getBoundingClientRect();
    const previewing = previewingMove || previewingRotate;
    const frozen = this.cameraManual || previewing || this.toolKind === 'select';
    if (!this.camera || !frozen) {
      this.camera = updateCamera(
        this.camera, contentViewBox(doc, this.style), rect.width || 1, rect.height || 1);
    }
    const viewBox = {
      x: this.camera.x,
      y: this.camera.y,
      width: this.camera.scale * (rect.width || 1),
      height: this.camera.scale * (rect.height || 1),
    };
    let selDecos = selectionDecorations(doc, this.selection, this.style);
    if (this.previewRotate) selDecos = selDecos.filter((d) => d.type !== 'rotate-handle');
    renderDocument(document, this.svg, doc, this.style,
      [...selDecos, ...this.decorations], viewBox);
    this.onHistoryChange?.(this.history.canUndo, this.history.canRedo);
    if (base !== this.lastRenderedDoc || this.selection !== this.lastSelection) {
      this.lastRenderedDoc = base;
      this.lastSelection = this.selection;
      this.onDocumentChange?.(base, this.selection);
    }
  }

  private toPtSpace(e: PointerEvent): PointerInfo {
    const rect = this.svg.getBoundingClientRect();
    const vb = this.svg.viewBox.baseVal;
    return {
      pos: clientToPt(vec(e.clientX, e.clientY), rect, vb),
      alt: e.altKey,
      shift: e.shiftKey,
      meta: e.metaKey,
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
      if (this.toolKind === 'viewport' && this.camera) {
        this.panning = true;
        this.panStartClient = vec(e.clientX, e.clientY);
        this.panStartCamera = { ...this.camera };
      }
      this.tool.onDown?.(this.lastPointer, this);
      this.updateCursor();
    });
    mount.addEventListener('pointermove', (e) => {
      if (this.panning) {
        this.applyPan(e.clientX, e.clientY);
        this.updateCursor();
        return;
      }
      const info = this.toPtSpace(e);
      this.lastPointer = info;
      if (e.buttons & 1) this.tool.onMove?.(info, this);
      else this.tool.onHover?.(info, this);
      this.updateCursor();
    });
    mount.addEventListener('pointerup', (e) => this.finishGesture(e));
    // A trackpad/touch gesture the browser co-opts fires pointercancel, not
    // pointerup. Without this, the in-flight lasso/preview never commits and
    // its decoration freezes on screen — finalize it as if the pointer lifted.
    mount.addEventListener('pointercancel', (e) => this.finishGesture(e));
    // two-finger scroll / wheel zooms toward the cursor (works in every tool)
    mount.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
  }

  private finishGesture(e: PointerEvent): void {
    if (!this.lastPointer) return;
    this.tool.onUp?.(this.toPtSpace(e), this);
    this.lastPointer = null;
    this.draggingSelected = false;
    this.panning = false;
    this.panStartClient = null;
    this.panStartCamera = null;
    this.updateCursor();
  }

  /** Pan so the world point grabbed at pointerdown stays under the cursor. */
  private applyPan(clientX: number, clientY: number): void {
    if (!this.panStartCamera || !this.panStartClient) return;
    this.camera = panCamera(
      this.panStartCamera,
      clientX - this.panStartClient.x,
      clientY - this.panStartClient.y,
    );
    this.cameraManual = true;
    this.render();
  }

  /** Zoom toward the cursor: the point under the cursor stays pinned. */
  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    if (!this.camera) return;
    const rect = this.svg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const factor = clampZoomFactor(this.camera.scale, Math.exp(-e.deltaY * ZOOM_RATE));
    const anchor = {
      x: this.camera.x + (e.clientX - rect.left) * this.camera.scale,
      y: this.camera.y + (e.clientY - rect.top) * this.camera.scale,
    };
    this.camera = zoomCamera(this.camera, anchor, factor);
    this.cameraManual = true;
    this.render();
  }

  private readonly typer = new ElementTyper((el) => this.applyElement(el));

  /** Element typed over an atom replaces it; over empty space places a new atom. */
  private applyElement(element: string): void {
    if (!this.lastPointer) return;
    const hit = pick(this.document, this.lastPointer.pos, { atomRadius: 5, bondTolerance: 3 });
    if (hit?.kind === 'atom') {
      const loc = findAtom(this.document, hit.id)!;
      // hypervalent replacements carry the charge that keeps them legal
      const charge = chargeForElement(
        this.document.molecules[loc.moleculeIndex], hit.id, element);
      const commands: Command[] = [new SetElement(hit.id, element)];
      if (charge !== loc.atom.charge) commands.push(new SetCharge(hit.id, charge));
      this.commit(new CompoundCommand(commands, 'Set element'));
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
      if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        this.fitToContent();
        e.preventDefault();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        if (this.copySelection()) e.preventDefault();
        return;
      }
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        if (this.tool.onKey?.(e.key, this)) { e.preventDefault(); return; }
        if (e.key === 'v' && this.onToolShortcut) { this.onToolShortcut('v'); e.preventDefault(); return; }
        if (e.key === 'b' && this.toolKind !== 'bond' && this.onToolShortcut) {
          this.onToolShortcut('b');
          e.preventDefault();
          return;
        }
        if (e.key === '+' || e.key === '=') { this.applyCharge(1); e.preventDefault(); return; }
        if (e.key === '-') { this.applyCharge(-1); e.preventDefault(); return; }
        if (/^[a-zA-Z]$/.test(e.key) && this.typer.key(e.key)) { e.preventDefault(); return; }
      }
      const handled = handleKeyDown(e, {
        undo: () => this.undo(),
        redo: () => this.redo(),
        delete: () => {
          const sel = this.selection;
          const hasSel = sel.atoms.size > 0 || sel.bonds.size > 0 ||
            (sel.arrows?.size ?? 0) > 0 || (sel.pluses?.size ?? 0) > 0;
          if (hasSel) {
            const commands: Command[] = [];
            if (sel.atoms.size > 0) commands.push(new DeleteAtoms([...sel.atoms]));
            if (sel.bonds.size > 0) commands.push(new DeleteBonds([...sel.bonds]));
            if (sel.arrows?.size) commands.push(new DeleteArrows([...sel.arrows]));
            if (sel.pluses?.size) commands.push(new DeletePluses([...sel.pluses]));
            this.commit(new CompoundCommand(commands, 'Delete selection'));
            this.setSelection({ atoms: new Set(), bonds: new Set() });
            return;
          }
          if (!this.lastPointer) return;
          const hit = pick(this.document, this.lastPointer.pos, { atomRadius: 5, bondTolerance: 3 });
          if (hit?.kind === 'atom') this.commit(new DeleteAtoms([hit.id]));
          else if (hit?.kind === 'bond') this.commit(new DeleteBonds([hit.id]));
          else if (hit?.kind === 'arrow') this.commit(new DeleteArrows([hit.id]));
          else if (hit?.kind === 'plus') this.commit(new DeletePluses([hit.id]));
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

  /** Paste: a copied selection (schematic: blob) wins; otherwise SMILES. */
  private attachPaste(): void {
    window.addEventListener('paste', (e) => {
      const text = (e.clipboardData?.getData('text/plain') ?? '').trim();
      if (text.startsWith('schematic:')) {
        const blob = parseSelectionBlob(text.slice('schematic:'.length));
        if (blob && (blob.atoms.length || blob.arrows.length || blob.pluses.length)) {
          e.preventDefault();
          this.pasteSelection(blob);
          return;
        }
      }
      // otherwise treat as SMILES if it's SMILES-shaped (no prose/spaces) and parses
      if (!text || !/^[A-Za-z0-9[\]()=:#\\/%.+@-]+$/.test(text)) return;
      const mols = parseSmiles(text).filter((m) => m.atoms.size > 0);
      if (mols.length === 0) return;
      e.preventDefault();
      for (const mol of mols) layoutMolecule(mol, this.style.bondLengthPt);
      this.addMolecules(mols);
    });
  }
}
