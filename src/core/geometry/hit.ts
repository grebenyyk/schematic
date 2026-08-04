import { dist, dot, scale, sub, add, type Vec2 } from './vec2';
import { allAtoms, allBonds, findAtom, type Document } from '../model/document';

/** Distance from point p to segment a–b (clamped to endpoints). */
export function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  if (l2 === 0) return dist(p, a);
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
  return dist(p, add(a, scale(ab, t)));
}

/** Nearest atom within radius, else null. */
export function pickAtom(doc: Document, point: Vec2, radius: number): number | null {
  let best: number | null = null;
  let bestDist = radius;
  for (const atom of allAtoms(doc)) {
    const d = dist(atom.pos, point);
    if (d <= bestDist) {
      bestDist = d;
      best = atom.id;
    }
  }
  return best;
}

/** Nearest bond within tolerance of the point, else null. */
export function pickBond(doc: Document, point: Vec2, tolerance: number): number | null {
  let best: number | null = null;
  let bestDist = tolerance;
  for (const bond of allBonds(doc)) {
    const a = findAtom(doc, bond.a);
    const b = findAtom(doc, bond.b);
    if (!a || !b) continue;
    const d = distToSegment(point, a.atom.pos, b.atom.pos);
    if (d <= bestDist) {
      bestDist = d;
      best = bond.id;
    }
  }
  return best;
}

export interface PickOptions {
  atomRadius: number;
  bondTolerance: number;
}

export type PickResult = { kind: 'atom' | 'bond'; id: number } | null;

/** Atoms take priority over bonds. */
export function pick(doc: Document, point: Vec2, opts: PickOptions): PickResult {
  const atom = pickAtom(doc, point, opts.atomRadius);
  if (atom !== null) return { kind: 'atom', id: atom };
  const bond = pickBond(doc, point, opts.bondTolerance);
  if (bond !== null) return { kind: 'bond', id: bond };
  return null;
}
