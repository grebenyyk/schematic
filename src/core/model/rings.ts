import type { Vec2 } from '../geometry/vec2';
import type { Molecule } from './molecule';

/**
 * If the bond lies on a ring, return the atom positions along the ring path
 * from a to b that avoids the bond itself (a first, b last). Null when the
 * bond is acyclic. DFS is fine at molecule-editor scale.
 */
export function ringPath(mol: Molecule, bondId: number): Vec2[] | null {
  const bond = mol.bonds.get(bondId);
  if (!bond) return null;

  const adjacency = new Map<number, number[]>();
  for (const b of mol.bonds.values()) {
    if (b.id === bondId) continue;
    (adjacency.get(b.a) ?? adjacency.set(b.a, []).get(b.a)!).push(b.b);
    (adjacency.get(b.b) ?? adjacency.set(b.b, []).get(b.b)!).push(b.a);
  }

  const visited = new Set<number>([bond.a]);
  const stack: number[] = [bond.a];
  const dfs = (): boolean => {
    const current = stack[stack.length - 1];
    if (current === bond.b) return true;
    for (const next of adjacency.get(current) ?? []) {
      if (visited.has(next)) continue;
      visited.add(next);
      stack.push(next);
      if (dfs()) return true;
      stack.pop();
    }
    return false;
  };

  if (!dfs()) return null;
  return stack.map((id) => mol.atoms.get(id)!.pos);
}
