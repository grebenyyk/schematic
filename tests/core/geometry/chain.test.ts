import { describe, test, expect } from 'vitest';
import { vec, add, scale, angle } from '../../../src/core/geometry/vec2';
import { defaultBondDirection } from '../../../src/core/geometry/chain';
import { emptyMolecule, addAtom, addBond, type Molecule } from '../../../src/core/model/molecule';

const deg = (v: { x: number; y: number }) => ((angle(v) * 180) / Math.PI + 360) % 360;

function molWith(points: [number, number][], bonds: [number, number][]): Molecule {
  let m = emptyMolecule();
  points.forEach(([x, y], i) => {
    m = addAtom(m, { id: i + 1, element: 'C', pos: vec(x, y), charge: 0, hydrogens: null });
  });
  bonds.forEach(([a, b], i) => {
    m = addBond(m, { id: 100 + i, a: a + 1, b: b + 1, order: 1, stereo: 'none' });
  });
  return m;
}

describe('defaultBondDirection', () => {
  test('isolated atom: points east', () => {
    const m = molWith([[0, 0]], []);
    expect(deg(defaultBondDirection(m, 1))).toBeCloseTo(0);
  });

  test('terminal atom of a single bond: 120° to it (60° off the extension)', () => {
    const m = molWith([[0, 0], [14.4, 0]], [[0, 1]]);
    const d = deg(defaultBondDirection(m, 2));
    expect([60, 300].some((x) => Math.abs(d - x) < 1e-6)).toBe(true);
  });

  test('repeated clicks zigzag: third bond flips to the other side', () => {
    // A(0,0) — B(14.4,0); C added below at +60° (screen y-down)
    const c = add(vec(14.4, 0), scale(vec(Math.cos(Math.PI / 3), Math.sin(Math.PI / 3)), 14.4));
    const m = molWith([[0, 0], [14.4, 0], [c.x, c.y]], [[0, 1], [1, 2]]);
    // next bond from C should continue the zigzag: direction 0° (east), not 120°
    expect(deg(defaultBondDirection(m, 3))).toBeCloseTo(0);
    // and clicking the other end continues the alternating pattern (240°)
    expect(deg(defaultBondDirection(m, 1))).toBeCloseTo(240);
  });

  test('chain middle atom: bisects the largest gap', () => {
    // A — B — C with 120° at B: B→A = 180°, B→C = 60° → largest gap points at 300°
    const c = add(vec(14.4, 0), scale(vec(Math.cos(Math.PI / 3), Math.sin(Math.PI / 3)), 14.4));
    const m = molWith([[0, 0], [14.4, 0], [c.x, c.y]], [[0, 1], [1, 2]]);
    expect(deg(defaultBondDirection(m, 2))).toBeCloseTo(300);
  });

  test('sp center (triple bond): new bond continues linearly', () => {
    // H–C≡N: clicking the carbon adds the methyl straight (180° to C≡N)
    let m = emptyMolecule();
    m = addAtom(m, { id: 1, element: 'C', pos: vec(0, 0), charge: 0, hydrogens: null });
    m = addAtom(m, { id: 2, element: 'N', pos: vec(14.4, 0), charge: 0, hydrogens: null });
    m = addBond(m, { id: 100, a: 1, b: 2, order: 3, stereo: 'none' });
    expect(deg(defaultBondDirection(m, 1))).toBeCloseTo(180);
  });

  test('result is always a unit vector snapped to 15°', () => {
    const m = molWith([[0, 0], [14.4, 3]], [[0, 1]]);
    const d = defaultBondDirection(m, 2);
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(1);
    expect(deg(d) % 15).toBeCloseTo(0);
  });
});
