import { add, scale, sub, len, norm, perp, lerp, type Vec2 } from '../core/geometry/vec2';
import type { Bond } from '../core/model/molecule';
import type { StyleSheet } from '../core/style/stylesheet';

export interface BondAxis {
  a: Vec2;      // trimmed start point
  b: Vec2;      // trimmed end point
  dir: Vec2;    // unit vector a→b
  normal: Vec2; // unit normal (left of dir)
  length: number;
}

/**
 * Derived geometry for a bond between two atom positions.
 * trimA/trimB shorten the drawn line where atom labels sit.
 */
export function bondAxis(pa: Vec2, pb: Vec2, trimA: number, trimB: number): BondAxis {
  const d = sub(pb, pa);
  const full = len(d);
  const dir = norm(d);
  const a = add(pa, scale(dir, trimA));
  const b = sub(pb, scale(dir, trimB));
  return { a, b, dir, normal: perp(dir), length: full - trimA - trimB };
}

export interface Line {
  p1: Vec2;
  p2: Vec2;
}

function offsetLine(axis: BondAxis, offset: number): Line {
  const o = scale(axis.normal, offset);
  return { p1: add(axis.a, o), p2: add(axis.b, o) };
}

const cross = (v: Vec2, w: Vec2): number => v.x * w.y - v.y * w.x;

/**
 * How far short of a double-bond junction a single bond should stop, so its
 * end meets the extension of the nearer double-bond line (the ChemDraw
 * "fork"). u: unit direction from the junction atom along the single bond;
 * d: unit direction of the double bond leaving the same atom.
 * Null when the single bond is collinear with the double bond.
 */
export function singleBondJunctionSetback(u: Vec2, d: Vec2, halfGap: number): number | null {
  const s = Math.abs(cross(u, d));
  if (s < 1e-9) return null;
  return halfGap / s;
}

/**
 * How far along d from the vertex the line (offset off·n from the vertex)
 * crosses the ray leaving the vertex along u. Negative = behind the vertex.
 */
function crossing(offset: number, normal: Vec2, d: Vec2, u: Vec2): number | null {
  const denom = cross(d, u);
  if (Math.abs(denom) < 1e-9) return null; // collinear: no crossing
  return -(cross({ x: offset * normal.x, y: offset * normal.y }, u)) / denom;
}

/**
 * Two lines symmetric about the axis, gap = doubleBondSpacing × bondLength.
 * adjA/adjB are unit directions of the other bonds leaving each endpoint.
 * Junction convention: at a degree-2 junction (exactly one adjacent single
 * bond) the line on that bond's side is extended or trimmed to start exactly
 * where it meets the bond's centerline (no gap), while the other line keeps
 * its gap. At an sp2 junction (two adjacent single bonds) nothing is
 * adjusted — the single bonds and both lines converge at the vertex.
 */
export function doubleBondLines(
  axis: BondAxis,
  style: StyleSheet,
  adjA: Vec2[] = [],
  adjB: Vec2[] = [],
): [Line, Line] {
  const half = (style.doubleBondSpacing * style.bondLengthPt) / 2;
  const lines: [Line, Line] = [offsetLine(axis, half), offsetLine(axis, -half)];
  const back = { x: -axis.dir.x, y: -axis.dir.y };
  const maxExtend = 3 * half;
  const maxTrim = Math.max(0, (axis.length - half) / 2);
  const clamp = (s: number) => Math.max(-maxExtend, Math.min(s, maxTrim));

  for (const side of [1, -1] as const) {
    const line = lines[side === 1 ? 0 : 1];
    for (const [adj, d, move] of [
      [adjA, axis.dir, (s: number) => { line.p1 = add(line.p1, scale(axis.dir, s)); }],
      [adjB, back, (s: number) => { line.p2 = add(line.p2, scale(back, s)); }],
    ] as const) {
      if (adj.length !== 1) continue; // only degree-2 junctions get the gapless bend
      let best: number | null = null;
      for (const u of adj) {
        if (Math.sign(side * (u.x * axis.normal.x + u.y * axis.normal.y)) <= 0) continue;
        const s = crossing(side * half, axis.normal, d, u);
        if (s !== null && (best === null || s > best)) best = s;
      }
      if (best !== null) move(clamp(best));
    }
  }
  return lines;
}

/** Center line plus two outer lines at the full double-bond gap. */
export function tripleBondLines(axis: BondAxis, style: StyleSheet): [Line, Line, Line] {
  const gap = style.doubleBondSpacing * style.bondLengthPt;
  return [offsetLine(axis, 0), offsetLine(axis, gap), offsetLine(axis, -gap)];
}

/**
 * Ring double bond: one line on the axis, the second offset by the full
 * spacing toward the ring interior (the side the ring path lies on).
 */
export function ringDoubleBondLines(
  axis: BondAxis,
  path: Vec2[],
  style: StyleSheet,
): [Line, Line] {
  const cx = path.reduce((s, p) => s + p.x, 0) / path.length;
  const cy = path.reduce((s, p) => s + p.y, 0) / path.length;
  const mid = { x: (axis.a.x + axis.b.x) / 2, y: (axis.a.y + axis.b.y) / 2 };
  const inward = (cx - mid.x) * axis.normal.x + (cy - mid.y) * axis.normal.y > 0 ? 1 : -1;
  const gap = style.doubleBondSpacing * style.bondLengthPt;
  return [offsetLine(axis, 0), offsetLine(axis, inward * gap)];
}

/** Stereo wedge: wide end (boldWidthPt) at a, tip at b. */
export function wedgePolygon(axis: BondAxis, style: StyleSheet): [Vec2, Vec2, Vec2] {
  const half = style.boldWidthPt / 2;
  return [
    add(axis.a, scale(axis.normal, half)),
    sub(axis.a, scale(axis.normal, half)),
    axis.b,
  ];
}

/**
 * Hash bond: dashes perpendicular to the axis, growing from near-zero at b
 * to boldWidthPt at a, spaced hashSpacingPt apart. Ordered b → a.
 */
export function hashSegments(axis: BondAxis, style: StyleSheet): Line[] {
  const segs: Line[] = [];
  const push = (t: number) => {
    const half = (style.boldWidthPt / 2) * t;
    if (half < 1e-6) return;
    const c = lerp(axis.b, axis.a, t);
    segs.push({ p1: add(c, scale(axis.normal, half)), p2: sub(c, scale(axis.normal, half)) });
  };
  // anchor at b, exactly hashSpacingPt apart, then a final full-width dash at a
  for (let d = style.hashSpacingPt; d < axis.length; d += style.hashSpacingPt) {
    push(d / axis.length);
  }
  push(1);
  return segs;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgLine(doc: Document, line: Line, style: StyleSheet, width: number): SVGLineElement {
  const el = doc.createElementNS(SVG_NS, 'line');
  el.setAttribute('x1', String(line.p1.x));
  el.setAttribute('y1', String(line.p1.y));
  el.setAttribute('x2', String(line.p2.x));
  el.setAttribute('y2', String(line.p2.y));
  el.setAttribute('stroke', style.colors.bond);
  el.setAttribute('stroke-width', String(width));
  el.setAttribute('stroke-linecap', 'round');
  return el;
}

/** Emit the SVG elements for one bond into the given group. */
export function renderBond(
  doc: Document,
  group: SVGGElement,
  bond: Bond,
  axis: BondAxis,
  style: StyleSheet,
  ring: Vec2[] | null = null,
  adjacent: { a: Vec2[]; b: Vec2[] } | null = null,
): void {
  const g = doc.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', 'bond');
  g.dataset.bondId = String(bond.id);

  const w = style.lineWidthPt;
  if (bond.stereo === 'wedge' || bond.stereo === 'up') {
    const poly = doc.createElementNS(SVG_NS, 'polygon');
    poly.setAttribute('points', wedgePolygon(axis, style).map((p) => `${p.x},${p.y}`).join(' '));
    poly.setAttribute('fill', style.colors.bond);
    g.appendChild(poly);
  } else if (bond.stereo === 'hash' || bond.stereo === 'down') {
    for (const seg of hashSegments(axis, style)) g.appendChild(svgLine(doc, seg, style, w));
  } else if (bond.order === 2) {
    const lines = ring
      ? ringDoubleBondLines(axis, ring, style)
      : doubleBondLines(axis, style, adjacent?.a ?? [], adjacent?.b ?? []);
    for (const line of lines) g.appendChild(svgLine(doc, line, style, w));
  } else if (bond.order === 3) {
    for (const line of tripleBondLines(axis, style)) g.appendChild(svgLine(doc, line, style, w));
  } else {
    g.appendChild(svgLine(doc, { p1: axis.a, p2: axis.b }, style, w));
  }

  group.appendChild(g);
}
