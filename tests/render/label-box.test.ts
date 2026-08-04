import { describe, test, expect } from 'vitest';
import { vec } from '../../src/core/geometry/vec2';
import { ACS1996 } from '../../src/core/style/presets';
import { emptyMolecule, addAtom, addBond, type Molecule } from '../../src/core/model/molecule';
import { labelBox, rayRectExit } from '../../src/render/labels';

// fixed measurer: 6pt per full char, scaled for sub/superscripts
const measure = (t: string, scale = 1) => t.length * 6 * scale;

function molWith(
  element: string,
  charge = 0,
  bonds: { deg: number; order?: 1 | 2 | 3 }[] = [],
): { mol: Molecule; id: number } {
  let m = emptyMolecule();
  m = addAtom(m, { id: 1, element, pos: vec(0, 0), charge, hydrogens: null });
  bonds.forEach(({ deg, order = 1 }, i) => {
    const a = (deg * Math.PI) / 180;
    m = addAtom(m, { id: 10 + i, element: 'C', pos: vec(14.4 * Math.cos(a), 14.4 * Math.sin(a)), charge: 0, hydrogens: null });
    m = addBond(m, { id: 100 + i, a: 1, b: 10 + i, order, stereo: 'none' });
  });
  return { mol: m, id: 1 };
}

describe('labelBox', () => {
  test('single letter: centered box, measured width', () => {
    const { mol, id } = molWith('O', 0, [{ deg: 180, order: 2 }]); // =O
    const box = labelBox(mol, id, ACS1996, measure);
    expect(box.cx).toBeCloseTo(0);
    expect(box.halfW).toBeCloseTo(3); // 'O' = 6pt wide
  });

  test('OH (bond left): shifted left of center, wider', () => {
    const { mol, id } = molWith('O', 0, [{ deg: 180 }]);
    const box = labelBox(mol, id, ACS1996, measure);
    expect(box.cx).toBeCloseTo(-3); // shift = -width('H')/2
    expect(box.halfW).toBeCloseTo(6); // 'OH' = 12pt
  });

  test('charge extends the box upward', () => {
    const plain = labelBox(molWith('N', 0, [{ deg: 180 }, { deg: 0 }]).mol, 1, ACS1996, measure); // –NH–
    const charged = labelBox(molWith('N', 1, [{ deg: 180 }, { deg: 0 }]).mol, 1, ACS1996, measure); // –NH2+–
    expect(charged.halfHUp).toBeGreaterThan(plain.halfHUp);
    expect(charged.halfW).toBeGreaterThan(plain.halfW);
  });
});

describe('rayRectExit', () => {
  const box = { cx: 0, cy: 0, halfW: 4, halfHUp: 2, halfHDown: 2 };

  test('horizontal ray exits at the side edge', () => {
    expect(rayRectExit(vec(0, 0), vec(1, 0), box)).toBeCloseTo(4);
    expect(rayRectExit(vec(0, 0), vec(-1, 0), box)).toBeCloseTo(4);
  });

  test('vertical ray exits at top/bottom edges', () => {
    expect(rayRectExit(vec(0, 0), vec(0, -1), box)).toBeCloseTo(2);
    expect(rayRectExit(vec(0, 0), vec(0, 1), box)).toBeCloseTo(2);
  });

  test('diagonal exits at whichever edge comes first', () => {
    // 45°: reaches x=4 at t=5.66, y=2 at t=2.83 → top edge first
    const d = Math.SQRT1_2;
    expect(rayRectExit(vec(0, 0), vec(d, -d), box)).toBeCloseTo(2 / d);
  });

  test('asymmetric box respects vertical imbalance', () => {
    const b = { cx: 0, cy: 0, halfW: 4, halfHUp: 5, halfHDown: 1 };
    expect(rayRectExit(vec(0, 0), vec(0, -1), b)).toBeCloseTo(5);
    expect(rayRectExit(vec(0, 0), vec(0, 1), b)).toBeCloseTo(1);
  });
});
