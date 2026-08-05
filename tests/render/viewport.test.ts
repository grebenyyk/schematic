import { describe, test, expect } from 'vitest';
import { vec } from '../../src/core/geometry/vec2';
import { clientToPt, expandViewBox, type ClientRect, type ViewBox } from '../../src/render/viewport';

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

describe('expandViewBox (grow-only, stable camera)', () => {
  test('content inside the current view: no change', () => {
    const view = vb(-20, -20, 100, 100);
    const content = vb(0, 0, 50, 50);
    expect(expandViewBox(view, content)).toEqual(view);
  });

  test('content sticking out right/bottom: extends to cover', () => {
    const view = vb(-20, -20, 100, 100);
    const content = vb(0, 0, 150, 50);
    const out = expandViewBox(view, content);
    expect(out.x).toBe(-20);
    expect(out.y).toBe(-20);
    expect(out.width).toBe(170); // -20 → 150
    expect(out.height).toBe(100);
  });

  test('content sticking out left/top: shifts origin, keeps far edge', () => {
    const view = vb(-20, -20, 100, 100); // covers -20..80
    const content = vb(-50, -60, 20, 20);
    const out = expandViewBox(view, content);
    expect(out.x).toBe(-50);
    expect(out.y).toBe(-60);
    expect(out.width).toBe(130); // -50 → 80
    expect(out.height).toBe(140); // -60 → 80
  });

  test('never shrinks when content gets smaller or moves away', () => {
    const view = vb(-20, -20, 100, 100);
    const content = vb(200, 200, 10, 10);
    const out = expandViewBox(view, content);
    // union: must cover both
    expect(out.width).toBe(230); // -20 → 210
  });
});
