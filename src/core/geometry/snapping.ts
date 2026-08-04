import { add, angle, dist, scale, sub, vec, type Vec2 } from './vec2';
import { allAtoms, type Document } from '../model/document';

/** Snap the direction from→to to the nearest multiple of stepDeg, preserving distance. */
export function snapAngle(from: Vec2, to: Vec2, stepDeg: number): Vec2 {
  const d = dist(from, to);
  if (d === 0) return to;
  const step = (stepDeg * Math.PI) / 180;
  const a = angle(sub(to, from));
  const snapped = Math.round(a / step) * step;
  return add(from, scale(vec(Math.cos(snapped), Math.sin(snapped)), d));
}

/**
 * Snap a dragged bond endpoint: angle to angleStepDeg, and length to
 * bondLength when within lengthTolerance (otherwise free).
 */
export function snapBondPoint(
  from: Vec2,
  to: Vec2,
  bondLength: number,
  angleStepDeg: number,
  lengthTolerance: number,
): Vec2 {
  const angled = snapAngle(from, to, angleStepDeg);
  const d = dist(from, angled);
  if (d === 0 || Math.abs(d - bondLength) > lengthTolerance) return angled;
  const step = (angleStepDeg * Math.PI) / 180;
  const a = Math.round(angle(sub(to, from)) / step) * step;
  return add(from, scale(vec(Math.cos(a), Math.sin(a)), bondLength));
}

/** Nearest atom within radius of point — the atom a dropped bond would merge onto. */
export function mergeTarget(doc: Document, point: Vec2, radius: number): number | null {
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
