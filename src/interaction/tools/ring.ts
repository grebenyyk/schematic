import { add, scale, sub, type Vec2 } from '../../core/geometry/vec2';
import { pick } from '../../core/geometry/hit';
import { defaultBondDirection } from '../../core/geometry/chain';
import { regularPolygon, ringFromEdge } from '../../core/geometry/polygon';
import { findAtom, findBond } from '../../core/model/document';
import { CompoundCommand, type Command } from '../../core/commands/command';
import { AddAtom, AddBond } from '../../core/commands/ops';
import type { BondOrder } from '../../core/model/molecule';
import { atomHoverDecoration, type Decoration } from '../../render/decorators';
import type { PointerInfo, Tool, ToolContext } from '../tools';

const ATOM_RADIUS = 5;
const BOND_TOLERANCE = 3;
/** Orientation of a standalone ring: flat bottom. */
const RING_ROTATION = Math.PI / 6;

type Target =
  | { kind: 'empty'; pos: Vec2 }
  | { kind: 'atom'; atomId: number }
  | { kind: 'bond'; bondId: number };

/**
 * Place a regular ring by hovering and pressing 3–8 (the key is the size).
 * Empty space → new ring; atom → ring attached at the atom; bond → ring fused
 * on the bond. A 6-ring is a benzene (kekulé alternating double bonds).
 */
export class RingTool implements Tool {
  private currentSize = 6;
  private lastPos: Vec2 | null = null;
  private target: Target | null = null;

  onHover(e: PointerInfo, ctx: ToolContext): void {
    this.lastPos = e.pos;
    this.target = this.targetAt(e.pos, ctx);
    ctx.setDecorations(this.preview(ctx));
  }

  /** Placement is keyboard-only; a click just refreshes the preview target. */
  onDown(e: PointerInfo, ctx: ToolContext): void {
    this.lastPos = e.pos;
    this.target = this.targetAt(e.pos, ctx);
    ctx.setDecorations(this.preview(ctx));
  }

  onKey(key: string, ctx: ToolContext): boolean {
    if (key < '1' || key > '8') return false;
    if (key < '3') return true; // 1/2 aren't ring sizes — consume, no action
    const n = Number(key);
    this.currentSize = n;
    if (this.target) this.commitRing(this.target, n, ctx);
    return true;
  }

  private targetAt(pos: Vec2, ctx: ToolContext): Target {
    const hit = pick(ctx.document, pos, { atomRadius: ATOM_RADIUS, bondTolerance: BOND_TOLERANCE });
    if (hit?.kind === 'atom') return { kind: 'atom', atomId: hit.id };
    if (hit?.kind === 'bond') return { kind: 'bond', bondId: hit.id };
    return { kind: 'empty', pos };
  }

  /** Which side of edge a→b the cursor is on (+1 / −1); +1 when ambiguous. */
  private side(a: Vec2, b: Vec2): 1 | -1 {
    if (!this.lastPos) return 1;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const e = sub(b, a);
    const cross = e.x * (this.lastPos.y - mid.y) - e.y * (this.lastPos.x - mid.x);
    return cross >= 0 ? 1 : -1;
  }

  /** Polygon vertices for an n-ring at the target. */
  private vertices(target: Target, n: number, ctx: ToolContext): Vec2[] {
    const L = ctx.style.bondLengthPt;
    switch (target.kind) {
      case 'empty':
        return regularPolygon(target.pos, n, L, RING_ROTATION);
      case 'atom': {
        const loc = findAtom(ctx.document, target.atomId)!;
        const mol = ctx.document.molecules[loc.moleculeIndex];
        const center = loc.atom.pos;
        const b = add(center, scale(defaultBondDirection(mol, target.atomId), L));
        return ringFromEdge(center, b, n, this.side(center, b));
      }
      case 'bond': {
        const loc = findBond(ctx.document, target.bondId)!;
        const mol = ctx.document.molecules[loc.moleculeIndex];
        const a = mol.atoms.get(loc.bond.a)!.pos;
        const b = mol.atoms.get(loc.bond.b)!.pos;
        return ringFromEdge(a, b, n, this.side(a, b));
      }
    }
  }

  /** Dashed outline of the ring that would be placed, plus an atom highlight. */
  private preview(ctx: ToolContext): Decoration[] {
    const target = this.target;
    if (!target) return [];
    const verts = this.vertices(target, this.currentSize, ctx);
    const decos: Decoration[] = [];
    for (let i = 0; i < verts.length; i++) {
      decos.push({ type: 'snap-guide', from: verts[i], to: verts[(i + 1) % verts.length] });
    }
    if (target.kind === 'atom') decos.push(atomHoverDecoration(ctx.document, target.atomId, ctx.style));
    return decos;
  }

  private commitRing(target: Target, n: number, ctx: ToolContext): void {
    const verts = this.vertices(target, n, ctx);
    const doc = ctx.document;
    const commands: Command[] = [];

    // Resolve the existing anchor atoms + target molecule.
    let molIndex: number;
    const fuseA = target.kind === 'bond' ? findBond(doc, target.bondId)!.bond.a : 0;
    const fuseB = target.kind === 'bond' ? findBond(doc, target.bondId)!.bond.b : 0;
    if (target.kind === 'atom') molIndex = findAtom(doc, target.atomId)!.moleculeIndex;
    else if (target.kind === 'bond') molIndex = findBond(doc, target.bondId)!.moleculeIndex;
    else molIndex = doc.molecules.length; // empty: the first atom appends a molecule here

    const newAtomCount =
      target.kind === 'empty' ? n : target.kind === 'atom' ? n - 1 : n - 2;
    const newBondCount = target.kind === 'bond' ? n - 1 : n;
    const ids = ctx.allocIds(newAtomCount + newBondCount);
    let cursor = 0;
    const take = (): number => ids[cursor++];

    // Assign an atom id to every vertex (existing anchors reused, rest new).
    const vertIds: number[] = [];
    let appendedMolecule = false;
    for (let i = 0; i < n; i++) {
      let id: number;
      let isNew = true;
      if (target.kind === 'bond' && (i === 0 || i === 1)) {
        id = i === 0 ? fuseA : fuseB;
        isNew = false;
      } else if (target.kind === 'atom' && i === 0) {
        id = target.atomId;
        isNew = false;
      } else {
        id = take();
      }
      vertIds.push(id);
      if (isNew) {
        // the first atom of an empty-space ring appends a fresh molecule
        if (target.kind === 'empty' && !appendedMolecule) {
          commands.push(new AddAtom(
            { id, element: 'C', pos: verts[i], charge: 0, hydrogens: null }, null));
          molIndex = doc.molecules.length;
          appendedMolecule = true;
        } else {
          commands.push(new AddAtom(
            { id, element: 'C', pos: verts[i], charge: 0, hydrogens: null }, molIndex));
        }
      }
    }

    // Ring edges (0-1, 1-2, …, n-1-0); a fused ring skips the shared edge 0-1.
    for (let i = 0; i < n; i++) {
      if (target.kind === 'bond' && i === 0) continue;
      const order = benzeneOrder(target, i, n);
      commands.push(new AddBond(
        { id: take(), a: vertIds[i], b: vertIds[(i + 1) % n], order, stereo: 'none' }, molIndex));
    }

    ctx.commit(new CompoundCommand(commands, 'Add ring'));

    // Refresh the preview against the now-changed document under the cursor.
    this.target = this.lastPos ? this.targetAt(this.lastPos, ctx) : null;
    ctx.setDecorations(this.preview(ctx));
  }
}

/** Bond order for ring edge i: a 6-ring alternates (3 doubles); others single. */
function benzeneOrder(target: Target, i: number, n: number): BondOrder {
  if (n !== 6) return 1;
  // a fused ring's shared edge (i=0, left as-is) is "single", so the new edges
  // alternate starting double at i=1; standalone rings alternate from i=0.
  const double = target.kind === 'bond' ? i % 2 === 1 : i % 2 === 0;
  return double ? 2 : 1;
}
