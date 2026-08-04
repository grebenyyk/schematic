import { describe, test, expect } from 'vitest';
import { vec } from '../../../src/core/geometry/vec2';
import {
  emptyMolecule, addAtom, addBond, removeAtom, removeBond, updateAtom,
  bondsOf, neighborIds, type Atom,
} from '../../../src/core/model/molecule';

const c = (id: number, x = 0, y = 0): Atom => ({
  id, element: 'C', pos: vec(x, y), charge: 0, hydrogens: null,
});

describe('molecule ops', () => {
  test('addAtom returns new molecule containing the atom', () => {
    const m0 = emptyMolecule();
    const m1 = addAtom(m0, c(1));
    expect(m0.atoms.size).toBe(0);
    expect(m1.atoms.get(1)?.element).toBe('C');
  });

  test('addBond connects two atoms', () => {
    let m = emptyMolecule();
    m = addAtom(m, c(1));
    m = addAtom(m, c(2, 14.4, 0));
    m = addBond(m, { id: 10, a: 1, b: 2, order: 1, stereo: 'none' });
    expect(m.bonds.get(10)).toMatchObject({ a: 1, b: 2, order: 1 });
  });

  test('removeAtom also removes incident bonds', () => {
    let m = emptyMolecule();
    m = addAtom(m, c(1));
    m = addAtom(m, c(2, 14.4, 0));
    m = addAtom(m, c(3, 28.8, 0));
    m = addBond(m, { id: 10, a: 1, b: 2, order: 1, stereo: 'none' });
    m = addBond(m, { id: 11, a: 2, b: 3, order: 2, stereo: 'none' });
    const m2 = removeAtom(m, 2);
    expect(m2.atoms.size).toBe(2);
    expect(m2.bonds.size).toBe(0);
    expect(m.bonds.size).toBe(2); // original untouched
  });

  test('removeBond keeps atoms', () => {
    let m = emptyMolecule();
    m = addAtom(m, c(1));
    m = addAtom(m, c(2, 14.4, 0));
    m = addBond(m, { id: 10, a: 1, b: 2, order: 1, stereo: 'none' });
    const m2 = removeBond(m, 10);
    expect(m2.atoms.size).toBe(2);
    expect(m2.bonds.size).toBe(0);
  });

  test('updateAtom patches fields immutably', () => {
    let m = emptyMolecule();
    m = addAtom(m, c(1));
    const m2 = updateAtom(m, 1, { element: 'N', charge: 1 });
    expect(m2.atoms.get(1)).toMatchObject({ element: 'N', charge: 1 });
    expect(m.atoms.get(1)?.element).toBe('C');
  });

  test('bondsOf and neighborIds report connectivity', () => {
    let m = emptyMolecule();
    m = addAtom(m, c(1));
    m = addAtom(m, c(2));
    m = addAtom(m, c(3));
    m = addBond(m, { id: 10, a: 1, b: 2, order: 1, stereo: 'none' });
    m = addBond(m, { id: 11, a: 2, b: 3, order: 1, stereo: 'none' });
    expect([...bondsOf(m, 2)].sort()).toEqual([10, 11]);
    expect([...neighborIds(m, 2)].sort()).toEqual([1, 3]);
    expect([...bondsOf(m, 1)]).toEqual([10]);
  });
});
