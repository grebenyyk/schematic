import { angle, sub, type Vec2 } from '../geometry/vec2';
import type { Document } from '../model/document';
import { findAtom } from '../model/document';
import { CompoundCommand, type Command } from './command';
import { RotateAtoms, ScaleAtoms } from './ops';

/**
 * "Rectify" a set of atoms: rotate so the longest internal bond snaps onto
 * the 15° grid (structure stands straight), then scale so the mean internal
 * bond length equals the style bond length. Null when nothing to rectify.
 */
export function rectifyCommand(
  doc: Document,
  atomIds: number[],
  bondLength: number,
): Command | null {
  const ids = new Set(atomIds);
  if (ids.size < 2) return null;

  let cx = 0;
  let cy = 0;
  let n = 0;
  for (const id of ids) {
    const loc = findAtom(doc, id);
    if (loc) {
      cx += loc.atom.pos.x;
      cy += loc.atom.pos.y;
      n++;
    }
  }
  if (n < 2) return null;
  const center: Vec2 = { x: cx / n, y: cy / n };

  // internal bonds (both endpoints in the set)
  let longest: { dir: number; len: number } | null = null;
  let totalLen = 0;
  let bondCount = 0;
  for (const mol of doc.molecules) {
    for (const bond of mol.bonds.values()) {
      if (!ids.has(bond.a) || !ids.has(bond.b)) continue;
      const pa = mol.atoms.get(bond.a)!.pos;
      const pb = mol.atoms.get(bond.b)!.pos;
      const len = Math.hypot(pb.x - pa.x, pb.y - pa.y);
      totalLen += len;
      bondCount++;
      if (!longest || len > longest.len) longest = { dir: angle(sub(pb, pa)), len };
    }
  }
  if (bondCount === 0 || !longest) return null;

  const step = (15 * Math.PI) / 180;
  const snapped = Math.round(longest.dir / step) * step;
  const rotateBy = snapped - longest.dir;
  const factor = bondLength / (totalLen / bondCount);

  return new CompoundCommand([
    new RotateAtoms([...ids], center, rotateBy),
    new ScaleAtoms([...ids], center, factor),
  ], 'Rectify');
}
