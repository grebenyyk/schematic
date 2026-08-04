import { describe, test, expect } from 'vitest';
import { vec, len, sub, dist } from '../../src/core/geometry/vec2';
import { ACS1996 } from '../../src/core/style/presets';
import {
  bondAxis, doubleBondLines, tripleBondLines, wedgePolygon, hashSegments,
} from '../../src/render/bonds';

const L = ACS1996.bondLengthPt;

describe('bondAxis', () => {
  test('computes unit direction and normal for a horizontal bond', () => {
    const ax = bondAxis(vec(0, 0), vec(L, 0), 0, 0);
    expect(ax.dir).toEqual({ x: 1, y: 0 });
    expect(ax.normal).toEqual({ x: 0, y: 1 });
    expect(ax.length).toBeCloseTo(L);
  });

  test('trims endpoints by the given margins', () => {
    const ax = bondAxis(vec(0, 0), vec(L, 0), 2, 3);
    expect(ax.a.x).toBeCloseTo(2);
    expect(ax.b.x).toBeCloseTo(L - 3);
    expect(ax.length).toBeCloseTo(L - 5);
  });
});

describe('doubleBondLines', () => {
  test('returns two parallel lines symmetric about the axis', () => {
    const ax = bondAxis(vec(0, 0), vec(L, 0), 0, 0);
    const [l1, l2] = doubleBondLines(ax, ACS1996);
    const gap = ACS1996.doubleBondSpacing * L;
    expect(dist(l1.p1, l2.p1)).toBeCloseTo(gap);
    // both lines parallel to x-axis
    expect(l1.p1.y).toBeCloseTo(l1.p2.y);
    expect(l2.p1.y).toBeCloseTo(l2.p2.y);
    // symmetric
    expect(l1.p1.y + l2.p1.y).toBeCloseTo(0);
  });
});

describe('tripleBondLines', () => {
  test('returns center line plus two outer lines', () => {
    const ax = bondAxis(vec(0, 0), vec(L, 0), 0, 0);
    const lines = tripleBondLines(ax, ACS1996);
    expect(lines).toHaveLength(3);
    expect(lines[0].p1).toEqual(ax.a);
    const gap = ACS1996.doubleBondSpacing * L;
    expect(dist(lines[1].p1, lines[2].p1)).toBeCloseTo(2 * gap);
  });
});

describe('wedgePolygon', () => {
  test('wide end at a (boldWidth), sharp tip at b', () => {
    const ax = bondAxis(vec(0, 0), vec(L, 0), 0, 0);
    const poly = wedgePolygon(ax, ACS1996);
    expect(poly).toHaveLength(3);
    const [p1, p2, tip] = poly;
    expect(dist(p1, p2)).toBeCloseTo(ACS1996.boldWidthPt);
    expect(tip).toEqual(ax.b);
    // wide end centered on a
    expect((p1.y + p2.y) / 2).toBeCloseTo(ax.a.y);
  });
});

describe('hashSegments', () => {
  test('dashes grow from near-zero at b to boldWidth at a, spaced hashSpacingPt', () => {
    const ax = bondAxis(vec(0, 0), vec(L, 0), 0, 0);
    const segs = hashSegments(ax, ACS1996);
    expect(segs.length).toBeGreaterThan(3);
    const widths = segs.map((s) => dist(s.p1, s.p2));
    // last segment (at a) is the widest
    expect(widths[widths.length - 1]).toBeCloseTo(ACS1996.boldWidthPt);
    // monotonically increasing
    for (let i = 1; i < widths.length; i++) expect(widths[i]).toBeGreaterThan(widths[i - 1]);
    // spacing along the axis (measured between dash midpoints, projected on dir)
    const mid = (s: { p1: typeof segs[0]['p1']; p2: typeof segs[0]['p1'] }) =>
      ({ x: (s.p1.x + s.p2.x) / 2, y: (s.p1.y + s.p2.y) / 2 });
    const step = sub(mid(segs[1]), mid(segs[0]));
    expect(len(step)).toBeCloseTo(ACS1996.hashSpacingPt);
  });
});
