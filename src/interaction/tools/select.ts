import { dist, sub, type Vec2 } from '../../core/geometry/vec2';
import { pick } from '../../core/geometry/hit';
import { pointInPolygon } from '../../core/geometry/polygon';
import { MoveAtoms, RotateAtoms } from '../../core/commands/ops';
import type { Document } from '../../core/model/document';
import type { Decoration } from '../../render/decorators';
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
    this.additive = e.shift;

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
      if (!e.shift) ctx.setSelection({ atoms: new Set(), bonds: new Set() });
      this.mode = 'marquee';
      this.lassoPoints = [e.pos];
      return;
    }

    const sel = clone(ctx.getSelection());
    const inSelection =
      (hit.kind === 'atom' && sel.atoms.has(hit.id)) ||
      (hit.kind === 'bond' && sel.bonds.has(hit.id));

    if (e.shift) {
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
    } else if (this.mode === 'move' && dist(this.start, e.pos) > CLICK_THRESHOLD) {
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
      if (dist(this.start, e.pos) > CLICK_THRESHOLD) {
        const sel = this.additive ? clone(ctx.getSelection()) : { atoms: new Set<number>(), bonds: new Set<number>() };
        if (this.selectMode === 'lasso') selectInPolygon(ctx, sel, this.lassoPoints);
        else selectInRect(ctx, sel, this.start, e.pos);
        ctx.setSelection(sel);
      }
    } else if (this.mode === 'move' && dist(this.start, e.pos) > CLICK_THRESHOLD) {
      const ids = [...ctx.getSelection().atoms];
      if (ids.length > 0) ctx.commit(new MoveAtoms(ids, delta));
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
  return { atoms: new Set(sel.atoms), bonds: new Set(sel.bonds) };
}

function addTo(sel: Selection, hit: { kind: 'atom' | 'bond'; id: number }): void {
  if (hit.kind === 'atom') sel.atoms.add(hit.id);
  else sel.bonds.add(hit.id);
}

function toggle(sel: Selection, hit: { kind: 'atom' | 'bond'; id: number }): void {
  const set = hit.kind === 'atom' ? sel.atoms : sel.bonds;
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

/** Selection outlines for a document — used by the editor every render. */
export function selectionDecorations(doc: Document, sel: Selection): Decoration[] {
  const decorations: Decoration[] = [];
  for (const mol of doc.molecules) {
    for (const atom of mol.atoms.values()) {
      if (sel.atoms.has(atom.id)) {
        decorations.push({ type: 'select-atom', pos: atom.pos });
      }
    }
    for (const bond of mol.bonds.values()) {
      if (!sel.bonds.has(bond.id) && !(sel.atoms.has(bond.a) && sel.atoms.has(bond.b))) continue;
      const a = mol.atoms.get(bond.a);
      const b = mol.atoms.get(bond.b);
      if (!a || !b) continue; // stale ids after undo/delete
      const d = sub(b.pos, a.pos);
      const length = Math.hypot(d.x, d.y);
      decorations.push({
        type: 'select-bond',
        center: { x: (a.pos.x + b.pos.x) / 2, y: (a.pos.y + b.pos.y) / 2 },
        dir: { x: d.x / length, y: d.y / length },
        length,
      });
    }
  }
  const handle = selectionHandlePos(doc, sel);
  if (handle) decorations.push({ type: 'rotate-handle', pos: handle });
  return decorations;
}
