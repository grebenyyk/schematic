import { describe, test, expect } from 'vitest';
import { vec, sub, norm, type Vec2 } from '../../src/core/geometry/vec2';
import { ACS1996 } from '../../src/core/style/presets';
import { bondAxis, doubleBondLines } from '../../src/render/bonds';

const L = ACS1996.bondLengthPt;
const HALF = (ACS1996.doubleBondSpacing * L) / 2;
const d2r = Math.PI / 180;
const dir = (deg: number): Vec2 => vec(Math.cos(deg * d2r), Math.sin(deg * d2r));

// double bond east from a=(0,0) to b=(L,0); normal is +y
const axis = () => bondAxis(vec(0, 0), vec(L, 0), 0, 0);

/** Parameter t at which point p lies on the ray origin + t·u (null if not on it). */
function onRay(p: Vec2, u: Vec2): number {
  const t = Math.abs(u.x) > Math.abs(u.y) ? p.x / u.x : p.y / u.y;
  const q = vec(u.x * t, u.y * t);
  return Math.hypot(p.x - q.x, p.y - q.y) < 1e-6 ? t : NaN;
}

describe('double bond junction: near line meets the single bond, far line keeps a gap', () => {
  test('120° junction: near line extends back to the single bond, far line at vertex plane', () => {
    const [near, far] = doubleBondLines(axis(), ACS1996, [dir(120)], []);
    // near (+y) line start lies exactly on the single bond centerline ray
    const t = onRay(near.p1, dir(120));
    expect(t).toBeGreaterThan(0);
    expect(t).toBeCloseTo(HALF / Math.sin(120 * d2r), 5);
    // it extends backward past the vertex (x < 0) to close the gap
    expect(near.p1.x).toBeLessThan(0);
    // far line keeps the gap: untouched at the vertex plane
    expect(far.p1.x).toBeCloseTo(0);
    expect(far.p1.y).toBeCloseTo(-HALF);
  });

  test('acute 60° junction: near line trimmed forward to the crossing', () => {
    const [near, far] = doubleBondLines(axis(), ACS1996, [dir(60)], []);
    const t = onRay(near.p1, dir(60));
    expect(t).toBeCloseTo(HALF / Math.sin(60 * d2r), 5);
    expect(near.p1.x).toBeGreaterThan(0.1);
    expect(far.p1.x).toBeCloseTo(0);
  });

  test('collinear adjacent bond (straight chain): no adjustment', () => {
    const [l1, l2] = doubleBondLines(axis(), ACS1996, [dir(180)], []);
    expect(l1.p1.x).toBeCloseTo(0);
    expect(l2.p1.x).toBeCloseTo(0);
  });

  test('no adjacent bond on a side: that line keeps its gap', () => {
    const [l1, l2] = doubleBondLines(axis(), ACS1996, [], []);
    expect(l1.p1.x).toBeCloseTo(0);
    expect(l1.p1.y).toBeCloseTo(HALF);
    expect(l2.p1.x).toBeCloseTo(0);
    expect(l2.p1.y).toBeCloseTo(-HALF);
  });

  test('junction at the b end mirrors the same rule', () => {
    const [near, far] = doubleBondLines(axis(), ACS1996, [], [dir(120)]);
    // near line end extends past b onto the single bond ray from b
    const p = near.p2;
    const u = dir(120);
    const t = Math.abs(u.x) > Math.abs(u.y) ? (p.x - L) / u.x : (p.y - 0) / u.y;
    const q = vec(L + u.x * t, u.y * t);
    expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeLessThan(1e-6);
    expect(t).toBeCloseTo(HALF / Math.sin(120 * d2r), 5);
    expect(far.p2.x).toBeCloseTo(L);
  });

  test('sp2 center with single bonds on both sides: both lines meet their single bond', () => {
    const [up, down] = doubleBondLines(axis(), ACS1996, [dir(120), dir(-120)], []);
    for (const [line, u] of [[up, dir(120)], [down, dir(-120)]] as const) {
      const t = onRay(line.p1, u);
      expect(t).toBeCloseTo(HALF / Math.sin(120 * d2r), 5);
    }
  });

  test('adjusted lines remain parallel to the axis and correctly offset', () => {
    const [l1, l2] = doubleBondLines(axis(), ACS1996, [dir(120)], []);
    for (const line of [l1, l2]) {
      const v = norm(sub(line.p2, line.p1));
      expect(Math.abs(v.x)).toBeCloseTo(1);
      expect(Math.abs(v.y)).toBeCloseTo(0);
    }
    expect(Math.abs(l1.p1.y - l2.p1.y)).toBeCloseTo(2 * HALF);
  });
});
