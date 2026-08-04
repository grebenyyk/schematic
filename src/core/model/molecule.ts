import type { Vec2 } from '../geometry/vec2';

export type ElementSymbol =
  | 'C' | 'H' | 'N' | 'O' | 'S' | 'P' | 'F' | 'Cl' | 'Br' | 'I' | 'B' | 'Si'
  | string;

export interface Atom {
  id: number;
  element: ElementSymbol; // 'C' renders as nothing unless terminal/labeled
  pos: Vec2;              // canvas coords in style points
  charge: number;
  isotope?: number;
  hydrogens?: number | null; // explicit override; null = derive from valence
  radical?: 'none' | 'singlet' | 'doublet' | 'triplet';
  stereoLabel?: 'R' | 'S' | null;
}

export type BondOrder = 1 | 2 | 3 | 'aromatic';
export type BondStereo = 'none' | 'wedge' | 'hash' | 'wavy' | 'up' | 'down' | 'cis-trans';

export interface Bond {
  id: number;
  a: number;
  b: number; // atom ids
  order: BondOrder;
  stereo: BondStereo;
}

export interface Molecule {
  atoms: Map<number, Atom>;
  bonds: Map<number, Bond>;
}

export function emptyMolecule(): Molecule {
  return { atoms: new Map(), bonds: new Map() };
}

export function addAtom(mol: Molecule, atom: Atom): Molecule {
  const atoms = new Map(mol.atoms);
  atoms.set(atom.id, atom);
  return { ...mol, atoms };
}

export function updateAtom(mol: Molecule, id: number, patch: Partial<Omit<Atom, 'id'>>): Molecule {
  const atom = mol.atoms.get(id);
  if (!atom) return mol;
  const atoms = new Map(mol.atoms);
  atoms.set(id, { ...atom, ...patch, id });
  return { ...mol, atoms };
}

export function removeAtom(mol: Molecule, id: number): Molecule {
  const atoms = new Map(mol.atoms);
  atoms.delete(id);
  const bonds = new Map(mol.bonds);
  for (const bond of bonds.values()) {
    if (bond.a === id || bond.b === id) bonds.delete(bond.id);
  }
  return { atoms, bonds };
}

export function addBond(mol: Molecule, bond: Bond): Molecule {
  const bonds = new Map(mol.bonds);
  bonds.set(bond.id, bond);
  return { ...mol, bonds };
}

export function updateBond(mol: Molecule, id: number, patch: Partial<Omit<Bond, 'id'>>): Molecule {
  const bond = mol.bonds.get(id);
  if (!bond) return mol;
  const bonds = new Map(mol.bonds);
  bonds.set(id, { ...bond, ...patch, id });
  return { ...mol, bonds };
}

export function removeBond(mol: Molecule, id: number): Molecule {
  const bonds = new Map(mol.bonds);
  bonds.delete(id);
  return { ...mol, bonds };
}

export function* bondsOf(mol: Molecule, atomId: number): Generator<number> {
  for (const bond of mol.bonds.values()) {
    if (bond.a === atomId || bond.b === atomId) yield bond.id;
  }
}

export function* neighborIds(mol: Molecule, atomId: number): Generator<number> {
  for (const bond of mol.bonds.values()) {
    if (bond.a === atomId) yield bond.b;
    else if (bond.b === atomId) yield bond.a;
  }
}
