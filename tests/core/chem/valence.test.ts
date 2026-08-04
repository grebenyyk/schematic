import { describe, test, expect } from 'vitest';
import { vec } from '../../../src/core/geometry/vec2';
import { implicitHydrogens } from '../../../src/core/chem/valence';
import { emptyMolecule, addAtom, addBond, type Atom, type BondOrder, type Molecule } from '../../../src/core/model/molecule';

function mol(
  element: string,
  bonds: BondOrder[],
  charge = 0,
): { m: Molecule; id: number } {
  let m = emptyMolecule();
  const atom: Atom = { id: 1, element, pos: vec(0, 0), charge, hydrogens: null };
  m = addAtom(m, atom);
  bonds.forEach((order, i) => {
    m = addAtom(m, { id: 10 + i, element: 'C', pos: vec(14.4 * (i + 1), 0), charge: 0, hydrogens: null });
    m = addBond(m, { id: 100 + i, a: 1, b: 10 + i, order, stereo: 'none' });
  });
  return { m, id: 1 };
}

describe('implicitHydrogens', () => {
  test('isolated atoms get their full valence in H', () => {
    expect(implicitHydrogens(mol('C', []).m, 1)).toBe(4);
    expect(implicitHydrogens(mol('N', []).m, 1)).toBe(3);
    expect(implicitHydrogens(mol('O', []).m, 1)).toBe(2);
    expect(implicitHydrogens(mol('Cl', []).m, 1)).toBe(1);
  });

  test('bonds consume valence by order', () => {
    expect(implicitHydrogens(mol('O', [1]).m, 1)).toBe(1);   // –OH
    expect(implicitHydrogens(mol('O', [2]).m, 1)).toBe(0);   // =O
    expect(implicitHydrogens(mol('N', [1, 1]).m, 1)).toBe(1); // –NH–
    expect(implicitHydrogens(mol('N', [1]).m, 1)).toBe(2);    // –NH2
    expect(implicitHydrogens(mol('N', [3]).m, 1)).toBe(0);    // ≡N
    expect(implicitHydrogens(mol('C', [1]).m, 1)).toBe(3);    // –CH3
    expect(implicitHydrogens(mol('C', [1, 2]).m, 1)).toBe(1); // =CH–
  });

  test('charge adjusts valence', () => {
    expect(implicitHydrogens(mol('N', [1, 1, 1, 1], 1).m, 1)).toBe(0); // NH4+
    expect(implicitHydrogens(mol('N', [1, 1, 1], 1).m, 1)).toBe(1);    // –NH3+
    expect(implicitHydrogens(mol('O', [1], -1).m, 1)).toBe(0);         // –O−
    expect(implicitHydrogens(mol('O', [1, 1, 1], 1).m, 1)).toBe(0);    // –OH2+ (oxocenium)
  });

  test('aromatic bonds count 1.5', () => {
    // pyridine-like N in a ring with two aromatic bonds
    expect(implicitHydrogens(mol('N', ['aromatic', 'aromatic']).m, 1)).toBe(0);
    // pyrrole-like N
    expect(implicitHydrogens(mol('N', ['aromatic', 'aromatic', 1]).m, 1)).toBe(0);
  });

  test('explicit hydrogens override wins', () => {
    const { m } = mol('N', [1]);
    const m2 = { ...m, atoms: new Map([...m.atoms, [1, { ...m.atoms.get(1)!, hydrogens: 0 }]]) };
    expect(implicitHydrogens(m2, 1)).toBe(0);
  });

  test('never negative', () => {
    expect(implicitHydrogens(mol('O', [1, 1, 1]).m, 1)).toBe(0);
  });
});
