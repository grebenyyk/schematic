import type { Vec2 } from '../core/geometry/vec2';
import type { Document as MolDocument } from '../core/model/document';
import { findAtom } from '../core/model/document';
import { bondsOf } from '../core/model/molecule';
import type { StyleSheet } from '../core/style/stylesheet';
import { appendLabelContent, chargeText, hasVisibleLabel, labelText, makeMeasurer } from './labels';

const SVG_NS = 'http://www.w3.org/2000/svg';

export type Decoration =
  | {
      type: 'hover-atom';
      pos: Vec2;
      labeled: boolean;
      /** Label content when labeled (element, H count, flip, charge). */
      element?: string;
      h?: number;
      flipped?: boolean;
      charge?: string;
    }
  | { type: 'hover-bond'; center: Vec2 }
  | { type: 'snap-guide'; from: Vec2; to: Vec2 };

/** Hover/merge highlight for an atom: full-label outline when labeled, circle otherwise. */
export function atomHoverDecoration(doc: MolDocument, atomId: number): Decoration {
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
        // shifted exactly like the real label so they overlay
        let xShift = 0;
        if (d.h && d.h > 0) {
          const m = makeMeasurer(style);
          const hPartWidth = m('H') + (d.h >= 2 ? m(String(d.h), 0.75) : 0);
          xShift = (d.flipped ? -1 : 1) * (hPartWidth / 2);
        }
        const t = doc.createElementNS(SVG_NS, 'text');
        t.setAttribute('x', String(d.pos.x + xShift));
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
