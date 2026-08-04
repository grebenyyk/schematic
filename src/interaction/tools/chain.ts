import { angle, dist, sub, type Vec2 } from '../../core/geometry/vec2';
import { pick } from '../../core/geometry/hit';
import { mergeTarget } from '../../core/geometry/snapping';
import { chainPoints } from '../../core/geometry/chain';
import { findAtom } from '../../core/model/document';
import { CompoundCommand, type Command } from '../../core/commands/command';
import { AddAtom, AddBond } from '../../core/commands/ops';
import { atomHoverDecoration, type Decoration } from '../../render/decorators';
import type { PointerInfo, Tool, ToolContext } from '../tools';

const ATOM_RADIUS = 5;
const MERGE_RADIUS = 5;
const CLICK_THRESHOLD = 2;
const ANGLE_STEP_DEG = 15;

/** Drag out a whole zigzag chain in one gesture; one compound undo unit. */
export class ChainTool implements Tool {
  private anchor: Vec2 | null = null;
  private anchorAtom: number | null = null;
  private points: Vec2[] = [];
  private mergeAtom: number | null = null;

  onDown(e: PointerInfo, ctx: ToolContext): void {
    const hit = pick(ctx.document, e.pos, { atomRadius: ATOM_RADIUS, bondTolerance: 3 });
    this.anchorAtom = hit?.kind === 'atom' ? hit.id : null;
    this.anchor = this.anchorAtom !== null
      ? findAtom(ctx.document, this.anchorAtom)!.atom.pos
      : e.pos;
    this.points = [];
    this.mergeAtom = null;
  }

  onHover(e: PointerInfo, ctx: ToolContext): void {
    if (this.anchor) return; // mid-gesture; decorations driven by onMove
    const hit = pick(ctx.document, e.pos, { atomRadius: ATOM_RADIUS, bondTolerance: 3 });
    ctx.setDecorations(
      hit?.kind === 'atom' ? [atomHoverDecoration(ctx.document, hit.id)] : [],
    );
  }

  onMove(e: PointerInfo, ctx: ToolContext): void {
    if (!this.anchor) return;
    if (dist(this.anchor, e.pos) < CLICK_THRESHOLD) return;

    const L = ctx.style.bondLengthPt;
    const raw = angle(sub(e.pos, this.anchor));
    const step = ANGLE_STEP_DEG * (Math.PI / 180);
    const theta = Math.round(raw / step) * step;
    const count = Math.max(1, Math.round(dist(this.anchor, e.pos) / L));
    const cross = Math.cos(theta) * (e.pos.y - this.anchor.y) - Math.sin(theta) * (e.pos.x - this.anchor.x);
    const side = cross >= 0 ? 1 : -1;

    this.points = chainPoints(this.anchor, (theta * 180) / Math.PI, count, L, side);

    const merge = mergeTarget(ctx.document, e.pos, MERGE_RADIUS);
    this.mergeAtom = merge !== null && merge !== this.anchorAtom ? merge : null;
    if (this.mergeAtom !== null) {
      this.points[this.points.length - 1] = findAtom(ctx.document, this.mergeAtom)!.atom.pos;
    }

    const decorations: Decoration[] = [];
    for (let i = 1; i < this.points.length; i++) {
      decorations.push({ type: 'snap-guide', from: this.points[i - 1], to: this.points[i] });
    }
    if (this.mergeAtom !== null) {
      decorations.push(atomHoverDecoration(ctx.document, this.mergeAtom));
    }
    ctx.setDecorations(decorations);
  }

  onUp(_e: PointerInfo, ctx: ToolContext): void {
    if (this.points.length > 1) this.commitChain(ctx);
    ctx.setDecorations([]);
    this.anchor = null;
    this.anchorAtom = null;
    this.points = [];
    this.mergeAtom = null;
  }

  private commitChain(ctx: ToolContext): void {
    const doc = ctx.document;
    const segments = this.points.length - 1;
    const ids = ctx.allocIds(segments * 2);
    const commands: Command[] = [];

    let prevId: number;
    let molIndex: number;
    if (this.anchorAtom !== null) {
      prevId = this.anchorAtom;
      molIndex = findAtom(doc, prevId)!.moleculeIndex;
    } else {
      prevId = ids[0];
      molIndex = doc.molecules.length;
      commands.push(new AddAtom(
        { id: prevId, element: 'C', pos: this.points[0], charge: 0, hydrogens: null }, null));
    }

    let idCursor = this.anchorAtom !== null ? 0 : 1;
    for (let i = 1; i < this.points.length; i++) {
      const isLast = i === this.points.length - 1;
      let nextId: number;
      let bondMolB: number | null = null;
      if (isLast && this.mergeAtom !== null) {
        nextId = this.mergeAtom;
        const mergeMol = findAtom(doc, nextId)!.moleculeIndex;
        if (mergeMol !== molIndex) bondMolB = mergeMol;
      } else {
        nextId = ids[idCursor++];
        commands.push(new AddAtom(
          { id: nextId, element: 'C', pos: this.points[i], charge: 0, hydrogens: null }, molIndex));
      }
      const bondId = ids[idCursor++];
      // skip a duplicate bond when merging onto an already-connected atom
      const dup = bondMolB === null && doc.molecules[molIndex] !== undefined &&
        [...doc.molecules[molIndex].bonds.values()]
          .some((b) => (b.a === prevId && b.b === nextId) || (b.a === nextId && b.b === prevId));
      if (!dup) {
        commands.push(new AddBond(
          { id: bondId, a: prevId, b: nextId, order: 1, stereo: 'none' }, molIndex, bondMolB));
      }
      prevId = nextId;
    }

    if (commands.length > 0) ctx.commit(new CompoundCommand(commands, 'Draw chain'));
  }
}
