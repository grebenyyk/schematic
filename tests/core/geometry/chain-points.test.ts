import { describe, test, expect } from 'vitest';
import { vec, dist } from '../../../src/core/geometry/vec2';
import { chainPoints } from '../../../src/core/geometry/chain';

describe('chainPoints', () => {
  test('count 1 gives just the start and one bond endpoint', () => {
    const pts = chainPoints(vec(0, 0), 0, 1, 14.4, 1);
    expect(pts).toHaveLength(2);
    expect(dist(pts[0], pts[1])).toBeCloseTo(14.4);
  });

  test('segments alternate ±60° (120° bond angle), bending to the given side', () => {
    const pts = chainPoints(vec(0, 0), 0, 3, 14.4, 1);
    expect(pts).toHaveLength(4);
    // every segment is exactly one bond length
    for (let i = 1; i < pts.length; i++) {
      expect(dist(pts[i - 1], pts[i])).toBeCloseTo(14.4);
    }
    // side +1: the second segment bends +60° from the first
    expect(pts[2].y).toBeGreaterThan(0);
    // zigzag: first and third segments are parallel
    const s1 = { x: pts[1].x - pts[0].x, y: pts[1].y - pts[0].y };
    const s3 = { x: pts[3].x - pts[2].x, y: pts[3].y - pts[2].y };
    expect(s3.x).toBeCloseTo(s1.x);
    expect(s3.y).toBeCloseTo(s1.y);
  });

  test('side -1 mirrors the bend', () => {
    const pts = chainPoints(vec(0, 0), 0, 2, 14.4, -1);
    expect(pts[2].y).toBeLessThan(0);
  });
});
