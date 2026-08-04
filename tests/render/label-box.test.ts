import { describe, test, expect } from 'vitest';
import { vec } from '../../src/core/geometry/vec2';
import { ACS1996 } from '../../src/core/style/presets';
import { emptyMolecule, addAtom, addBond, type Molecule } from '../../src/core/model/molecule';
import { labelBox, labelBoxes, rayBoxDistance } from '../../src/render/labels';
import { bondRenderAxis } from '../../src/render/renderer';

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

  test('OH (bond left): shifted right so the O letter sits at the atom position', () => {
    const { mol, id } = molWith('O', 0, [{ deg: 180 }]);
    const box = labelBox(mol, id, ACS1996, measure);
    expect(box.cx).toBeCloseTo(3); // +width('H')/2
    expect(box.halfW).toBeCloseTo(6); // 'OH' = 12pt
  });

  test('adding a charge does not move the element letter (OH → O⁻)', () => {
    const bondLeft = [{ deg: 180 }];
    const oh = labelBox(molWith('O', 0, bondLeft).mol, 1, ACS1996, measure);
    const oMinus = labelBox(molWith('O', -1, bondLeft).mol, 1, ACS1996, measure);
    // element letter center = box left edge + width('O')/2 (nothing on the left)
    const oCenter = (b: typeof oh) => b.cx - b.halfW + 6 / 2;
    expect(oCenter(oh)).toBeCloseTo(0);
    expect(oCenter(oMinus)).toBeCloseTo(0);
  });

  test('charge extends the box upward', () => {
    const plain = labelBox(molWith('N', 0, [{ deg: 180 }, { deg: 0 }]).mol, 1, ACS1996, measure); // –NH–
    const charged = labelBox(molWith('N', 1, [{ deg: 180 }, { deg: 0 }]).mol, 1, ACS1996, measure); // –NH2+–
    expect(charged.halfHUp).toBeGreaterThan(plain.halfHUp);
    expect(charged.halfW).toBeGreaterThan(plain.halfW);
  });
});

describe('rayBoxDistance', () => {
  const box = { cx: 0, cy: 0, halfW: 4, halfHUp: 2, halfHDown: 2 };

  test('from inside: distance to the exit edge', () => {
    expect(rayBoxDistance(vec(0, 0), vec(1, 0), box)).toBeCloseTo(4);
    expect(rayBoxDistance(vec(0, 0), vec(-1, 0), box)).toBeCloseTo(4);
    expect(rayBoxDistance(vec(0, 0), vec(0, -1), box)).toBeCloseTo(2);
    expect(rayBoxDistance(vec(0, 0), vec(0, 1), box)).toBeCloseTo(2);
  });

  test('diagonal exits at whichever edge comes first', () => {
    const d = Math.SQRT1_2;
    expect(rayBoxDistance(vec(0, 0), vec(d, -d), box)).toBeCloseTo(2 / d);
  });

  test('asymmetric box respects vertical imbalance', () => {
    const b = { cx: 0, cy: 0, halfW: 4, halfHUp: 5, halfHDown: 1 };
    expect(rayBoxDistance(vec(0, 0), vec(0, -1), b)).toBeCloseTo(5);
    expect(rayBoxDistance(vec(0, 0), vec(0, 1), b)).toBeCloseTo(1);
  });

  test('from outside: distance to the entry edge', () => {
    expect(rayBoxDistance(vec(-10, 0), vec(1, 0), box)).toBeCloseTo(6);
    expect(rayBoxDistance(vec(0, -10), vec(0, 1), box)).toBeCloseTo(8);
  });

  test('ray that misses returns Infinity', () => {
    expect(rayBoxDistance(vec(-10, 0), vec(-1, 0), box)).toBe(Infinity);
    expect(rayBoxDistance(vec(-10, 10), vec(1, 0), box)).toBe(Infinity);
  });
});

describe('labelBoxes (main + charge superscript box)', () => {
  test('charged label yields a second box above the right end', () => {
    const { mol, id } = molWith('O', -1, [{ deg: 180 }]);
    const boxes = labelBoxes(mol, id, ACS1996, measure);
    expect(boxes).toHaveLength(2);
    const [main, sup] = boxes;
    expect(sup.cx).toBeGreaterThan(main.cx);
    expect(sup.halfHUp).toBeGreaterThan(main.halfHUp);
  });

  test('uncharged label is a single box', () => {
    const { mol, id } = molWith('O', 0, [{ deg: 180, order: 2 }]);
    expect(labelBoxes(mol, id, ACS1996, measure)).toHaveLength(1);
  });

  test('acetic C–O bond keeps its drawn length when OH becomes O⁻', () => {
    const build = (charge: number) => {
      let m = emptyMolecule();
      m = addAtom(m, { id: 1, element: 'O', pos: vec(0, 0), charge, hydrogens: null });
      m = addAtom(m, { id: 2, element: 'C', pos: vec(-7.2, -12.47), charge: 0, hydrogens: null });
      m = addBond(m, { id: 10, a: 1, b: 2, order: 1, stereo: 'none' });
      return m;
    };
    const oh = build(0);
    const oMinus = build(-1);
    const axisOH = bondRenderAxis(oh, oh.bonds.get(10)!, ACS1996);
    const axisOM = bondRenderAxis(oMinus, oMinus.bonds.get(10)!, ACS1996);
    expect(axisOM.length).toBeCloseTo(axisOH.length, 4);
  });
});
