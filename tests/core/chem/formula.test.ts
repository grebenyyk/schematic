import { describe, test, expect } from 'vitest';
import { vec } from '../../../src/core/geometry/vec2';
import { createDocument, withMolecule } from '../../../src/core/model/document';
import { emptyMolecule, addAtom, addBond, type Molecule } from '../../../src/core/model/molecule';
import { hillFormula, molecularWeight, formulaText } from '../../../src/core/chem/formula';

function mol(spec: [string, number, number][], bonds: [number, number, 1 | 2 | 3][]): Molecule {
  let m = emptyMolecule();
  spec.forEach(([el, x, y], i) => {
    m = addAtom(m, { id: i + 1, element: el, pos: vec(x, y), charge: 0, hydrogens: null });
  });
  bonds.forEach(([a, b, order], i) => {
    m = addBond(m, { id: 100 + i, a: a + 1, b: b + 1, order, stereo: 'none' });
  });
  return m;
}

// acetic acid: CH3–C(=O)–OH
const acetic = mol(
  [['C', 0, 0], ['C', 14.4, 0], ['O', 21.6, -12.5], ['O', 28.8, 0]],
  [[0, 1, 1], [1, 2, 2], [1, 3, 1]],
);

describe('hillFormula', () => {
  test('acetic acid is C2H4O2 (implicit H counted)', () => {
    const counts = hillFormula(withMolecule(createDocument(), acetic));
    expect(counts.get('C')).toBe(2);
    expect(counts.get('H')).toBe(4);
    expect(counts.get('O')).toBe(2);
  });

  test('isolated atoms count too', () => {
    const m = mol([['N', 0, 0], ['Cl', 20, 0]], []);
    const counts = hillFormula(withMolecule(createDocument(), m));
    expect(counts.get('N')).toBe(1);
    expect(counts.get('H')).toBe(4); // NH3 + HCl
    expect(counts.get('Cl')).toBe(1);
  });

  test('empty document is empty', () => {
    expect(hillFormula(createDocument()).size).toBe(0);
  });

  test('selection filter counts only the selected atoms, H from full context', () => {
    const doc = withMolecule(createDocument(), acetic);
    // select just the methyl carbon (atom 1)
    const counts = hillFormula(doc, new Set([1]));
    expect(counts.get('C')).toBe(1);
    expect(counts.get('H')).toBe(3); // CH3
    expect(counts.get('O')).toBeUndefined();
    // select the two oxygens
    const oxygens = hillFormula(doc, new Set([3, 4]));
    expect(oxygens.get('O')).toBe(2);
    expect(oxygens.get('H')).toBe(1); // the OH hydrogen
  });
});

describe('molecularWeight', () => {
  test('acetic acid ≈ 60.05 g/mol', () => {
    const counts = hillFormula(withMolecule(createDocument(), acetic));
    expect(molecularWeight(counts)).toBeCloseTo(60.05, 1);
  });
});

describe('formulaText', () => {
  test('Hill order: C, H, then alphabetical, with unicode subscripts', () => {
    const counts = hillFormula(withMolecule(createDocument(), acetic));
    expect(formulaText(counts)).toBe('C₂H₄O₂');
  });

  test('no carbon: plain alphabetical', () => {
    const m = mol([['N', 0, 0]], []);
    const counts = hillFormula(withMolecule(createDocument(), m));
    expect(formulaText(counts)).toBe('H₃N');
  });
});
