import type { Vec2 } from '../core/geometry/vec2';
import type { Document as MolDocument } from '../core/model/document';
import { findAtom } from '../core/model/document';
import { bondsOf } from '../core/model/molecule';
import type { StyleSheet } from '../core/style/stylesheet';
import { appendLabelContent, chargeText, hasVisibleLabel, labelBox, labelText } from './labels';

const SVG_NS = 'http://www.w3.org/2000/svg';

export type Decoration =
  | {
      type: 'hover-atom';
      pos: Vec2;
      labeled: boolean;
      /** Rendered label center when labeled (from labelBox). */
      cx?: number;
      /** Label content when labeled (element, H count, flip, charge). */
      element?: string;
      h?: number;
      flipped?: boolean;
      charge?: string;
    }
  | { type: 'hover-bond'; center: Vec2 }
  | { type: 'snap-guide'; from: Vec2; to: Vec2 }
  | { type: 'select-atom'; pos: Vec2 }
  | { type: 'select-bond'; center: Vec2; dir: Vec2; length: number }
  | { type: 'marquee'; from: Vec2; to: Vec2 }
  | { type: 'lasso'; points: Vec2[] }
  | { type: 'rotate-handle'; pos: Vec2 };

/** Hover/merge highlight for an atom: full-label outline when labeled, circle otherwise. */
export function atomHoverDecoration(doc: MolDocument, atomId: number, style: StyleSheet): Decoration {
  const loc = findAtom(doc, atomId)!;
  const mol = doc.molecules[loc.moleculeIndex];
  const degree = [...bondsOf(mol, atomId)].length;
  const labeled = hasVisibleLabel(loc.atom, degree);
  if (!labeled) return { type: 'hover-atom', pos: loc.atom.pos, labeled };
  const { element, h, flipped } = labelText(mol, atomId);
  return {
    type: 'hover-atom',
    pos: loc.atom.pos,
    labeled,
    cx: labelBox(mol, atomId, style).cx,
    element,
    h,
    flipped,
    charge: chargeText(loc.atom.charge),
  };
}

export function renderDecorations(
  doc: Document,
  group: SVGGElement,
  decorations: Decoration[],
  style: StyleSheet,
): void {
  for (const d of decorations) {
    if (d.type === 'hover-atom') {
      if (d.labeled && d.element) {
        // heteroatom: outline the whole label (OH, NH2, charges…),
        // centered exactly where the real label sits
        const t = doc.createElementNS(SVG_NS, 'text');
        t.setAttribute('x', String(d.cx ?? d.pos.x));
        t.setAttribute('y', String(d.pos.y));
        t.setAttribute('text-anchor', 'middle');
        t.setAttribute('dominant-baseline', 'central');
        t.setAttribute('font-family', style.labelFont);
        t.setAttribute('font-size', String(style.labelSizePt));
        t.setAttribute('fill', 'none');
        t.setAttribute('stroke', style.colors.hover);
        t.setAttribute('stroke-width', String(style.lineWidthPt));
        appendLabelContent(doc, t, {
          element: d.element,
          h: d.h ?? 0,
          flipped: d.flipped ?? false,
          charge: d.charge ?? '',
        }, style);
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
    } else if (d.type === 'select-atom') {
      const c = doc.createElementNS(SVG_NS, 'circle');
      c.setAttribute('cx', String(d.pos.x));
      c.setAttribute('cy', String(d.pos.y));
      c.setAttribute('r', String(style.labelSizePt * 0.35));
      c.setAttribute('fill', style.colors.selection);
      c.setAttribute('fill-opacity', '0.3');
      c.setAttribute('stroke', style.colors.selection);
      c.setAttribute('stroke-width', String(style.lineWidthPt * 0.75));
      group.appendChild(c);
    } else if (d.type === 'select-bond') {
      const line = doc.createElementNS(SVG_NS, 'line');
      const hx = (d.dir.x * d.length) / 2;
      const hy = (d.dir.y * d.length) / 2;
      line.setAttribute('x1', String(d.center.x - hx));
      line.setAttribute('y1', String(d.center.y - hy));
      line.setAttribute('x2', String(d.center.x + hx));
      line.setAttribute('y2', String(d.center.y + hy));
      line.setAttribute('stroke', style.colors.selection);
      line.setAttribute('stroke-width', String(style.boldWidthPt * 0.8));
      line.setAttribute('stroke-linecap', 'round');
      line.setAttribute('opacity', '0.35');
      group.appendChild(line);
    } else if (d.type === 'lasso') {
      if (d.points.length >= 2) {
        const poly = doc.createElementNS(SVG_NS, 'polygon');
        poly.setAttribute('points', d.points.map((p) => `${p.x},${p.y}`).join(' '));
        poly.setAttribute('fill', style.colors.hover);
        poly.setAttribute('fill-opacity', '0.12');
        poly.setAttribute('stroke', style.colors.hover);
        poly.setAttribute('stroke-width', String(style.lineWidthPt));
        poly.setAttribute('stroke-dasharray', '2 2');
        group.appendChild(poly);
      }
    } else if (d.type === 'rotate-handle') {
      // circular-arrow affordance at the selection's top-right corner
      const r = style.labelSizePt * 0.45;
      const circle = doc.createElementNS(SVG_NS, 'circle');
      circle.setAttribute('cx', String(d.pos.x));
      circle.setAttribute('cy', String(d.pos.y));
      circle.setAttribute('r', String(r));
      circle.setAttribute('fill', style.colors.background);
      circle.setAttribute('stroke', style.colors.selection);
      circle.setAttribute('stroke-width', String(style.lineWidthPt));
      group.appendChild(circle);
      // Feather rotate-cw, centered in the circle
      const s = (r * 1.3) / 24;
      const icon = doc.createElementNS(SVG_NS, 'path');
      icon.setAttribute(
        'd',
        'M23 4v6h-6 M20.49 15a9 9 0 1 1-2.12-9.36L23 10',
      );
      icon.setAttribute('fill', 'none');
      icon.setAttribute('stroke', style.colors.selection);
      icon.setAttribute('stroke-width', String(style.lineWidthPt / s));
      icon.setAttribute('stroke-linecap', 'round');
      icon.setAttribute('stroke-linejoin', 'round');
      icon.setAttribute(
        'transform',
        `translate(${d.pos.x}, ${d.pos.y}) scale(${s}) translate(-12, -12)`,
      );
      group.appendChild(icon);
    } else if (d.type === 'marquee') {
      const rect = doc.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', String(Math.min(d.from.x, d.to.x)));
      rect.setAttribute('y', String(Math.min(d.from.y, d.to.y)));
      rect.setAttribute('width', String(Math.abs(d.to.x - d.from.x)));
      rect.setAttribute('height', String(Math.abs(d.to.y - d.from.y)));
      rect.setAttribute('fill', 'none');
      rect.setAttribute('stroke', style.colors.selection);
      rect.setAttribute('stroke-width', String(style.lineWidthPt));
      rect.setAttribute('stroke-dasharray', '2 2');
      group.appendChild(rect);
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
