import { add, angle, scale, sub, vec, type Vec2 } from '../geometry/vec2';
import { bondsOf, neighborIds, type Molecule } from '../model/molecule';
import { regularPolygon, ringFromEdge } from '../geometry/polygon';

const DEG = Math.PI / 180;

/** Assign 2D coordinates to every atom of `mol` (mutates positions in place). */
export function layoutMolecule(mol: Molecule, bondLength: number): void {
  if (mol.atoms.size === 0) return;
  const placed = new Set<number>();

  const ringBonds = findRingBonds(mol);
  if (ringBonds.size > 0) {
    const rings = findRings(mol, ringBonds);
    placeRings(mol, rings, bondLength, placed);
  }
  placeTrees(mol, bondLength, placed); // acyclic substituents + pure-acyclic components
}

/* ── ring perception ──────────────────────────────────────────────────────── */

/** Bond ids that are part of a ring = all bonds minus bridges (Tarjan). */
function findRingBonds(mol: Molecule): Set<number> {
  const disc = new Map<number, number>();
  const low = new Map<number, number>();
  const bridges = new Set<number>();
  let time = 0;

  const dfs = (u: number, parentBond: number) => {
    disc.set(u, time);
    low.set(u, time);
    time++;
    for (const bondId of bondsOf(mol, u)) {
      if (bondId === parentBond) continue;
      const bond = mol.bonds.get(bondId)!;
      const v = bond.a === u ? bond.b : bond.a;
      if (!disc.has(v)) {
        dfs(v, bondId);
        low.set(u, Math.min(low.get(u)!, low.get(v)!));
        if (low.get(v)! > disc.get(u)!) bridges.add(bondId);
      } else {
        low.set(u, Math.min(low.get(u)!, disc.get(v)!));
      }
    }
  };

  for (const atom of mol.atoms.keys()) if (!disc.has(atom)) dfs(atom, -1);
  const ring = new Set<number>();
  for (const bond of mol.bonds.values()) if (!bridges.has(bond.id)) ring.add(bond.id);
  return ring;
}

/** A representative set of small rings (ordered atom cycles), one list per ring. */
function findRings(mol: Molecule, ringBonds: Set<number>): number[][] {
  const adj = new Map<number, { v: number; bond: number }[]>();
  const add = (a: number, b: number, bond: number) => {
    (adj.get(a) ?? adj.set(a, []).get(a)!).push({ v: b, bond });
  };
  for (const bond of mol.bonds.values()) {
    if (!ringBonds.has(bond.id)) continue;
    add(bond.a, bond.b, bond.id);
    add(bond.b, bond.a, bond.id);
  }
  const ringAtoms = [...adj.keys()];
  if (ringAtoms.length === 0) return [];

  // candidate ring per ring bond = shortest path between its endpoints avoiding that edge
  const seen = new Set<string>();
  const distinct: number[][] = [];
  for (const bond of mol.bonds.values()) {
    if (!ringBonds.has(bond.id)) continue;
    const path = bfsPath(bond.a, bond.b, adj, bond.id);
    if (!path) continue;
    const key = [...path].sort((x, y) => x - y).join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    distinct.push(path);
  }
  distinct.sort((a, b) => a.length - b.length);

  // keep the cyclomatic number of smallest rings
  const components = countComponents(adj);
  const keep = ringBonds.size - ringAtoms.length + components;
  return distinct.slice(0, Math.max(0, keep));
}

/** Shortest atom path a→b in `adj` not traversing `excludeBond`; includes both ends. */
function bfsPath(a: number, b: number, adj: Map<number, { v: number; bond: number }[]>, excludeBond: number): number[] | null {
  const prev = new Map<number, number | null>([[a, null]]);
  const queue = [a];
  while (queue.length) {
    const u = queue.shift()!;
    if (u === b) break;
    for (const { v, bond } of adj.get(u) ?? []) {
      if (bond === excludeBond || prev.has(v)) continue;
      prev.set(v, u);
      queue.push(v);
    }
  }
  if (!prev.has(b)) return null;
  const path: number[] = [];
  for (let cur: number | null = b; cur !== null; cur = prev.get(cur) ?? null) path.push(cur);
  return path.reverse();
}

function countComponents(adj: Map<number, { v: number; bond: number }[]>): number {
  const visited = new Set<number>();
  let count = 0;
  for (const start of adj.keys()) {
    if (visited.has(start)) continue;
    count++;
    const stack = [start];
    while (stack.length) {
      const u = stack.pop()!;
      if (visited.has(u)) continue;
      visited.add(u);
      for (const { v } of adj.get(u) ?? []) if (!visited.has(v)) stack.push(v);
    }
  }
  return count;
}

/* ── placement ────────────────────────────────────────────────────────────── */

function placeRings(mol: Molecule, rings: number[][], L: number, placed: Set<number>): void {
  const remaining = [...rings];
  let nextCenter: Vec2 = vec(0, 0);

  while (remaining.length) {
    // prefer a ring sharing a placed edge; else sharing atoms; else any
    let pick = remaining.findIndex((r) => r.some((a, i) => placed.has(a) && placed.has(r[(i + 1) % r.length]) && areBonded(mol, a, r[(i + 1) % r.length])));
    if (pick === -1) pick = remaining.findIndex((r) => r.some((a) => placed.has(a)));
    if (pick === -1) pick = 0;
    const ring = remaining.splice(pick, 1)[0];
    const N = ring.length;

    const sharedIdx = ring.findIndex((a, i) => placed.has(a) && placed.has(ring[(i + 1) % N]) && areBonded(mol, a, ring[(i + 1) % N]));
    if (sharedIdx !== -1) {
      const a = ring[sharedIdx];
      const b = ring[(sharedIdx + 1) % N];
      const side = outwardSide(mol, a, b, placed);
      const verts = ringFromEdge(getPos(mol, a), getPos(mol, b), N, side);
      // ringFromEdge returns [a, b, v2…]; assign the ring's atoms after b (in cycle order)
      for (let k = 2; k < N; k++) setPos(mol, ring[(sharedIdx + k) % N], verts[k]);
    } else {
      const verts = regularPolygon(nextCenter, N, L, 0);
      for (let k = 0; k < N; k++) setPos(mol, ring[k], verts[k]);
      nextCenter = add(nextCenter, vec(L * (N + 2), 0)); // nudge for a later standalone ring
    }
    for (const id of ring) placed.add(id);
  }
}

function placeTrees(mol: Molecule, L: number, placed: Set<number>): void {
  const depth = new Map<number, number>();
  let queue: number[];
  if (placed.size === 0) {
    const seed = pickLeaf(mol);
    setPos(mol, seed, vec(0, 0));
    placed.add(seed);
    depth.set(seed, 0);
    queue = [seed];
  } else {
    queue = [...placed];
    for (const id of placed) depth.set(id, 0);
  }

  while (queue.length) {
    const a = queue.shift()!;
    for (const n of neighborIds(mol, a)) {
      if (placed.has(n)) continue;
      const dir = directionFor(mol, a, placed, depth.get(a) ?? 0);
      setPos(mol, n, add(getPos(mol, a), scale(dir, L)));
      placed.add(n);
      depth.set(n, (depth.get(a) ?? 0) + 1);
      queue.push(n);
    }
  }

  // any disconnected remainder (defensive — parseSmiles fragments are connected)
  for (const seed of mol.atoms.keys()) {
    if (placed.has(seed)) continue;
    setPos(mol, seed, vec(0, 0));
    placed.add(seed);
    depth.set(seed, 0);
    const q = [seed];
    while (q.length) {
      const a = q.shift()!;
      for (const n of neighborIds(mol, a)) {
        if (placed.has(n)) continue;
        const dir = directionFor(mol, a, placed, depth.get(a) ?? 0);
        setPos(mol, n, add(getPos(mol, a), scale(dir, L)));
        placed.add(n);
        depth.set(n, (depth.get(a) ?? 0) + 1);
        q.push(n);
      }
    }
  }
}

/** Direction for a bond from `a` into open space, given `a`'s placed neighbors. */
function directionFor(mol: Molecule, a: number, placed: Set<number>, depth: number): Vec2 {
  const aPos = getPos(mol, a);
  const dirs: number[] = [];
  for (const p of neighborIds(mol, a)) {
    if (placed.has(p)) dirs.push(angle(sub(getPos(mol, p), aPos)));
  }
  if (dirs.length === 0) return vec(1, 0);
  if (dirs.length === 1) {
    const forward = dirs[0] + Math.PI; // away from the one placed neighbor
    const turn = (depth % 2 === 0 ? 1 : -1) * 60 * DEG; // zigzag alternation
    return vec(Math.cos(forward + turn), Math.sin(forward + turn));
  }
  // 2+ placed neighbors: pick the angle with the most clearance, snapped to 15°
  let best = 0;
  let bestClear = -1;
  for (let d = 0; d < 360; d += 15) {
    const rad = d * DEG;
    const clear = Math.min(...dirs.map((x) => angularGap(rad, x)));
    if (clear > bestClear) {
      bestClear = clear;
      best = rad;
    }
  }
  return vec(Math.cos(best), Math.sin(best));
}

/* ── helpers ──────────────────────────────────────────────────────────────── */

function angularGap(a: number, b: number): number {
  const d = Math.abs(a - b) % (2 * Math.PI);
  return d > Math.PI ? 2 * Math.PI - d : d;
}

function getPos(mol: Molecule, id: number): Vec2 {
  return mol.atoms.get(id)!.pos;
}
function setPos(mol: Molecule, id: number, p: Vec2): void {
  mol.atoms.get(id)!.pos = p;
}
function areBonded(mol: Molecule, a: number, b: number): boolean {
  for (const bond of mol.bonds.values()) {
    if ((bond.a === a && bond.b === b) || (bond.a === b && bond.b === a)) return true;
  }
  return false;
}
function pickLeaf(mol: Molecule): number {
  let best: number | null = null;
  let bestDeg = Infinity;
  for (const id of mol.atoms.keys()) {
    const deg = [...bondsOf(mol, id)].length;
    if (deg < bestDeg) {
      bestDeg = deg;
      best = id;
    }
  }
  return best ?? [...mol.atoms.keys()][0];
}
/** Which side of edge a→b faces away from the already-placed atoms (+1/−1). */
function outwardSide(mol: Molecule, a: number, b: number, placed: Set<number>): 1 | -1 {
  const pa = getPos(mol, a);
  const pb = getPos(mol, b);
  const e = sub(pb, pa);
  const mid = scale(add(pa, pb), 0.5);
  let cx = 0;
  let cy = 0;
  let n = 0;
  for (const id of placed) {
    if (id === a || id === b) continue;
    cx += getPos(mol, id).x;
    cy += getPos(mol, id).y;
    n++;
  }
  if (n === 0) return 1;
  const cross = e.x * (cy / n - mid.y) - e.y * (cx / n - mid.x);
  return cross >= 0 ? -1 : 1;
}
