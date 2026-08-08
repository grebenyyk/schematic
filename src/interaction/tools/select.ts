import { dist, sub, type Vec2 } from '../../core/geometry/vec2';
import { pick } from '../../core/geometry/hit';
import { pointInPolygon } from '../../core/geometry/polygon';
import { MoveAtoms, MoveArrows, MovePluses, RotateAtoms } from '../../core/commands/ops';
import { CompoundCommand, type Command } from '../../core/commands/command';
import type { Document } from '../../core/model/document';
import type { StyleSheet } from '../../core/style/stylesheet';
import { bondDotCenter } from '../../render/renderer';
import { atomSelectionDecoration, type Decoration } from '../../render/decorators';
import type { PointerInfo, Selection, Tool, ToolContext } from '../tools';

const ATOM_RADIUS = 5;
const BOND_TOLERANCE = 3;
const CLICK_THRESHOLD = 2;

export type SelectMode = 'rect' | 'lasso';

type Mode = 'idle' | 'marquee' | 'move' | 'rotate';

/**
 * Marquee/lasso selection: drag on empty space to select, click to select
 * one item (Shift toggles), drag a selected item to move the selection,
 * drag the corner handle to rotate it.
 */
export class SelectTool implements Tool {
  private mode: Mode = 'idle';
  private start: Vec2 | null = null;
  private additive = false;
  private lassoPoints: Vec2[] = [];
  private rotateCenter: Vec2 | null = null;
  private rotateStartAngle = 0;

  constructor(private readonly selectMode: SelectMode = 'rect') {}

  onDown(e: PointerInfo, ctx: ToolContext): void {
    this.start = e.pos;
    this.additive = e.shift || !!e.meta;

    // rotate handle grabs first
    const handle = selectionHandlePos(ctx.document, ctx.getSelection());
    if (handle && dist(handle, e.pos) < HANDLE_HIT_RADIUS) {
      const sel = ctx.getSelection();
      const center = selectionCentroid(ctx.document, sel);
      if (!center) { this.mode = 'idle'; return; }
      this.rotateCenter = center;
      this.rotateStartAngle = Math.atan2(e.pos.y - center.y, e.pos.x - center.x);
      this.mode = 'rotate';
      return;
    }

    const hit = pick(ctx.document, e.pos, { atomRadius: ATOM_RADIUS, bondTolerance: BOND_TOLERANCE });

    if (!hit) {
      if (!this.additive) ctx.setSelection({ atoms: new Set(), bonds: new Set() });
      this.mode = 'marquee';
      this.lassoPoints = [e.pos];
      return;
    }

    const sel = clone(ctx.getSelection());
    const inSelection =
      (hit.kind === 'atom' && sel.atoms.has(hit.id)) ||
      (hit.kind === 'bond' && sel.bonds.has(hit.id)) ||
      (hit.kind === 'arrow' && sel.arrows?.has(hit.id)) ||
      (hit.kind === 'plus' && sel.pluses?.has(hit.id));

    if (this.additive) {
      toggle(sel, hit);
      ctx.setSelection(sel);
      this.mode = 'idle';
      return;
    }
    if (!inSelection) {
      const fresh: Selection = { atoms: new Set(), bonds: new Set() };
      addTo(fresh, hit);
      ctx.setSelection(fresh);
    }
    this.mode = 'move';
  }

  onMove(e: PointerInfo, ctx: ToolContext): void {
    if (!this.start) return;
    if (this.mode === 'marquee') {
      if (this.selectMode === 'lasso') {
        const last = this.lassoPoints[this.lassoPoints.length - 1];
        if (dist(last, e.pos) > 0.5) this.lassoPoints.push(e.pos);
        ctx.setDecorations([{ type: 'lasso', points: [...this.lassoPoints] }]);
      } else {
        ctx.setDecorations([{ type: 'marquee', from: this.start, to: e.pos }]);
      }
    } else if (this.mode === 'move') {
      // preview tracks from the start; the actual move only commits on pointerup
      // if it exceeded the click threshold (onUp), so a click never moves anything
      ctx.setPreviewMove(sub(e.pos, this.start));
    } else if (this.mode === 'rotate' && this.rotateCenter) {
      const c = this.rotateCenter;
      // smooth preview; the 15° snap applies on drop
      const a = Math.atan2(e.pos.y - c.y, e.pos.x - c.x) - this.rotateStartAngle;
      ctx.setPreviewRotate({ center: c, angle: a });
    }
  }

  onUp(e: PointerInfo, ctx: ToolContext): void {
    if (!this.start) return;
    const delta = sub(e.pos, this.start);
    if (this.mode === 'marquee') {
      // A lasso commits whenever a real polygon was drawn: closing the loop
      // back near the start is the normal gesture, not a click. A rectangle
      // still needs an actual drag (start ≈ end is a click that selects nothing).
      const drawn = this.selectMode === 'lasso'
        ? this.lassoPoints.length >= 3
        : dist(this.start, e.pos) > CLICK_THRESHOLD;
      if (drawn) {
        const sel = this.additive ? clone(ctx.getSelection()) : { atoms: new Set<number>(), bonds: new Set<number>() };
        if (this.selectMode === 'lasso') selectInPolygon(ctx, sel, this.lassoPoints);
        else selectInRect(ctx, sel, this.start, e.pos);
        ctx.setSelection(sel);
      }
    } else if (this.mode === 'move') {
      const s = ctx.getSelection();
      // arrows/pluses need superfine positioning to align with molecules, so a
      // drag of any size commits; atom-only selections keep the click threshold
      const fine = (s.arrows?.size ?? 0) > 0 || (s.pluses?.size ?? 0) > 0;
      if (dist(this.start, e.pos) > (fine ? 0 : CLICK_THRESHOLD)) {
        const commands: Command[] = [];
        if (s.atoms.size) commands.push(new MoveAtoms([...s.atoms], delta));
        if (s.arrows?.size) commands.push(new MoveArrows([...s.arrows], delta));
        if (s.pluses?.size) commands.push(new MovePluses([...s.pluses], delta));
        if (commands.length > 0) ctx.commit(new CompoundCommand(commands, 'Move'));
      }
    } else if (this.mode === 'rotate' && this.rotateCenter) {
      const c = this.rotateCenter;
      const a = Math.atan2(e.pos.y - c.y, e.pos.x - c.x) - this.rotateStartAngle;
      const snapped = e.alt ? a : Math.round(a / (15 * Math.PI / 180)) * (15 * Math.PI / 180);
      const ids = [...ctx.getSelection().atoms];
      if (ids.length > 0 && Math.abs(snapped) > 1e-6) {
        ctx.commit(new RotateAtoms(ids, c, snapped));
      }
    }
    ctx.setPreviewMove(null);
    ctx.setPreviewRotate(null);
    ctx.setDecorations([]);
    this.mode = 'idle';
    this.start = null;
    this.lassoPoints = [];
    this.rotateCenter = null;
  }

  onHover(_e: PointerInfo, _ctx: ToolContext): void {
    // selection decorations are rendered by the editor from the model
  }
}

function clone(sel: Selection): Selection {
  const out: Selection = { atoms: new Set(sel.atoms), bonds: new Set(sel.bonds) };
  if (sel.arrows) out.arrows = new Set(sel.arrows);
  if (sel.pluses) out.pluses = new Set(sel.pluses);
  return out;
}

type Hit = { kind: 'atom' | 'bond' | 'arrow' | 'plus'; id: number };

/** Get (creating if needed) the set for an optional selection kind. */
function setFor(sel: Selection, kind: 'arrows' | 'pluses'): Set<number> {
  return sel[kind] ?? (sel[kind] = new Set<number>());
}

function addTo(sel: Selection, hit: Hit): void {
  if (hit.kind === 'atom') sel.atoms.add(hit.id);
  else if (hit.kind === 'bond') sel.bonds.add(hit.id);
  else if (hit.kind === 'arrow') setFor(sel, 'arrows').add(hit.id);
  else setFor(sel, 'pluses').add(hit.id);
}

function toggle(sel: Selection, hit: Hit): void {
  const set =
    hit.kind === 'atom' ? sel.atoms :
    hit.kind === 'bond' ? sel.bonds :
    hit.kind === 'arrow' ? setFor(sel, 'arrows') : setFor(sel, 'pluses');
  if (set.has(hit.id)) set.delete(hit.id);
  else set.add(hit.id);
}

function inRect(p: Vec2, a: Vec2, b: Vec2): boolean {
  return (
    p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x) &&
    p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y)
  );
}

function selectInRect(ctx: ToolContext, sel: Selection, a: Vec2, b: Vec2): void {
  for (const mol of ctx.document.molecules) {
    for (const atom of mol.atoms.values()) {
      if (inRect(atom.pos, a, b)) sel.atoms.add(atom.id);
    }
    for (const bond of mol.bonds.values()) {
      const pa = mol.atoms.get(bond.a)!.pos;
      const pb = mol.atoms.get(bond.b)!.pos;
      if (inRect(pa, a, b) && inRect(pb, a, b)) sel.bonds.add(bond.id);
    }
  }
  for (const arrow of ctx.document.arrows) {
    if (inRect(arrow.from, a, b) && inRect(arrow.to, a, b)) setFor(sel, 'arrows').add(arrow.id);
  }
  for (const plus of ctx.document.pluses) {
    if (inRect(plus.pos, a, b)) setFor(sel, 'pluses').add(plus.id);
  }
}

function selectInPolygon(ctx: ToolContext, sel: Selection, points: Vec2[]): void {
  for (const mol of ctx.document.molecules) {
    for (const atom of mol.atoms.values()) {
      if (pointInPolygon(atom.pos, points)) sel.atoms.add(atom.id);
    }
    for (const bond of mol.bonds.values()) {
      const pa = mol.atoms.get(bond.a)!.pos;
      const pb = mol.atoms.get(bond.b)!.pos;
      if (pointInPolygon(pa, points) && pointInPolygon(pb, points)) sel.bonds.add(bond.id);
    }
  }
  for (const arrow of ctx.document.arrows) {
    if (pointInPolygon(arrow.from, points) && pointInPolygon(arrow.to, points)) setFor(sel, 'arrows').add(arrow.id);
  }
  for (const plus of ctx.document.pluses) {
    if (pointInPolygon(plus.pos, points)) setFor(sel, 'pluses').add(plus.id);
  }
}

const HANDLE_HIT_RADIUS = 6;
const HANDLE_OFFSET = 8;

/**
 * The rotation-invariant center of a selection: the mean of the atom
 * positions. Rotating around it keeps it (and any radius from it) fixed,
 * unlike a bounding-box center, which drifts for asymmetric selections.
 */
function selectionCentroid(doc: Document, sel: Selection): Vec2 | null {
  let x = 0;
  let y = 0;
  let n = 0;
  for (const mol of doc.molecules) {
    for (const atom of mol.atoms.values()) {
      if (!sel.atoms.has(atom.id)) continue;
      x += atom.pos.x;
      y += atom.pos.y;
      n++;
    }
  }
  return n > 0 ? { x: x / n, y: y / n } : null;
}

/**
 * Where the rotate handle sits: on the top-right diagonal from the centroid,
 * at maxRadius + offset. Rotation-invariant, so it stays put across repeated
 * rotations of the same selection.
 */
export function selectionHandlePos(doc: Document, sel: Selection): Vec2 | null {
  const c = selectionCentroid(doc, sel);
  if (!c) return null;
  let radius = 0;
  for (const mol of doc.molecules) {
    for (const atom of mol.atoms.values()) {
      if (!sel.atoms.has(atom.id)) continue;
      radius = Math.max(radius, Math.hypot(atom.pos.x - c.x, atom.pos.y - c.y));
    }
  }
  const d = (radius + HANDLE_OFFSET) / Math.SQRT2;
  return { x: c.x + d, y: c.y - d };
}

/** Selection highlights for a document — mirror the bond-tool hover style, in green. */
export function selectionDecorations(doc: Document, sel: Selection, style: StyleSheet): Decoration[] {
  const decorations: Decoration[] = [];
  for (const mol of doc.molecules) {
    for (const atom of mol.atoms.values()) {
      if (sel.atoms.has(atom.id)) {
        decorations.push(atomSelectionDecoration(doc, atom.id, style));
      }
    }
    for (const bond of mol.bonds.values()) {
      if (!sel.bonds.has(bond.id) && !(sel.atoms.has(bond.a) && sel.atoms.has(bond.b))) continue;
      if (!mol.atoms.has(bond.a) || !mol.atoms.has(bond.b)) continue; // stale ids after undo/delete
      decorations.push({ type: 'select-bond', center: bondDotCenter(mol, bond, style) });
    }
  }
  for (const arrow of doc.arrows) {
    if (!sel.arrows?.has(arrow.id)) continue;
    decorations.push({
      type: 'select-atom',
      labeled: false,
      pos: { x: (arrow.from.x + arrow.to.x) / 2, y: (arrow.from.y + arrow.to.y) / 2 },
    });
  }
  for (const plus of doc.pluses) {
    if (!sel.pluses?.has(plus.id)) continue;
    decorations.push({ type: 'select-atom', labeled: false, pos: plus.pos });
  }
  const handle = selectionHandlePos(doc, sel);
  if (handle) decorations.push({ type: 'rotate-handle', pos: handle });
  return decorations;
}
