import type { Vec2 } from '../core/geometry/vec2';
import type { StyleSheet } from '../core/style/stylesheet';

const SVG_NS = 'http://www.w3.org/2000/svg';

export type Decoration =
  | { type: 'hover-atom'; pos: Vec2; labeled: boolean; element?: string }
  | { type: 'hover-bond'; center: Vec2 }
  | { type: 'snap-guide'; from: Vec2; to: Vec2 };

export function renderDecorations(
  doc: Document,
  group: SVGGElement,
  decorations: Decoration[],
  style: StyleSheet,
): void {
  for (const d of decorations) {
    if (d.type === 'hover-atom') {
      if (d.labeled && d.element) {
        // heteroatom: outline the label letter itself
        const t = doc.createElementNS(SVG_NS, 'text');
        t.setAttribute('x', String(d.pos.x));
        t.setAttribute('y', String(d.pos.y));
        t.setAttribute('text-anchor', 'middle');
        t.setAttribute('dominant-baseline', 'central');
        t.setAttribute('font-family', style.labelFont);
        t.setAttribute('font-size', String(style.labelSizePt));
        t.setAttribute('fill', 'none');
        t.setAttribute('stroke', style.colors.hover);
        t.setAttribute('stroke-width', String(style.lineWidthPt));
        t.textContent = d.element;
        group.appendChild(t);
      } else {
        // carbon vertex: circle outline
        const c = doc.createElementNS(SVG_NS, 'circle');
        c.setAttribute('cx', String(d.pos.x));
        c.setAttribute('cy', String(d.pos.y));
        c.setAttribute('r', String(style.labelSizePt * 0.35));
        c.setAttribute('fill', 'none');
        c.setAttribute('stroke', style.colors.hover);
        c.setAttribute('stroke-width', String(style.lineWidthPt * 1.5));
        group.appendChild(c);
      }
    } else if (d.type === 'hover-bond') {
      const c = doc.createElementNS(SVG_NS, 'circle');
      c.setAttribute('cx', String(d.center.x));
      c.setAttribute('cy', String(d.center.y));
      c.setAttribute('r', String(style.labelSizePt * 0.15));
      c.setAttribute('fill', style.colors.hover);
      group.appendChild(c);
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
