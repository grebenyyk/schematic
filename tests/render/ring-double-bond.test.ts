import { describe, test, expect } from 'vitest';
import { vec, dist, type Vec2 } from '../../src/core/geometry/vec2';
import { ACS1996 } from '../../src/core/style/presets';
import { emptyMolecule, addAtom, addBond, type Molecule } from '../../src/core/model/molecule';
import { ringPath } from '../../src/core/model/rings';
import { bondAxis, doubleBondLines, ringDoubleBondLines } from '../../src/render/bonds';

/** Benzene: hexagon of side r centered at origin, alternating double bonds. */
function benzene(): { mol: Molecule; doubleBondIds: number[] } {
  let m = emptyMolecule();
  const r = 14.4;
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (90 + i * 60);
    m = addAtom(m, {
      id: i + 1, element: 'C',
      pos: vec(r * Math.cos(a), r * Math.sin(a)),
      charge: 0, hydrogens: null,
    });
  }
  const doubleBondIds: number[] = [];
  for (let i = 0; i < 6; i++) {
    const order = i % 2 === 0 ? 2 : 1;
    m = addBond(m, { id: 10 + i, a: i + 1, b: ((i + 1) % 6) + 1, order, stereo: 'none' });
    if (order === 2) doubleBondIds.push(10 + i);
  }
  return { mol: m, doubleBondIds };
}

describe('ringPath', () => {
  test('finds the path around the ring avoiding the bond itself', () => {
    const { mol } = benzene();
    const path = ringPath(mol, 10); // bond 1–2
    expect(path).not.toBeNull();
    // path goes 1 → 6 → 5 → 4 → 3 → 2 (or reverse), 6 positions
    expect(path).toHaveLength(6);
  });

  test('returns null for an acyclic bond', () => {
    let m = emptyMolecule();
    m = addAtom(m, { id: 1, element: 'C', pos: vec(0, 0), charge: 0, hydrogens: null });
    m = addAtom(m, { id: 2, element: 'C', pos: vec(14.4, 0), charge: 0, hydrogens: null });
    m = addBond(m, { id: 10, a: 1, b: 2, order: 1, stereo: 'none' });
    expect(ringPath(m, 10)).toBeNull();
  });
});

describe('ringDoubleBondLines', () => {
  const center: Vec2 = vec(0, 0);

  test('inner line sits on the ring-interior side for every double bond', () => {
    const { mol, doubleBondIds } = benzene();
    for (const id of doubleBondIds) {
      const bond = mol.bonds.get(id)!;
      const pa = mol.atoms.get(bond.a)!.pos;
      const pb = mol.atoms.get(bond.b)!.pos;
      const axis = bondAxis(pa, pb, 0, 0);
      const path = ringPath(mol, id)!;
      const [onAxis, inner] = ringDoubleBondLines(axis, path, ACS1996);

      // first line is on the axis
      expect(dist(onAxis.p1, axis.a)).toBeCloseTo(0);
      // inner line is closer to the ring center than the axis is
      const mid = (l: { p1: Vec2; p2: Vec2 }) => vec((l.p1.x + l.p2.x) / 2, (l.p1.y + l.p2.y) / 2);
      const axisMid = vec((axis.a.x + axis.b.x) / 2, (axis.a.y + axis.b.y) / 2);
      expect(dist(mid(inner), center)).toBeLessThan(dist(axisMid, center));
      // offset by the full double-bond spacing
      expect(dist(mid(inner), axisMid)).toBeCloseTo(ACS1996.doubleBondSpacing * ACS1996.bondLengthPt);
    }
  });

  test('inner line ends on the corner bisectors, short of the vertices', () => {
    const { mol, doubleBondIds } = benzene();
    const gap = ACS1996.doubleBondSpacing * ACS1996.bondLengthPt;
    for (const id of doubleBondIds) {
      const bond = mol.bonds.get(id)!;
      const pa = mol.atoms.get(bond.a)!.pos;
      const pb = mol.atoms.get(bond.b)!.pos;
      const axis = bondAxis(pa, pb, 0, 0);
      const path = ringPath(mol, id)!;
      const [onAxis, inner] = ringDoubleBondLines(axis, path, ACS1996);

      // on-axis line spans the full edge
      expect(dist(onAxis.p1, axis.a)).toBeCloseTo(0);
      expect(dist(onAxis.p2, axis.b)).toBeCloseTo(0);

      // inner line is trimmed at both ends: gap / (4·sin(120°/2)) for a hexagon
      const trim = gap / (4 * Math.sin(Math.PI / 3));
      const innerLen = dist(inner.p1, inner.p2);
      expect(innerLen).toBeCloseTo(axis.length - 2 * trim, 4);
      // trim points lie along the axis direction from the inner line ends
      expect(dist(inner.p1, axis.a)).toBeCloseTo(Math.hypot(trim, gap), 3);
    }
  });

  test('acyclic double bonds stay symmetric (sanity: existing behavior)', () => {
    const axis = bondAxis(vec(0, 0), vec(14.4, 0), 0, 0);
    const [l1, l2] = doubleBondLines(axis, ACS1996);
    expect(l1.p1.y + l2.p1.y).toBeCloseTo(0);
  });
});
