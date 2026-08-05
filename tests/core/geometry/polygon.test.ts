import { describe, test, expect } from 'vitest';
import { vec } from '../../../src/core/geometry/vec2';
import { pointInPolygon } from '../../../src/core/geometry/polygon';

const square = [vec(0, 0), vec(10, 0), vec(10, 10), vec(0, 10)];

describe('pointInPolygon', () => {
  test('inside and outside a square', () => {
    expect(pointInPolygon(vec(5, 5), square)).toBe(true);
    expect(pointInPolygon(vec(15, 5), square)).toBe(false);
    expect(pointInPolygon(vec(-1, 5), square)).toBe(false);
  });

  test('concave polygon handles the notch', () => {
    const l = [vec(0, 0), vec(10, 0), vec(10, 10), vec(5, 5), vec(0, 10)];
    expect(pointInPolygon(vec(5, 2), l)).toBe(true);   // above the notch
    expect(pointInPolygon(vec(5, 7), l)).toBe(false);  // inside the notch
    expect(pointInPolygon(vec(2, 7), l)).toBe(true);   // left arm, below the notch line
  });

  test('degenerate polygons are false', () => {
    expect(pointInPolygon(vec(0, 0), [])).toBe(false);
    expect(pointInPolygon(vec(1, 1), [vec(0, 0), vec(1, 1)])).toBe(false);
  });
});
