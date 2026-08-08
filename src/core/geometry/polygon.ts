import { add, angle, dist, scale, sub, vec, type Vec2 } from './vec2';

/** Ray-casting point-in-polygon test. */
export function pointInPolygon(p: Vec2, polygon: Vec2[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Vertices of a regular n-gon of side length `side`, centered at `center`, with
 * the first vertex at angle `rotation` (radians). Circumradius side/(2·sin(π/n)).
 */
export function regularPolygon(center: Vec2, n: number, side: number, rotation: number): Vec2[] {
  const R = side / (2 * Math.sin(Math.PI / n));
  const verts: Vec2[] = [];
  for (let k = 0; k < n; k++) {
    const a = rotation + (k * 2 * Math.PI) / n;
    verts.push(add(center, scale(vec(Math.cos(a), Math.sin(a)), R)));
  }
  return verts;
}

/**
 * Vertices of a regular n-gon whose first edge is a→b, lying on `side` (+1/−1).
 * Walks the polygon turning by the exterior angle 2π/n; closes exactly (the
 * final edge back to `a` has length |b−a| by the roots-of-unity sum). Returns n
 * vertices starting at a.
 */
export function ringFromEdge(a: Vec2, b: Vec2, n: number, side: 1 | -1): Vec2[] {
  const L = dist(a, b);
  const ext = (side * 2 * Math.PI) / n;
  const verts: Vec2[] = [a, b];
  let dir = angle(sub(b, a));
  for (let k = 1; k <= n - 2; k++) {
    dir += ext;
    verts.push(add(verts[verts.length - 1], scale(vec(Math.cos(dir), Math.sin(dir)), L)));
  }
  return verts;
}
