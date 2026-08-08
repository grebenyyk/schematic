import type { Document } from '../model/document';
import { findAtom, findBond } from '../model/document';
import type { Vec2 } from '../geometry/vec2';
import type { ReactionArrow, Plus } from '../model/reaction';
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

/** Translate a set of atoms by a delta; undo applies the inverse. */
export class MoveAtoms implements Command {
  readonly label = 'Move';

  constructor(
    private readonly atomIds: number[],
    private readonly delta: Vec2,
  ) {}

  do(doc: Document): Document {
    return this.translate(doc, this.delta);
  }

  undo(doc: Document): Document {
    return this.translate(doc, { x: -this.delta.x, y: -this.delta.y });
  }

  private translate(doc: Document, d: Vec2): Document {
    const ids = new Set(this.atomIds);
    return {
      ...doc,
      molecules: doc.molecules.map((m) => {
        let out = m;
        for (const id of ids) {
          const a = out.atoms.get(id);
          if (a) out = updateAtom(out, id, { pos: { x: a.pos.x + d.x, y: a.pos.y + d.y } });
        }
        return out;
      }),
    };
  }
}

/** Rotate a set of atoms around a center by an angle (radians). */
export class RotateAtoms implements Command {
  readonly label = 'Rotate';

  constructor(
    private readonly atomIds: number[],
    private readonly center: Vec2,
    private readonly angle: number,
  ) {}

  do(doc: Document): Document {
    return this.rot(doc, this.angle);
  }

  undo(doc: Document): Document {
    return this.rot(doc, -this.angle);
  }

  private rot(doc: Document, angle: number): Document {
    const ids = new Set(this.atomIds);
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return {
      ...doc,
      molecules: doc.molecules.map((m) => {
        let out = m;
        for (const id of ids) {
          const a = out.atoms.get(id);
          if (a) {
            const dx = a.pos.x - this.center.x;
            const dy = a.pos.y - this.center.y;
            out = updateAtom(out, id, {
              pos: {
                x: this.center.x + dx * c - dy * s,
                y: this.center.y + dx * s + dy * c,
              },
            });
          }
        }
        return out;
      }),
    };
  }
}

/** Uniformly scale a set of atoms around a center. */
export class ScaleAtoms implements Command {
  readonly label = 'Scale';

  constructor(
    private readonly atomIds: number[],
    private readonly center: Vec2,
    private readonly factor: number,
  ) {}

  do(doc: Document): Document {
    return this.scaleBy(doc, this.factor);
  }

  undo(doc: Document): Document {
    return this.scaleBy(doc, 1 / this.factor);
  }

  private scaleBy(doc: Document, f: number): Document {
    const ids = new Set(this.atomIds);
    return {
      ...doc,
      molecules: doc.molecules.map((m) => {
        let out = m;
        for (const id of ids) {
          const a = out.atoms.get(id);
          if (a) {
            out = updateAtom(out, id, {
              pos: {
                x: this.center.x + (a.pos.x - this.center.x) * f,
                y: this.center.y + (a.pos.y - this.center.y) * f,
              },
            });
          }
        }
        return out;
      }),
    };
  }
}

/** Delete bonds (atoms stay). Snapshot-based undo, like DeleteAtoms. */
export class DeleteBonds implements Command {
  readonly label = 'Delete bond';
  private snapshot: Molecule[] | null = null;

  constructor(private readonly bondIds: number[]) {}

  do(doc: Document): Document {
    this.snapshot = doc.molecules;
    const ids = new Set(this.bondIds);
    return {
      ...doc,
      molecules: doc.molecules.map((m) => {
        let out = m;
        for (const id of ids) {
          if (out.bonds.has(id)) out = removeBond(out, id);
        }
        return out;
      }),
    };
  }

  undo(doc: Document): Document {
    if (!this.snapshot) return doc;
    return { ...doc, molecules: this.snapshot };
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

/** Append a reaction arrow; undo removes it. */
export class AddArrow implements Command {
  readonly label = 'Add arrow';
  constructor(private readonly arrow: ReactionArrow) {}

  do(doc: Document): Document {
    return { ...doc, arrows: [...doc.arrows, this.arrow] };
  }
  undo(doc: Document): Document {
    return { ...doc, arrows: doc.arrows.filter((a) => a.id !== this.arrow.id) };
  }
}

/** Append a plus sign; undo removes it. */
export class AddPlus implements Command {
  readonly label = 'Add plus';
  constructor(private readonly plus: Plus) {}

  do(doc: Document): Document {
    return { ...doc, pluses: [...doc.pluses, this.plus] };
  }
  undo(doc: Document): Document {
    return { ...doc, pluses: doc.pluses.filter((p) => p.id !== this.plus.id) };
  }
}

/** Translate a set of arrows by a delta; undo applies the inverse. */
export class MoveArrows implements Command {
  readonly label = 'Move';
  constructor(
    private readonly ids: number[],
    private readonly delta: Vec2,
  ) {}

  do(doc: Document): Document {
    return this.translate(doc, this.delta);
  }
  undo(doc: Document): Document {
    return this.translate(doc, { x: -this.delta.x, y: -this.delta.y });
  }

  private translate(doc: Document, d: Vec2): Document {
    const ids = new Set(this.ids);
    return {
      ...doc,
      arrows: doc.arrows.map((a) =>
        ids.has(a.id)
          ? { ...a, from: { x: a.from.x + d.x, y: a.from.y + d.y }, to: { x: a.to.x + d.x, y: a.to.y + d.y } }
          : a),
    };
  }
}

/** Translate a set of plus signs by a delta; undo applies the inverse. */
export class MovePluses implements Command {
  readonly label = 'Move';
  constructor(
    private readonly ids: number[],
    private readonly delta: Vec2,
  ) {}

  do(doc: Document): Document {
    return this.translate(doc, this.delta);
  }
  undo(doc: Document): Document {
    return this.translate(doc, { x: -this.delta.x, y: -this.delta.y });
  }

  private translate(doc: Document, d: Vec2): Document {
    const ids = new Set(this.ids);
    return {
      ...doc,
      pluses: doc.pluses.map((p) =>
        ids.has(p.id) ? { ...p, pos: { x: p.pos.x + d.x, y: p.pos.y + d.y } } : p),
    };
  }
}

/** Delete arrows. Snapshot-based undo, like DeleteAtoms. */
export class DeleteArrows implements Command {
  readonly label = 'Delete arrow';
  private snapshot: ReactionArrow[] | null = null;

  constructor(private readonly ids: number[]) {}

  do(doc: Document): Document {
    this.snapshot = doc.arrows;
    const ids = new Set(this.ids);
    return { ...doc, arrows: doc.arrows.filter((a) => !ids.has(a.id)) };
  }
  undo(doc: Document): Document {
    if (!this.snapshot) return doc;
    return { ...doc, arrows: this.snapshot };
  }
}

/** Delete plus signs. Snapshot-based undo, like DeleteAtoms. */
export class DeletePluses implements Command {
  readonly label = 'Delete plus';
  private snapshot: Plus[] | null = null;

  constructor(private readonly ids: number[]) {}

  do(doc: Document): Document {
    this.snapshot = doc.pluses;
    const ids = new Set(this.ids);
    return { ...doc, pluses: doc.pluses.filter((p) => !ids.has(p.id)) };
  }
  undo(doc: Document): Document {
    if (!this.snapshot) return doc;
    return { ...doc, pluses: this.snapshot };
  }
}
