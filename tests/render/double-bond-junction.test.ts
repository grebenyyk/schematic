import { describe, test, expect } from 'vitest';
import { vec, sub, norm, type Vec2 } from '../../src/core/geometry/vec2';
import { ACS1996 } from '../../src/core/style/presets';
import { bondAxis, doubleBondLines } from '../../src/render/bonds';

const L = ACS1996.bondLengthPt;
const d2r = Math.PI / 180;
const dir = (deg: number): Vec2 => vec(Math.cos(deg * d2r), Math.sin(deg * d2r));

// double bond east from a=(0,0) to b=(L,0); normal is +y
const axis = () => bondAxis(vec(0, 0), vec(L, 0), 0, 0);

describe('double bond junction trimming (modern convention)', () => {
  test('acute adjacent bond: near-side line trimmed at the crossing point', () => {
    // single bond leaving a at +60° (acute to the double bond)
    const [near, far] = doubleBondLines(axis(), ACS1996, [dir(60)], []);
    // near line (offset +y) must start where it meets the single bond centerline:
    // on the ray t·dir(60), i.e. y/x = tan60
    const s = near.p1;
    expect(s.x).toBeGreaterThan(0.1); // actually trimmed forward
    expect(s.y / s.x).toBeCloseTo(Math.tan(60 * d2r), 3);
    // far line untouched: starts at the vertex plane
    expect(far.p1.x).toBeCloseTo(0);
    // both lines still reach b
    expect(near.p2.x).toBeCloseTo(L);
    expect(far.p2.x).toBeCloseTo(L);
  });

  test('120° adjacent bond: no trimming (intersection behind vertex)', () => {
    const [l1, l2] = doubleBondLines(axis(), ACS1996, [dir(120)], []);
    expect(l1.p1.x).toBeCloseTo(0);
    expect(l2.p1.x).toBeCloseTo(0);
  });

  test('collinear adjacent bond (straight chain): no trim, no crash', () => {
    const [l1, l2] = doubleBondLines(axis(), ACS1996, [dir(180)], []);
    expect(l1.p1.x).toBeCloseTo(0);
    expect(l2.p1.x).toBeCloseTo(0);
  });

  test('adjacent bond at the b end trims from that end', () => {
    // single bond leaving b at 120° measured in world coords = acute to the axis at b
    const [l1, l2] = doubleBondLines(axis(), ACS1996, [], [dir(120)]);
    const ends = [l1.p2, l2.p2];
    const trimmed = ends.filter((p) => p.x < L - 0.1);
    expect(trimmed).toHaveLength(1);
    // trimmed endpoint lies on the ray b + t·dir(120)
    const t = trimmed[0];
    expect((t.y - 0) / (t.x - L)).toBeCloseTo(Math.tan(120 * d2r), 3);
  });

  test('two adjacent bonds at sp2 center: each side trims to its own single bond', () => {
    // u1 at +60°, u2 at -60°: both acute, both sides trimmed
    const [l1, l2] = doubleBondLines(axis(), ACS1996, [dir(60), dir(-60)], []);
    expect(l1.p1.x).toBeGreaterThan(0.1);
    expect(l2.p1.x).toBeGreaterThan(0.1);
    // and each start point lies on its corresponding single-bond ray
    for (const [line, deg] of [[l1, 60], [l2, -60]] as const) {
      expect(Math.abs(line.p1.y / line.p1.x)).toBeCloseTo(Math.abs(Math.tan(deg * d2r)), 3);
    }
  });

  test('trimmed lines remain parallel to the axis and correctly offset', () => {
    const [l1, l2] = doubleBondLines(axis(), ACS1996, [dir(45)], []);
    for (const line of [l1, l2]) {
      const v = norm(sub(line.p2, line.p1));
      expect(Math.abs(v.x)).toBeCloseTo(1);
      expect(Math.abs(v.y)).toBeCloseTo(0);
    }
    // perpendicular offset between the parallel lines is the double-bond gap
    expect(Math.abs(l1.p1.y - l2.p1.y)).toBeCloseTo(ACS1996.doubleBondSpacing * L);
  });
});
