import type { Atom, Bond, Molecule } from './molecule';

export interface Selection {
  atoms: Set<number>;
  bonds: Set<number>;
}

export interface Document {
  molecules: Molecule[]; // disconnected fragments = separate molecules
  selection: Selection;
  meta: { nextId: number };
}

export function createDocument(): Document {
  return {
    molecules: [],
    selection: { atoms: new Set(), bonds: new Set() },
    meta: { nextId: 1 },
  };
}

/** Allocate a fresh id; returns the id and the document with advanced nextId. */
export function allocId(doc: Document): { id: number; doc: Document } {
  const id = doc.meta.nextId;
  return { id, doc: { ...doc, meta: { nextId: id + 1 } } };
}

export function withMolecule(doc: Document, molecule: Molecule): Document {
  return { ...doc, molecules: [...doc.molecules, molecule] };
}

export function updateMolecule(
  doc: Document,
  index: number,
  fn: (m: Molecule) => Molecule,
): Document {
  const molecules = doc.molecules.map((m, i) => (i === index ? fn(m) : m));
  return { ...doc, molecules };
}

export interface AtomLocation {
  moleculeIndex: number;
  atom: Atom;
}

export interface BondLocation {
  moleculeIndex: number;
  bond: Bond;
}

export function findAtom(doc: Document, id: number): AtomLocation | null {
  for (let i = 0; i < doc.molecules.length; i++) {
    const atom = doc.molecules[i].atoms.get(id);
    if (atom) return { moleculeIndex: i, atom };
  }
  return null;
}

export function findBond(doc: Document, id: number): BondLocation | null {
  for (let i = 0; i < doc.molecules.length; i++) {
    const bond = doc.molecules[i].bonds.get(id);
    if (bond) return { moleculeIndex: i, bond };
  }
  return null;
}

export function* allAtoms(doc: Document): Generator<Atom> {
  for (const m of doc.molecules) yield* m.atoms.values();
}

export function* allBonds(doc: Document): Generator<Bond> {
  for (const m of doc.molecules) yield* m.bonds.values();
}
