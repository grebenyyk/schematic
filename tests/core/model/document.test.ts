import { describe, test, expect } from 'vitest';
import { vec } from '../../../src/core/geometry/vec2';
import {
  createDocument, allocId, withMolecule, updateMolecule, findAtom, findBond,
  allAtoms, allBonds,
} from '../../../src/core/model/document';
import { emptyMolecule, addAtom, addBond } from '../../../src/core/model/molecule';

function twoAtomDoc() {
  let doc = createDocument();
  let m = emptyMolecule();
  const a1 = allocId(doc); doc = a1.doc;
  const a2 = allocId(doc); doc = a2.doc;
  const b1 = allocId(doc); doc = b1.doc;
  m = addAtom(m, { id: a1.id, element: 'C', pos: vec(0, 0), charge: 0, hydrogens: null });
  m = addAtom(m, { id: a2.id, element: 'O', pos: vec(14.4, 0), charge: 0, hydrogens: null });
  m = addBond(m, { id: b1.id, a: a1.id, b: a2.id, order: 2, stereo: 'none' });
  doc = withMolecule(doc, m);
  return { doc, a1: a1.id, a2: a2.id, b1: b1.id };
}

describe('document', () => {
  test('createDocument is empty with nextId 1', () => {
    const doc = createDocument();
    expect(doc.molecules).toEqual([]);
    expect(doc.meta.nextId).toBe(1);
    expect(doc.selection.atoms.size).toBe(0);
  });

  test('allocId returns increasing ids and advances nextId', () => {
    const d0 = createDocument();
    const r1 = allocId(d0);
    const r2 = allocId(r1.doc);
    expect(r1.id).toBe(1);
    expect(r2.id).toBe(2);
    expect(r2.doc.meta.nextId).toBe(3);
    expect(d0.meta.nextId).toBe(1);
  });

  test('withMolecule appends a molecule', () => {
    const { doc } = twoAtomDoc();
    expect(doc.molecules).toHaveLength(1);
    expect(doc.molecules[0].atoms.size).toBe(2);
  });

  test('findAtom and findBond locate by id across molecules', () => {
    const { doc, a2, b1 } = twoAtomDoc();
    expect(findAtom(doc, a2)?.atom.element).toBe('O');
    expect(findAtom(doc, 999)).toBeNull();
    expect(findBond(doc, b1)?.bond.order).toBe(2);
    expect(findBond(doc, 999)).toBeNull();
  });

  test('updateMolecule replaces molecule at index immutably', () => {
    const { doc, a1 } = twoAtomDoc();
    const loc = findAtom(doc, a1)!;
    const updated = updateMolecule(doc, loc.moleculeIndex, (m) => ({
      ...m,
      atoms: new Map([...m.atoms, [a1, { ...m.atoms.get(a1)!, element: 'N' }]]),
    }));
    expect(findAtom(updated, a1)?.atom.element).toBe('N');
    expect(findAtom(doc, a1)?.atom.element).toBe('C');
  });

  test('allAtoms / allBonds flatten across molecules', () => {
    const { doc, a1, a2, b1 } = twoAtomDoc();
    expect([...allAtoms(doc)].map((a) => a.id).sort()).toEqual([a1, a2].sort());
    expect([...allBonds(doc)].map((b) => b.id)).toEqual([b1]);
  });
});
