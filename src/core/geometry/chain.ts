import { angle, sub, vec, type Vec2 } from './vec2';
import { bondsOf, type Molecule } from '../model/molecule';

const DEG = Math.PI / 180;

function snap15(rad: number): Vec2 {
  const snapped = Math.round(rad / (15 * DEG)) * 15 * DEG;
  return vec(Math.cos(snapped), Math.sin(snapped));
}

function bondDirectionsFrom(mol: Molecule, atomId: number): number[] {
  const dirs: number[] = [];
  for (const bondId of bondsOf(mol, atomId)) {
    const bond = mol.bonds.get(bondId)!;
    const otherId = bond.a === atomId ? bond.b : bond.a;
    dirs.push(angle(sub(mol.atoms.get(otherId)!.pos, mol.atoms.get(atomId)!.pos)));
  }
  return dirs;
}

function angularGap(a: number, b: number): number {
  const d = Math.abs(a - b) % (2 * Math.PI);
  return d > Math.PI ? 2 * Math.PI - d : d;
}

/**
 * Points of a zigzag chain: `count` segments of bondLength, the first along
 * angleDeg, subsequent ones alternating ±60° (ACS 120° bond angle), bending
 * to `side` (+1/−1). Returns count+1 points starting at `start`.
 */
export function chainPoints(
  start: Vec2,
  angleDeg: number,
  count: number,
  bondLength: number,
  side: 1 | -1,
): Vec2[] {
  const points: Vec2[] = [start];
  let current = start;
  for (let i = 0; i < count; i++) {
    const a = (angleDeg + (i % 2 === 1 ? side * 60 : 0)) * DEG;
    current = { x: current.x + bondLength * Math.cos(a), y: current.y + bondLength * Math.sin(a) };
    points.push(current);
  }
  return points;
}

/**
 * Direction for a bond added by clicking an atom ("add methyl").
 * - isolated atom: east
 * - terminal atom: 120° to the existing bond, alternating sides so repeated
 *   clicks draw a zigzag chain
 * - otherwise: the 15°-snapped direction with the most clearance
 */
export function defaultBondDirection(mol: Molecule, atomId: number): Vec2 {
  const atom = mol.atoms.get(atomId);
  if (!atom) return vec(1, 0);
  const dirs = bondDirectionsFrom(mol, atomId);

  if (dirs.length === 0) return vec(1, 0);

  if (dirs.length === 1) {
    const bondId = bondsOf(mol, atomId).next().value!;
    const bond = mol.bonds.get(bondId)!;
    const neighborId = bond.a === atomId ? bond.b : bond.a;
    // direction neighbor → clicked atom
    const prevDir = angle(sub(atom.pos, mol.atoms.get(neighborId)!.pos));
    // directions of the neighbor's other bonds (excluding the one to atomId)
    const otherDirs: number[] = [];
    for (const nbId of bondsOf(mol, neighborId)) {
      if (nbId === bondId) continue;
      const nb = mol.bonds.get(nbId)!;
      const otherId = nb.a === neighborId ? nb.b : nb.a;
      otherDirs.push(angle(sub(mol.atoms.get(otherId)!.pos, mol.atoms.get(neighborId)!.pos)));
    }
    let turn = 60 * DEG;
    if (otherDirs.length === 1) {
      // turn sign at the neighbor, from its other bond into this one
      const inDir = otherDirs[0] + Math.PI; // other-atom → neighbor
      const cross = Math.cos(inDir) * Math.sin(prevDir) - Math.sin(inDir) * Math.cos(prevDir);
      turn = cross > 0 ? -60 * DEG : 60 * DEG; // alternate → zigzag
    }
    return snap15(prevDir + turn);
  }

  let best: Vec2 = vec(1, 0);
  let bestClearance = -1;
  for (let a = 0; a < 360; a += 15) {
    const rad = a * DEG;
    const clearance = Math.min(...dirs.map((d) => angularGap(rad, d)));
    if (clearance > bestClearance + 1e-9) {
      bestClearance = clearance;
      best = vec(Math.cos(rad), Math.sin(rad));
    }
  }
  return best;
}
