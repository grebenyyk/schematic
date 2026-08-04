import { bondsOf, type Molecule } from '../model/molecule';
import type { BondOrder } from '../model/molecule';

/** Normal valences; positive charge adds, negative subtracts (octet-based). */
const BASE_VALENCE: Record<string, number> = {
  C: 4, N: 3, O: 2, S: 2, P: 3, B: 3, Si: 4,
  F: 1, Cl: 1, Br: 1, I: 1, H: 1,
};

/** Valence adjustment per unit of formal charge for common cases. */
function valence(element: string, charge: number): number {
  const base = BASE_VALENCE[element] ?? 0;
  // N+ → 4, O+ → 3, halide− → 0, etc. — simple octet shift
  return base + charge;
}

function orderValue(order: BondOrder): number {
  return order === 'aromatic' ? 1.5 : order;
}

/**
 * Implicit hydrogen count for an atom: normal valence minus the bond order
 * sum, floored at zero. An explicit `hydrogens` override on the atom wins.
 * (Simplified model — no radicals, no expanded-valence S/P bookkeeping.)
 */
export function implicitHydrogens(mol: Molecule, atomId: number): number {
  const atom = mol.atoms.get(atomId);
  if (!atom) return 0;
  if (atom.hydrogens != null) return atom.hydrogens;
  let sum = 0;
  for (const bondId of bondsOf(mol, atomId)) {
    sum += orderValue(mol.bonds.get(bondId)!.order);
  }
  return Math.max(0, Math.round(valence(atom.element, atom.charge) - sum));
}

/**
 * Would setting this bond order keep both endpoints within valence?
 * Raising the order consumes free valence (implicit H capacity) at both ends.
 */
export function canSetBondOrder(mol: Molecule, bondId: number, order: BondOrder): boolean {
  const bond = mol.bonds.get(bondId);
  if (!bond) return false;
  const delta = orderValue(order) - orderValue(bond.order);
  if (delta <= 0) return true;
  return (
    implicitHydrogens(mol, bond.a) >= delta &&
    implicitHydrogens(mol, bond.b) >= delta
  );
}
