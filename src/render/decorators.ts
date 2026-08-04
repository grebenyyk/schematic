import type { Vec2 } from '../core/geometry/vec2';
import type { StyleSheet } from '../core/style/stylesheet';
import type { BondAxis } from './bonds';

const SVG_NS = 'http://www.w3.org/2000/svg';

export type Decoration =
  | { type: 'hover-atom'; pos: Vec2 }
  | { type: 'hover-bond'; axis: BondAxis }
  | { type: 'snap-guide'; from: Vec2; to: Vec2 };

export function renderDecorations(
  doc: Document,
  group: SVGGElement,
  decorations: Decoration[],
  style: StyleSheet,
): void {
  for (const d of decorations) {
    if (d.type === 'hover-atom') {
      const c = doc.createElementNS(SVG_NS, 'circle');
      c.setAttribute('cx', String(d.pos.x));
      c.setAttribute('cy', String(d.pos.y));
      c.setAttribute('r', String(style.labelSizePt * 0.35));
      c.setAttribute('fill', 'none');
      c.setAttribute('stroke', style.colors.hover);
      c.setAttribute('stroke-width', String(style.lineWidthPt * 1.5));
      group.appendChild(c);
    } else if (d.type === 'hover-bond') {
      const line = doc.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', String(d.axis.a.x));
      line.setAttribute('y1', String(d.axis.a.y));
      line.setAttribute('x2', String(d.axis.b.x));
      line.setAttribute('y2', String(d.axis.b.y));
      line.setAttribute('stroke', style.colors.hover);
      line.setAttribute('stroke-width', String(style.boldWidthPt));
      line.setAttribute('stroke-linecap', 'round');
      line.setAttribute('opacity', '0.5');
      group.appendChild(line);
    } else {
      const line = doc.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', String(d.from.x));
      line.setAttribute('y1', String(d.from.y));
      line.setAttribute('x2', String(d.to.x));
      line.setAttribute('y2', String(d.to.y));
      line.setAttribute('stroke', style.colors.hover);
      line.setAttribute('stroke-width', String(style.lineWidthPt));
      line.setAttribute('stroke-dasharray', '2 2');
      group.appendChild(line);
    }
  }
}
