import { describe, test, expect } from 'vitest';
import { vec } from '../../src/core/geometry/vec2';
import { singleBondJunctionSetback } from '../../src/render/bonds';

const d2r = Math.PI / 180;
const half = 1.296; // ACS doubleBondSpacing × bondLength / 2

describe('singleBondJunctionSetback', () => {
  const d = vec(1, 0); // double-bond axis leaving the junction atom

  test('120° junction: setback = half / sin(120°) ≈ 1.5', () => {
    const u = vec(Math.cos(120 * d2r), Math.sin(120 * d2r));
    expect(singleBondJunctionSetback(u, d, half)).toBeCloseTo(half / Math.sin(60 * d2r), 5);
  });

  test('acute 60° junction: setback = half / sin(60°)', () => {
    const u = vec(Math.cos(60 * d2r), Math.sin(60 * d2r));
    expect(singleBondJunctionSetback(u, d, half)).toBeCloseTo(half / Math.sin(60 * d2r), 5);
  });

  test('obtuse 150° junction: setback = half / sin(150°) = 2·half', () => {
    const u = vec(Math.cos(150 * d2r), Math.sin(150 * d2r));
    expect(singleBondJunctionSetback(u, d, half)).toBeCloseTo(2 * half, 5);
  });

  test('below the axis mirrors the same result', () => {
    const u = vec(Math.cos(-120 * d2r), Math.sin(-120 * d2r));
    expect(singleBondJunctionSetback(u, d, half)).toBeCloseTo(half / Math.sin(60 * d2r), 5);
  });

  test('collinear (straight chain): no setback', () => {
    expect(singleBondJunctionSetback(vec(-1, 0), d, half)).toBeNull();
    expect(singleBondJunctionSetback(vec(1, 0), d, half)).toBeNull();
  });
});
