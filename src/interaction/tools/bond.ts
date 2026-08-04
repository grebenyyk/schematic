import { add, dist, scale, type Vec2 } from '../../core/geometry/vec2';
import { pick } from '../../core/geometry/hit';
import { mergeTarget, snapBondPoint } from '../../core/geometry/snapping';
import { defaultBondDirection } from '../../core/geometry/chain';
import { findAtom, findBond } from '../../core/model/document';
import { bondsOf } from '../../core/model/molecule';
import { hasVisibleLabel } from '../../render/labels';
import { bondRenderAxis } from '../../render/renderer';
import { ringPath } from '../../core/model/rings';
import { ringInwardNormal } from '../../render/bonds';
import type { Command } from '../../core/commands/command';
import { CompoundCommand } from '../../core/commands/command';
import { AddAtom, AddBond, SetBondOrder } from '../../core/commands/ops';
import type { Decoration } from '../../render/decorators';
import type { PointerInfo, Tool, ToolContext } from '../tools';

const ATOM_RADIUS = 5;
const BOND_TOLERANCE = 3;
const MERGE_RADIUS = 5;
const CLICK_THRESHOLD = 2;
const ANGLE_STEP_DEG = 15;

/** Hover/merge highlight for an atom: letter outline when labeled, circle otherwise. */
function atomDecoration(ctx: ToolContext, atomId: number): Decoration {
  const doc = ctx.document;
  const loc = findAtom(doc, atomId)!;
  const degree = [...bondsOf(doc.molecules[loc.moleculeIndex], atomId)].length;
  const labeled = hasVisibleLabel(loc.atom, degree);
  const deco: Decoration = { type: 'hover-atom', pos: loc.atom.pos, labeled };
  if (labeled) deco.element = loc.atom.element;
  return deco;
}

/**
 * The "everything tool": click-drag draws a bond (from empty space or an
 * atom), dropping near an existing atom merges onto it, click on a bond
 * cycles its order 1→2→3. Alt disables angle snapping.
 */
export class BondTool implements Tool {
  private startPos: Vec2 | null = null;
  private anchorAtom: number | null = null;
  private clickedBond: number | null = null;
  private moved = false;
  private mergeAtom: number | null = null;
  private endPos: Vec2 | null = null;

  onDown(e: PointerInfo, ctx: ToolContext): void {
    this.startPos = e.pos;
    this.moved = false;
    this.mergeAtom = null;
    this.endPos = null;
    const hit = pick(ctx.document, e.pos, { atomRadius: ATOM_RADIUS, bondTolerance: BOND_TOLERANCE });
    this.anchorAtom = hit?.kind === 'atom' ? hit.id : null;
    this.clickedBond = hit?.kind === 'bond' ? hit.id : null;
  }

  onMove(e: PointerInfo, ctx: ToolContext): void {
    if (!this.startPos) return;
    if (!this.moved && dist(this.startPos, e.pos) < CLICK_THRESHOLD) return;
    this.moved = true;
    if (this.clickedBond !== null) return; // drag on a bond draws nothing

    const doc = ctx.document;
    const anchor = this.anchorPos(ctx);
    const merge = mergeTarget(doc, e.pos, MERGE_RADIUS);
    this.mergeAtom = merge !== null && merge !== this.anchorAtom ? merge : null;
    this.endPos = this.mergeAtom !== null
      ? findAtom(doc, this.mergeAtom)!.atom.pos
      : e.alt
        ? e.pos
        : snapBondPoint(anchor, e.pos, ctx.style.bondLengthPt, ANGLE_STEP_DEG, ctx.style.bondLengthPt * 0.25);

    const decorations: Decoration[] = [{ type: 'snap-guide', from: anchor, to: this.endPos }];
    if (this.mergeAtom !== null) decorations.push(atomDecoration(ctx, this.mergeAtom));
    ctx.setDecorations(decorations);
  }

  onUp(_e: PointerInfo, ctx: ToolContext): void {
    if (!this.startPos) return;
    if (!this.moved) {
      if (this.clickedBond !== null) {
        const order = findBond(ctx.document, this.clickedBond)?.bond.order;
        if (order === 1 || order === 2 || order === 3) {
          ctx.commit(new SetBondOrder(this.clickedBond, order === 3 ? 1 : ((order + 1) as 2 | 3)));
        }
      } else if (this.anchorAtom !== null) {
        this.commitMethyl(ctx);
      } else {
        // click on empty space: place a methane (lone carbon)
        const [id] = ctx.allocIds(1);
        ctx.commit(new AddAtom(
          { id, element: 'C', pos: this.startPos!, charge: 0, hydrogens: null }, null));
      }
    } else if (this.clickedBond === null && this.endPos) {
      this.commitDraw(ctx);
    }
    ctx.setDecorations([]);
    this.reset();
  }

  onHover(e: PointerInfo, ctx: ToolContext): void {
    if (this.startPos) return; // mid-gesture; decorations driven by onMove
    const doc = ctx.document;
    const hit = pick(doc, e.pos, { atomRadius: ATOM_RADIUS, bondTolerance: BOND_TOLERANCE });
    if (!hit) {
      ctx.setDecorations([]);
    } else if (hit.kind === 'atom') {
      ctx.setDecorations([atomDecoration(ctx, hit.id)]);
    } else {
      const loc = findBond(doc, hit.id)!;
      const mol = doc.molecules[loc.moleculeIndex];
      const axis = bondRenderAxis(mol, loc.bond, ctx.style);
      let center = { x: (axis.a.x + axis.b.x) / 2, y: (axis.a.y + axis.b.y) / 2 };
      // ring double bonds draw on-axis + inner line: the visual center is
      // half a gap inside the ring
      if (loc.bond.order === 2) {
        const path = ringPath(mol, loc.bond.id);
        if (path) {
          const inward = ringInwardNormal(axis, path);
          const halfGap = (ctx.style.doubleBondSpacing * ctx.style.bondLengthPt) / 2;
          center = add(center, scale(inward, halfGap));
        }
      }
      ctx.setDecorations([{ type: 'hover-bond', center }]);
    }
  }

  private anchorPos(ctx: ToolContext): Vec2 {
    if (this.anchorAtom !== null) return findAtom(ctx.document, this.anchorAtom)!.atom.pos;
    return this.startPos!;
  }

  private commitDraw(ctx: ToolContext): void {
    const doc = ctx.document;
    const [idA, idB, idBond] = ctx.allocIds(3);
    const commands: Command[] = [];

    let aId: number;
    let molA: number;
    if (this.anchorAtom !== null) {
      aId = this.anchorAtom;
      molA = findAtom(doc, aId)!.moleculeIndex;
    } else {
      aId = idA;
      molA = doc.molecules.length; // AddAtom appends a new molecule at the end
      commands.push(new AddAtom(
        { id: idA, element: 'C', pos: this.startPos!, charge: 0, hydrogens: null }, null));
    }

    let bId: number;
    let molB: number | null = null;
    if (this.mergeAtom !== null) {
      bId = this.mergeAtom;
      molB = findAtom(doc, bId)!.moleculeIndex;
    } else {
      bId = idB;
      commands.push(new AddAtom(
        { id: idB, element: 'C', pos: this.endPos!, charge: 0, hydrogens: null }, molA));
    }

    // never duplicate an existing bond
    const alreadyBonded = molB === molA && [...doc.molecules[molA].bonds.values()]
      .some((b) => (b.a === aId && b.b === bId) || (b.a === bId && b.b === aId));
    if (!alreadyBonded) {
      commands.push(new AddBond({ id: idBond, a: aId, b: bId, order: 1, stereo: 'none' }, molA, molB));
    }
    if (commands.length > 0) ctx.commit(new CompoundCommand(commands, 'Draw bond'));
  }

  /** Click on an atom: grow a methyl group at the default (zigzag) angle. */
  private commitMethyl(ctx: ToolContext): void {
    const doc = ctx.document;
    const loc = findAtom(doc, this.anchorAtom!);
    if (!loc) return;
    const mol = doc.molecules[loc.moleculeIndex];
    const dir = defaultBondDirection(mol, loc.atom.id);
    const [idB, idBond] = ctx.allocIds(2);
    const pos = add(loc.atom.pos, scale(dir, ctx.style.bondLengthPt));
    ctx.commit(new CompoundCommand([
      new AddAtom({ id: idB, element: 'C', pos, charge: 0, hydrogens: null }, loc.moleculeIndex),
      new AddBond({ id: idBond, a: loc.atom.id, b: idB, order: 1, stereo: 'none' }, loc.moleculeIndex),
    ], 'Add methyl'));
  }

  private reset(): void {
    this.startPos = null;
    this.anchorAtom = null;
    this.clickedBond = null;
    this.moved = false;
    this.mergeAtom = null;
    this.endPos = null;
  }
}
