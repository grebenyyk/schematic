import { describe, test, expect } from 'vitest';
import { vec } from '../../src/core/geometry/vec2';
import {
  clientToPt, updateCamera, panCamera, zoomCamera, clampZoomFactor,
  MIN_SCALE, MAX_SCALE,
  type Camera, type ClientRect, type ViewBox,
} from '../../src/render/viewport';

const rect = (left: number, top: number, width: number, height: number): ClientRect =>
  ({ left, top, width, height });
const vb = (x: number, y: number, width: number, height: number): ViewBox =>
  ({ x, y, width, height });

describe('clientToPt (preserveAspectRatio xMidYMid meet)', () => {
  test('matching aspect ratios scale directly', () => {
    const p = clientToPt(vec(400, 300), rect(0, 0, 800, 600), vb(0, 0, 400, 300));
    expect(p.x).toBeCloseTo(200);
    expect(p.y).toBeCloseTo(150);
  });

  test('element wider than viewBox: content centered horizontally', () => {
    // scale = min(1000/100, 500/100) = 5; drawn 500 wide → 250px pillarbox each side
    const r = rect(0, 0, 1000, 500);
    const box = vb(0, 0, 100, 100);
    const topLeft = clientToPt(vec(250, 0), r, box);
    expect(topLeft.x).toBeCloseTo(0);
    expect(topLeft.y).toBeCloseTo(0);
    const bottomRight = clientToPt(vec(750, 500), r, box);
    expect(bottomRight.x).toBeCloseTo(100);
    expect(bottomRight.y).toBeCloseTo(100);
    const center = clientToPt(vec(500, 250), r, box);
    expect(center.x).toBeCloseTo(50);
    expect(center.y).toBeCloseTo(50);
  });

  test('element taller than viewBox: content centered vertically', () => {
    // scale = min(500/100, 1000/100) = 5; drawn 500 tall → 250px letterbox top/bottom
    const r = rect(0, 0, 500, 1000);
    const box = vb(0, 0, 100, 100);
    const topLeft = clientToPt(vec(0, 250), r, box);
    expect(topLeft.x).toBeCloseTo(0);
    expect(topLeft.y).toBeCloseTo(0);
  });

  test('respects viewBox origin and element offset', () => {
    const p = clientToPt(vec(110, 110), rect(10, 10, 200, 200), vb(-50, -50, 100, 100));
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(0);
  });
});

describe('updateCamera (anchored, grow-only, stored scale)', () => {
  test('null camera initializes to fit content', () => {
    const cam = updateCamera(null, vb(0, 0, 50, 25), 1000, 500);
    expect(cam).toEqual({ x: 0, y: 0, scale: 0.05 });
  });

  test('content inside the view: camera returned unchanged (no jiggle)', () => {
    const cam: Camera = { x: -20, y: -20, scale: 0.1 }; // covers -20..80 × -20..30
    const out = updateCamera(cam, vb(0, 0, 40, 20), 1000, 500);
    expect(out).toBe(cam);
  });

  test('content past the right edge: origin holds, scale grows just enough', () => {
    const cam: Camera = { x: -20, y: -20, scale: 0.1 };
    const out = updateCamera(cam, vb(0, 0, 150, 20), 1000, 500);
    expect(out.x).toBe(-20);
    expect(out.y).toBe(-20);
    expect(out.scale).toBeCloseTo(0.17); // need to reach x=150 → 170pt over 1000px
  });

  test('content past the left edge: origin moves left, scale only grows as needed', () => {
    const cam: Camera = { x: -20, y: -20, scale: 0.1 };
    const out = updateCamera(cam, vb(-50, 0, 20, 20), 1000, 500);
    expect(out.x).toBe(-50);
    expect(out.y).toBe(-20);
    expect(out.scale).toBeCloseTo(0.13); // -50 → 80 = 130pt over 1000px
  });

  test('camera never shrinks when content contracts', () => {
    const cam: Camera = { x: -20, y: -20, scale: 0.1 };
    const out = updateCamera(cam, vb(0, 0, 10, 10), 1000, 500);
    expect(out).toBe(cam);
  });
});

describe('panCamera', () => {
  test('dragging right/down moves the view left/up by the scaled delta; scale holds', () => {
    const start: Camera = { x: 0, y: 0, scale: 0.1 };
    // 100px right, 50px down at scale 0.1 → 10pt / 5pt
    const cam = panCamera(start, 100, 50);
    expect(cam.x).toBeCloseTo(-10);
    expect(cam.y).toBeCloseTo(-5);
    expect(cam.scale).toBe(0.1);
  });

  test('the grabbed world point stays under the cursor across the drag', () => {
    // canvas at (0,0) 1000×500; a point grabbed at client (400,250) with this camera
    const start: Camera = { x: -5, y: -5, scale: 0.1 };
    const grabClientX = 400, grabClientY = 250;
    const grabbedX = start.x + grabClientX * start.scale;
    const grabbedY = start.y + grabClientY * start.scale;
    // drag to (520, 190)
    const cam = panCamera(start, 520 - grabClientX, 190 - grabClientY);
    // world now under (520,190) should equal the grabbed point
    const underX = cam.x + 520 * cam.scale;
    const underY = cam.y + 190 * cam.scale;
    expect(underX).toBeCloseTo(grabbedX);
    expect(underY).toBeCloseTo(grabbedY);
  });
});

describe('zoomCamera', () => {
  test('factor > 1 zooms in and doubles the scale', () => {
    const cam: Camera = { x: 0, y: 0, scale: 0.1 };
    const out = zoomCamera(cam, vec(0, 0), 2);
    expect(out.scale).toBeCloseTo(0.2);
  });

  test('the anchor point stays pinned under the cursor', () => {
    const cam: Camera = { x: 5, y: 5, scale: 0.1 };
    const anchor = vec(20, 15);
    const screenBefore = (anchor.x - cam.x) / cam.scale;
    const out = zoomCamera(cam, anchor, 2.5);
    const screenAfter = (anchor.x - out.x) / out.scale;
    expect(screenAfter).toBeCloseTo(screenBefore);
    expect(out.scale).toBeCloseTo(0.25);
  });
});

describe('clampZoomFactor', () => {
  test('passes the factor through within bounds', () => {
    expect(clampZoomFactor(0.1, 2)).toBe(2);
  });
  test('clamps the result to MAX_SCALE', () => {
    expect(0.1 * clampZoomFactor(0.1, 100)).toBeCloseTo(MAX_SCALE);
  });
  test('clamps the result to MIN_SCALE', () => {
    expect(0.1 * clampZoomFactor(0.1, 0.0001)).toBeCloseTo(MIN_SCALE);
  });
});
