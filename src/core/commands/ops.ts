import type { Document } from '../model/document';
import { findAtom, findBond } from '../model/document';
import {
  addAtom, addBond, emptyMolecule, removeAtom, removeBond, updateAtom, updateBond,
  type Atom, type Bond, type BondOrder, type Molecule,
} from '../model/molecule';
import type { Command } from './command';

/**
 * Add an atom. moleculeIndex null → a new molecule is appended containing
 * just this atom; otherwise the atom joins the molecule at that index.
 */
export class AddAtom implements Command {
  readonly label = 'Add atom';
  private createdMoleculeIndex: number | null = null;

  constructor(
    private readonly atom: Atom,
    private readonly moleculeIndex: number | null,
  ) {}

  do(doc: Document): Document {
    if (this.moleculeIndex === null) {
      this.createdMoleculeIndex = doc.molecules.length;
      const mol = addAtom(emptyMolecule(), this.atom);
      return { ...doc, molecules: [...doc.molecules, mol] };
    }
    this.createdMoleculeIndex = null;
    return {
      ...doc,
      molecules: doc.molecules.map((m, i) =>
        i === this.moleculeIndex ? addAtom(m, this.atom) : m),
    };
  }

  undo(doc: Document): Document {
    if (this.createdMoleculeIndex !== null) {
      return {
        ...doc,
        molecules: doc.molecules.filter((_, i) => i !== this.createdMoleculeIndex),
      };
    }
    return {
      ...doc,
      molecules: doc.molecules.map((m, i) =>
        i === this.moleculeIndex ? removeAtom(m, this.atom.id) : m),
    };
  }
}

/**
 * Add a bond within a molecule — or, when otherMoleculeIndex is given and
 * differs, merge that molecule into moleculeIndex and bond across the seam.
 * Merge undo restores a molecules snapshot (documents are tiny).
 */
export class AddBond implements Command {
  readonly label = 'Draw bond';
  private snapshot: Molecule[] | null = null;

  constructor(
    private readonly bond: Bond,
    private readonly moleculeIndex: number,
    private readonly otherMoleculeIndex: number | null = null,
  ) {}

  do(doc: Document): Document {
    const merging =
      this.otherMoleculeIndex !== null && this.otherMoleculeIndex !== this.moleculeIndex;
    if (!merging) {
      return {
        ...doc,
        molecules: doc.molecules.map((m, i) =>
          i === this.moleculeIndex ? addBond(m, this.bond) : m),
      };
    }
    this.snapshot = doc.molecules;
    const target = doc.molecules[this.moleculeIndex];
    const source = doc.molecules[this.otherMoleculeIndex];
    const merged = addBond(
      {
        atoms: new Map([...target.atoms, ...source.atoms]),
        bonds: new Map([...target.bonds, ...source.bonds]),
      },
      this.bond,
    );
    const molecules = doc.molecules
      .map((m, i) => (i === this.moleculeIndex ? merged : m))
      .filter((_, i) => i !== this.otherMoleculeIndex);
    return { ...doc, molecules };
  }

  undo(doc: Document): Document {
    if (this.snapshot) return { ...doc, molecules: this.snapshot };
    return {
      ...doc,
      molecules: doc.molecules.map((m, i) =>
        i === this.moleculeIndex ? removeBond(m, this.bond.id) : m),
    };
  }
}

/** Change an atom's element symbol. */
export class SetElement implements Command {
  readonly label = 'Set element';
  private previous: string | null = null;

  constructor(
    private readonly atomId: number,
    private readonly element: string,
  ) {}

  do(doc: Document): Document {
    const loc = findAtom(doc, this.atomId);
    if (!loc) return doc;
    this.previous = loc.atom.element;
    return {
      ...doc,
      molecules: doc.molecules.map((m, i) =>
        i === loc.moleculeIndex ? updateAtom(m, this.atomId, { element: this.element }) : m),
    };
  }

  undo(doc: Document): Document {
    if (this.previous === null) return doc;
    const previous = this.previous;
    const loc = findAtom(doc, this.atomId);
    if (!loc) return doc;
    return {
      ...doc,
      molecules: doc.molecules.map((m, i) =>
        i === loc.moleculeIndex ? updateAtom(m, this.atomId, { element: previous }) : m),
    };
  }
}

/** Set an atom's formal charge. */
export class SetCharge implements Command {
  readonly label = 'Set charge';
  private previous: number | null = null;

  constructor(
    private readonly atomId: number,
    private readonly charge: number,
  ) {}

  do(doc: Document): Document {
    const loc = findAtom(doc, this.atomId);
    if (!loc) return doc;
    this.previous = loc.atom.charge;
    return {
      ...doc,
      molecules: doc.molecules.map((m, i) =>
        i === loc.moleculeIndex ? updateAtom(m, this.atomId, { charge: this.charge }) : m),
    };
  }

  undo(doc: Document): Document {
    if (this.previous === null) return doc;
    const previous = this.previous;
    const loc = findAtom(doc, this.atomId);
    if (!loc) return doc;
    return {
      ...doc,
      molecules: doc.molecules.map((m, i) =>
        i === loc.moleculeIndex ? updateAtom(m, this.atomId, { charge: previous }) : m),
    };
  }
}

export class SetBondOrder implements Command {
  readonly label = 'Set bond order';
  private previous: BondOrder | null = null;

  constructor(
    private readonly bondId: number,
    private readonly order: BondOrder,
  ) {}

  do(doc: Document): Document {
    const loc = findBond(doc, this.bondId);
    if (!loc) return doc;
    this.previous = loc.bond.order;
    return {
      ...doc,
      molecules: doc.molecules.map((m, i) =>
        i === loc.moleculeIndex ? updateBond(m, this.bondId, { order: this.order }) : m),
    };
  }

  undo(doc: Document): Document {
    if (this.previous === null) return doc;
    const previous = this.previous;
    const loc = findBond(doc, this.bondId);
    if (!loc) return doc;
    return {
      ...doc,
      molecules: doc.molecules.map((m, i) =>
        i === loc.moleculeIndex ? updateBond(m, this.bondId, { order: previous }) : m),
    };
  }
}

/**
 * Delete atoms and their incident bonds; molecules left empty are dropped.
 * Undo restores a snapshot of the affected molecules (documents are tiny).
 */
export class DeleteAtoms implements Command {
  readonly label = 'Delete';
  private snapshot: Molecule[] | null = null;

  constructor(private readonly atomIds: number[]) {}

  do(doc: Document): Document {
    this.snapshot = doc.molecules;
    const ids = new Set(this.atomIds);
    const molecules = doc.molecules
      .map((m) => {
        let out = m;
        for (const id of ids) {
          if (out.atoms.has(id)) out = removeAtom(out, id);
        }
        return out;
      })
      .filter((m) => m.atoms.size > 0);
    return { ...doc, molecules };
  }

  undo(doc: Document): Document {
    if (!this.snapshot) return doc;
    return { ...doc, molecules: this.snapshot };
  }
}
