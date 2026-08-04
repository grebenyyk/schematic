import { describe, test, expect } from 'vitest';
import { vec, angle, dist } from '../../../src/core/geometry/vec2';
import { snapAngle, snapBondPoint, mergeTarget } from '../../../src/core/geometry/snapping';
import { createDocument, withMolecule } from '../../../src/core/model/document';
import { emptyMolecule, addAtom } from '../../../src/core/model/molecule';

describe('snapAngle', () => {
  test('snaps to nearest 15° preserving distance', () => {
    const from = vec(0, 0);
    const to = vec(10, 1.4); // ~8°, distance ~10.1
    const snapped = snapAngle(from, to, 15);
    const deg = (angle({ x: snapped.x - from.x, y: snapped.y - from.y }) * 180) / Math.PI;
    expect(Math.round(deg / 15) * 15).toBeCloseTo(deg, 5);
    expect(deg).toBeCloseTo(15, 0);
    expect(dist(from, snapped)).toBeCloseTo(dist(from, to), 5);
  });

  test('already-snapped angle stays put', () => {
    const from = vec(0, 0);
    const to = vec(0, 10); // exactly 90°
    const snapped = snapAngle(from, to, 15);
    expect(snapped.x).toBeCloseTo(0);
    expect(snapped.y).toBeCloseTo(10);
  });
});

describe('snapBondPoint', () => {
  test('snaps both angle and length near bond length', () => {
    const from = vec(0, 0);
    const to = vec(14.0, 0.5); // near-horizontal, near 14.4
    const p = snapBondPoint(from, to, 14.4, 15, 3);
    expect(dist(from, p)).toBeCloseTo(14.4);
    const deg = (angle(p) * 180) / Math.PI;
    expect(deg).toBeCloseTo(0, 0);
  });

  test('length outside tolerance stays free, angle still snapped', () => {
    const from = vec(0, 0);
    const to = vec(30.2, 1.5);
    const p = snapBondPoint(from, to, 14.4, 15, 3);
    expect(dist(from, p)).toBeCloseTo(dist(from, to), 1);
    const deg = (angle(p) * 180) / Math.PI;
    expect(deg).toBeCloseTo(0, 0);
  });
});

describe('mergeTarget', () => {
  test('returns nearest atom within radius, else null', () => {
    let m = emptyMolecule();
    m = addAtom(m, { id: 1, element: 'C', pos: vec(0, 0), charge: 0, hydrogens: null });
    m = addAtom(m, { id: 2, element: 'C', pos: vec(14.4, 0), charge: 0, hydrogens: null });
    const doc = withMolecule(createDocument(), m);
    expect(mergeTarget(doc, vec(13, 1), 3)).toBe(2);
    expect(mergeTarget(doc, vec(6, 6), 3)).toBeNull();
  });
});
