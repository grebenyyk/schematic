import { sub, type Vec2 } from '../core/geometry/vec2';
import type { ReactionArrow, Plus } from '../core/model/reaction';
import type { StyleSheet } from '../core/style/stylesheet';

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgLine(dom: Document, x1: number, y1: number, x2: number, y2: number, width: number, color: string): SVGLineElement {
  const el = dom.createElementNS(SVG_NS, 'line');
  el.setAttribute('x1', String(x1));
  el.setAttribute('y1', String(y1));
  el.setAttribute('x2', String(x2));
  el.setAttribute('y2', String(y2));
  el.setAttribute('stroke', color);
  el.setAttribute('stroke-width', String(width));
  el.setAttribute('stroke-linecap', 'butt');
  return el;
}

/** A simple reaction arrow: stem line + filled-triangle head at `to`. */
export function renderArrow(
  dom: Document,
  group: SVGGElement,
  arrow: { from: Vec2; to: Vec2 },
  style: StyleSheet,
  color: string = style.colors.bond,
): void {
  const { from, to } = arrow;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return;
  const dirX = dx / len;
  const dirY = dy / len;
  const headLen = Math.min(style.boldWidthPt * 1.6, len * 0.5);
  const headHalf = style.boldWidthPt * 0.9;
  const baseX = to.x - dirX * headLen;
  const baseY = to.y - dirY * headLen;

  group.appendChild(svgLine(dom, from.x, from.y, baseX, baseY, style.lineWidthPt, color));

  const perpX = -dirY;
  const perpY = dirX;
  const tri = dom.createElementNS(SVG_NS, 'polygon');
  tri.setAttribute(
    'points',
    `${to.x},${to.y} ${baseX + perpX * headHalf},${baseY + perpY * headHalf} ${baseX - perpX * headHalf},${baseY - perpY * headHalf}`,
  );
  tri.setAttribute('fill', color);
  group.appendChild(tri);
}

/** A plus sign: two short crossed lines. */
export function renderPlus(dom: Document, group: SVGGElement, plus: Plus, style: StyleSheet): void {
  const arm = style.bondLengthPt * 0.22;
  const w = style.lineWidthPt * 1.4;
  const { x, y } = plus.pos;
  group.appendChild(svgLine(dom, x - arm, y, x + arm, y, w, style.colors.bond));
  group.appendChild(svgLine(dom, x, y - arm, x, y + arm, w, style.colors.bond));
}

/** Unit-direction and length of an arrow's drawn axis (for hit-testing/highlights). */
export function arrowAxis(arrow: ReactionArrow): { dir: Vec2; length: number } {
  const d = sub(arrow.to, arrow.from);
  const length = Math.hypot(d.x, d.y);
  return { dir: length < 1e-6 ? { x: 1, y: 0 } : { x: d.x / length, y: d.y / length }, length };
}
