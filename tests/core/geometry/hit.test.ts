import { describe, test, expect } from 'vitest';
import { vec } from '../../../src/core/geometry/vec2';
import { distToSegment, pickAtom, pickBond, pick } from '../../../src/core/geometry/hit';
import { createDocument, withMolecule } from '../../../src/core/model/document';
import { emptyMolecule, addAtom, addBond } from '../../../src/core/model/molecule';
import type { Document } from '../../../src/core/model/document';

function demoDoc(): Document {
  let m = emptyMolecule();
  m = addAtom(m, { id: 1, element: 'C', pos: vec(0, 0), charge: 0, hydrogens: null });
  m = addAtom(m, { id: 2, element: 'C', pos: vec(14.4, 0), charge: 0, hydrogens: null });
  m = addBond(m, { id: 10, a: 1, b: 2, order: 1, stereo: 'none' });
  return withMolecule(createDocument(), m);
}

describe('distToSegment', () => {
  test('perpendicular distance to segment interior', () => {
    expect(distToSegment(vec(5, 3), vec(0, 0), vec(10, 0))).toBeCloseTo(3);
  });

  test('clamps to endpoints outside the segment', () => {
    expect(distToSegment(vec(-4, 3), vec(0, 0), vec(10, 0))).toBeCloseTo(5);
    expect(distToSegment(vec(14, 0), vec(0, 0), vec(10, 0))).toBeCloseTo(4);
  });

  test('zero-length segment is distance to point', () => {
    expect(distToSegment(vec(3, 4), vec(0, 0), vec(0, 0))).toBeCloseTo(5);
  });
});

describe('pickAtom', () => {
  test('nearest atom within radius wins', () => {
    const doc = demoDoc();
    expect(pickAtom(doc, vec(1, 1), 4)).toBe(1);
    expect(pickAtom(doc, vec(13.5, 0.5), 4)).toBe(2);
    expect(pickAtom(doc, vec(7, 7), 4)).toBeNull();
  });
});

describe('pickBond', () => {
  test('point near bond midpoint hits, far point misses', () => {
    const doc = demoDoc();
    expect(pickBond(doc, vec(7.2, 1.5), 3)).toBe(10);
    expect(pickBond(doc, vec(7.2, 8), 3)).toBeNull();
  });
});

describe('pick', () => {
  test('atom takes priority over bond', () => {
    const doc = demoDoc();
    expect(pick(doc, vec(1, 0.5), { atomRadius: 4, bondTolerance: 3 }))
      .toEqual({ kind: 'atom', id: 1 });
  });

  test('falls through to bond', () => {
    const doc = demoDoc();
    expect(pick(doc, vec(7.2, 1.5), { atomRadius: 4, bondTolerance: 3 }))
      .toEqual({ kind: 'bond', id: 10 });
  });

  test('misses both → null', () => {
    const doc = demoDoc();
    expect(pick(doc, vec(7.2, 20), { atomRadius: 4, bondTolerance: 3 })).toBeNull();
  });
});
