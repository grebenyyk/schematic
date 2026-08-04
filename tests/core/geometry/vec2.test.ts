import { describe, test, expect } from 'vitest';
import { vec, add, sub, scale, len, norm, dot, perp, angle, dist, rotate, lerp } from '../../../src/core/geometry/vec2';

describe('vec2', () => {
  test('add and subtract componentwise', () => {
    expect(add(vec(1, 2), vec(3, 4))).toEqual({ x: 4, y: 6 });
    expect(sub(vec(1, 2), vec(3, 4))).toEqual({ x: -2, y: -2 });
  });

  test('scale multiplies both components', () => {
    expect(scale(vec(1, -2), 3)).toEqual({ x: 3, y: -6 });
  });

  test('len is euclidean length', () => {
    expect(len(vec(3, 4))).toBe(5);
  });

  test('dist is distance between points', () => {
    expect(dist(vec(0, 0), vec(3, 4))).toBe(5);
  });

  test('norm returns unit vector', () => {
    const n = norm(vec(3, 4));
    expect(n.x).toBeCloseTo(0.6);
    expect(n.y).toBeCloseTo(0.8);
    expect(len(n)).toBeCloseTo(1);
  });

  test('norm of zero vector is zero vector', () => {
    expect(norm(vec(0, 0))).toEqual({ x: 0, y: 0 });
  });

  test('dot product', () => {
    expect(dot(vec(1, 2), vec(3, 4))).toBe(11);
  });

  test('perp rotates 90 degrees counterclockwise', () => {
    expect(perp(vec(1, 0))).toEqual({ x: 0, y: 1 });
  });

  test('angle of unit x is 0, unit y is pi/2', () => {
    expect(angle(vec(1, 0))).toBe(0);
    expect(angle(vec(0, 1))).toBeCloseTo(Math.PI / 2);
  });

  test('rotate by pi/2 maps x to y', () => {
    const r = rotate(vec(1, 0), Math.PI / 2);
    expect(r.x).toBeCloseTo(0);
    expect(r.y).toBeCloseTo(1);
  });

  test('lerp interpolates', () => {
    expect(lerp(vec(0, 0), vec(10, 20), 0.5)).toEqual({ x: 5, y: 10 });
  });
});
