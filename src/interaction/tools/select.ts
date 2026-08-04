import { dist, sub, type Vec2 } from '../../core/geometry/vec2';
import { pick } from '../../core/geometry/hit';
import { MoveAtoms } from '../../core/commands/ops';
import type { Decoration } from '../../render/decorators';
import type { PointerInfo, Selection, Tool, ToolContext } from '../tools';

const ATOM_RADIUS = 5;
const BOND_TOLERANCE = 3;
const CLICK_THRESHOLD = 2;

type Mode = 'idle' | 'marquee' | 'move';

/**
 * Marquee selection: drag on empty space to select, click to select one
 * item (Shift toggles), drag a selected item to move the whole selection.
 */
export class SelectTool implements Tool {
  private mode: Mode = 'idle';
  private start: Vec2 | null = null;
  private additive = false;

  onDown(e: PointerInfo, ctx: ToolContext): void {
    this.start = e.pos;
    this.additive = e.shift;
    const hit = pick(ctx.document, e.pos, { atomRadius: ATOM_RADIUS, bondTolerance: BOND_TOLERANCE });

    if (!hit) {
      if (!e.shift) ctx.setSelection({ atoms: new Set(), bonds: new Set() });
      this.mode = 'marquee';
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
      ctx.setDecorations([{ type: 'marquee', from: this.start, to: e.pos }]);
    } else if (this.mode === 'move' && dist(this.start, e.pos) > CLICK_THRESHOLD) {
      ctx.setDecorations(movePreview(ctx, sub(e.pos, this.start)));
    }
  }

  onUp(e: PointerInfo, ctx: ToolContext): void {
    if (!this.start) return;
    const delta = sub(e.pos, this.start);
    if (this.mode === 'marquee') {
      if (dist(this.start, e.pos) > CLICK_THRESHOLD) {
        const sel = this.additive ? clone(ctx.getSelection()) : { atoms: new Set<number>(), bonds: new Set<number>() };
        selectInRect(ctx, sel, this.start, e.pos);
        ctx.setSelection(sel);
      }
    } else if (this.mode === 'move' && dist(this.start, e.pos) > CLICK_THRESHOLD) {
      const ids = [...ctx.getSelection().atoms];
      if (ids.length > 0) ctx.commit(new MoveAtoms(ids, delta));
    }
    ctx.setDecorations([]);
    this.mode = 'idle';
    this.start = null;
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

/** Selection outlines offset by the drag delta, as a move preview. */
function movePreview(ctx: ToolContext, delta: Vec2): Decoration[] {
  const sel = ctx.getSelection();
  const decorations: Decoration[] = [];
  for (const mol of ctx.document.molecules) {
    for (const atom of mol.atoms.values()) {
      if (sel.atoms.has(atom.id)) {
        decorations.push({
          type: 'select-atom',
          pos: { x: atom.pos.x + delta.x, y: atom.pos.y + delta.y },
        });
      }
    }
    for (const bond of mol.bonds.values()) {
      if (!sel.bonds.has(bond.id) && !(sel.atoms.has(bond.a) && sel.atoms.has(bond.b))) continue;
      const a = mol.atoms.get(bond.a);
      const b = mol.atoms.get(bond.b);
      if (!a || !b) continue; // stale ids after undo/delete
      const pa = a.pos;
      const pb = b.pos;
      const center = {
        x: (pa.x + pb.x) / 2 + delta.x,
        y: (pa.y + pb.y) / 2 + delta.y,
      };
      const d = sub(pb, pa);
      const length = Math.hypot(d.x, d.y);
      decorations.push({
        type: 'select-bond',
        center,
        dir: { x: d.x / length, y: d.y / length },
        length,
      });
    }
  }
  return decorations;
}

// referenced by the editor to render the current selection (delta = 0)
export function selectionDecorations(ctx: ToolContext): Decoration[] {
  return movePreview(ctx, { x: 0, y: 0 });
}
