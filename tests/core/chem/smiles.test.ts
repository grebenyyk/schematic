import { describe, test, expect } from 'vitest';
import { parseSmiles } from '../../../src/core/chem/smiles';
import type { Molecule } from '../../../src/core/model/molecule';

const orderBetween = (mol: Molecule, a: number, b: number) =>
  [...mol.bonds.values()].find(
    (bd) => (bd.a === a && bd.b === b) || (bd.a === b && bd.b === a),
  )?.order;

describe('parseSmiles', () => {
  test('CCO → three atoms, two single bonds', () => {
    const [m] = parseSmiles('CCO');
    expect([...m!.atoms.values()].map((a) => a.element)).toEqual(['C', 'C', 'O']);
    expect(m!.bonds.size).toBe(2);
    expect([...m!.bonds.values()].every((b) => b.order === 1)).toBe(true);
  });

  test('C=C and C#C set double/triple order', () => {
    expect([...parseSmiles('C=C')[0]!.bonds.values()][0].order).toBe(2);
    expect([...parseSmiles('C#C')[0]!.bonds.values()][0].order).toBe(3);
  });

  test('c1ccccc1 kekulizes to benzene: 6 carbons, 3 double / 3 single, no aromatic', () => {
    const [m] = parseSmiles('c1ccccc1');
    expect([...m!.atoms.values()].every((a) => a.element === 'C')).toBe(true);
    expect(m!.atoms.size).toBe(6);
    expect(m!.bonds.size).toBe(6);
    const orders = [...m!.bonds.values()].map((b) => b.order);
    expect(orders.filter((o) => o === 2).length).toBe(3);
    expect(orders.filter((o) => o === 1).length).toBe(3);
    expect(orders.every((o) => o !== 'aromatic')).toBe(true);
  });

  test('bracket atoms: charge, explicit H, isotope', () => {
    const oh = parseSmiles('[OH-]')[0]!;
    const o = oh.atoms.get(1)!;
    expect(o.element).toBe('O');
    expect(o.charge).toBe(-1);
    expect(o.hydrogens).toBe(1);

    const na = parseSmiles('[Na+]')[0]!;
    expect(na.atoms.get(1)!.element).toBe('Na');
    expect(na.atoms.get(1)!.charge).toBe(1);
    expect(na.atoms.get(1)!.hydrogens).toBe(0);

    const iso = parseSmiles('[13C]')[0]!;
    expect(iso.atoms.get(1)!.isotope).toBe(13);
  });

  test('CC(=O)O → acetic acid with the carbonyl double bond', () => {
    const [m] = parseSmiles('CC(=O)O');
    expect(m!.atoms.size).toBe(4);
    expect(m!.bonds.size).toBe(3);
    expect(orderBetween(m!, 2, 3)).toBe(2); // C=O
    expect(orderBetween(m!, 1, 2)).toBe(1);
    expect(orderBetween(m!, 2, 4)).toBe(1);
  });

  test('C1CCCCC1 → cyclohexane: six single bonds', () => {
    const [m] = parseSmiles('C1CCCCC1');
    expect(m!.atoms.size).toBe(6);
    expect(m!.bonds.size).toBe(6);
    expect([...m!.bonds.values()].every((b) => b.order === 1)).toBe(true);
  });

  test('"." separates fragments', () => {
    expect(parseSmiles('CC.CC')).toHaveLength(2);
    expect(parseSmiles('CC.CC').every((m) => m.atoms.size === 2)).toBe(true);
  });
});
