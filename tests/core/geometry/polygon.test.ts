import { describe, test, expect } from 'vitest';
import { vec, dist } from '../../../src/core/geometry/vec2';
import { pointInPolygon, regularPolygon, ringFromEdge } from '../../../src/core/geometry/polygon';

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

describe('regularPolygon', () => {
  test('n vertices, each side the given length, centered at center', () => {
    const c = vec(100, 50);
    const side = 14.4;
    const verts = regularPolygon(c, 6, side, 0);
    expect(verts).toHaveLength(6);
    for (let i = 0; i < 6; i++) {
      expect(dist(verts[i], verts[(i + 1) % 6])).toBeCloseTo(side);
    }
    const cx = verts.reduce((s, p) => s + p.x, 0) / 6;
    const cy = verts.reduce((s, p) => s + p.y, 0) / 6;
    expect(cx).toBeCloseTo(c.x);
    expect(cy).toBeCloseTo(c.y);
  });
});

describe('ringFromEdge', () => {
  const a = vec(0, 0);
  const b = vec(14.4, 0);
  const L = dist(a, b);

  test('starts at a, b; n vertices; every side is the edge length', () => {
    const verts = ringFromEdge(a, b, 6, 1);
    expect(verts).toHaveLength(6);
    expect(verts[0]).toEqual(a);
    expect(verts[1]).toEqual(b);
    for (let i = 0; i < 6; i++) {
      expect(dist(verts[i], verts[(i + 1) % 6])).toBeCloseTo(L);
    }
  });

  test('+1 and -1 put the ring on opposite sides of the edge', () => {
    const up = ringFromEdge(a, b, 6, 1);
    const down = ringFromEdge(a, b, 6, -1);
    expect(up[2].y).toBeGreaterThan(0);
    expect(down[2].y).toBeLessThan(0);
  });

  test('triangle (n=3) is equilateral', () => {
    const verts = ringFromEdge(a, b, 3, 1);
    expect(verts).toHaveLength(3);
    expect(dist(verts[1], verts[2])).toBeCloseTo(L);
    expect(dist(verts[2], verts[0])).toBeCloseTo(L);
  });
});
