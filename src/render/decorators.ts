import type { Vec2 } from '../core/geometry/vec2';
import type { Document as MolDocument } from '../core/model/document';
import { findAtom } from '../core/model/document';
import { bondsOf } from '../core/model/molecule';
import type { StyleSheet } from '../core/style/stylesheet';
import { appendLabelContent, chargeText, hasVisibleLabel, labelBox, labelText } from './labels';
import { renderArrow } from './arrow';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Selection highlights sit slightly below full strength (the pre-refactor look). */
const SELECTION_OPACITY = 0.35;

/** Fields shared by hover-atom and select-atom — they render identically, only color differs. */
interface AtomHighlightShape {
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

export type Decoration =
  | ({ type: 'hover-atom' } & AtomHighlightShape)
  | { type: 'hover-bond'; center: Vec2 }
  | { type: 'snap-guide'; from: Vec2; to: Vec2 }
  | ({ type: 'select-atom' } & AtomHighlightShape)
  | { type: 'select-bond'; center: Vec2 }
  | { type: 'marquee'; from: Vec2; to: Vec2 }
  | { type: 'lasso'; points: Vec2[] }
  | { type: 'rotate-handle'; pos: Vec2 }
  | { type: 'arrow'; from: Vec2; to: Vec2 };

/** Compute the labeled/label-content fields for an atom highlight. */
function atomHighlightFields(doc: MolDocument, atomId: number, style: StyleSheet): AtomHighlightShape {
  const loc = findAtom(doc, atomId)!;
  const mol = doc.molecules[loc.moleculeIndex];
  const degree = [...bondsOf(mol, atomId)].length;
  const labeled = hasVisibleLabel(loc.atom, degree);
  if (!labeled) return { pos: loc.atom.pos, labeled };
  const { element, h, flipped } = labelText(mol, atomId);
  return {
    pos: loc.atom.pos,
    labeled,
    cx: labelBox(mol, atomId, style).cx,
    element,
    h,
    flipped,
    charge: chargeText(loc.atom.charge),
  };
}

/** Hover/merge highlight for an atom: full-label outline when labeled, circle otherwise. */
export function atomHoverDecoration(doc: MolDocument, atomId: number, style: StyleSheet): Decoration {
  return { type: 'hover-atom', ...atomHighlightFields(doc, atomId, style) };
}

/** Selection highlight for an atom — same shape as the hover, drawn in the selection color. */
export function atomSelectionDecoration(doc: MolDocument, atomId: number, style: StyleSheet): Decoration {
  return { type: 'select-atom', ...atomHighlightFields(doc, atomId, style) };
}

/**
 * Outline an atom in `color`: the whole label (OH, NH2, charges…) as a stroked
 * <text> when labeled, a circle outline at the vertex otherwise. Centered
 * exactly where the real label sits.
 */
function drawAtomHighlight(
  dom: Document,
  group: SVGGElement,
  d: AtomHighlightShape,
  color: string,
  style: StyleSheet,
  opacity?: number,
): void {
  if (d.labeled && d.element) {
    const t = dom.createElementNS(SVG_NS, 'text');
    t.setAttribute('x', String(d.cx ?? d.pos.x));
    t.setAttribute('y', String(d.pos.y));
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('dominant-baseline', 'central');
    t.setAttribute('font-family', style.labelFont);
    t.setAttribute('font-size', String(style.labelSizePt));
    t.setAttribute('fill', 'none');
    t.setAttribute('stroke', color);
    t.setAttribute('stroke-width', String(style.lineWidthPt));
    if (opacity !== undefined) t.setAttribute('opacity', String(opacity));
    appendLabelContent(dom, t, {
      element: d.element,
      h: d.h ?? 0,
      flipped: d.flipped ?? false,
      charge: d.charge ?? '',
    }, style);
    group.appendChild(t);
  } else {
    // carbon vertex: circle outline
    const c = dom.createElementNS(SVG_NS, 'circle');
    c.setAttribute('cx', String(d.pos.x));
    c.setAttribute('cy', String(d.pos.y));
    c.setAttribute('r', String(style.labelSizePt * 0.35));
    c.setAttribute('fill', 'none');
    c.setAttribute('stroke', color);
    c.setAttribute('stroke-width', String(style.lineWidthPt * 1.5));
    if (opacity !== undefined) c.setAttribute('opacity', String(opacity));
    group.appendChild(c);
  }
}

/** A small filled dot at a bond's center — the bond highlight affordance. */
function drawBondDot(
  dom: Document,
  group: SVGGElement,
  center: Vec2,
  color: string,
  style: StyleSheet,
  opacity?: number,
): void {
  const c = dom.createElementNS(SVG_NS, 'circle');
  c.setAttribute('cx', String(center.x));
  c.setAttribute('cy', String(center.y));
  c.setAttribute('r', String(style.labelSizePt * 0.15));
  c.setAttribute('fill', color);
  if (opacity !== undefined) c.setAttribute('opacity', String(opacity));
  group.appendChild(c);
}

export function renderDecorations(
  dom: Document,
  group: SVGGElement,
  decorations: Decoration[],
  style: StyleSheet,
): void {
  for (const d of decorations) {
    if (d.type === 'hover-atom') {
      drawAtomHighlight(dom, group, d, style.colors.hover, style);
    } else if (d.type === 'select-atom') {
      // selection mirrors the bond-tool hover style, in its own green, slightly dimmed
      drawAtomHighlight(dom, group, d, style.colors.selection, style, SELECTION_OPACITY);
    } else if (d.type === 'hover-bond') {
      drawBondDot(dom, group, d.center, style.colors.hover, style);
    } else if (d.type === 'select-bond') {
      drawBondDot(dom, group, d.center, style.colors.selection, style, SELECTION_OPACITY);
    } else if (d.type === 'lasso') {
      if (d.points.length >= 2) {
        const poly = dom.createElementNS(SVG_NS, 'polygon');
        poly.setAttribute('points', d.points.map((p) => `${p.x},${p.y}`).join(' '));
        poly.setAttribute('fill', style.colors.selection);
        poly.setAttribute('fill-opacity', '0.12');
        poly.setAttribute('stroke', style.colors.selection);
        poly.setAttribute('stroke-width', String(style.lineWidthPt));
        poly.setAttribute('stroke-dasharray', '2 2');
        group.appendChild(poly);
      }
    } else if (d.type === 'rotate-handle') {
      // circular-arrow affordance at the selection's top-right corner
      const r = style.labelSizePt * 0.45;
      const circle = dom.createElementNS(SVG_NS, 'circle');
      circle.setAttribute('cx', String(d.pos.x));
      circle.setAttribute('cy', String(d.pos.y));
      circle.setAttribute('r', String(r));
      circle.setAttribute('fill', style.colors.background);
      circle.setAttribute('stroke', style.colors.selection);
      circle.setAttribute('stroke-width', String(style.lineWidthPt));
      group.appendChild(circle);
      // Feather rotate-cw, centered in the circle
      const s = (r * 1.3) / 24;
      const icon = dom.createElementNS(SVG_NS, 'path');
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
    } else if (d.type === 'arrow') {
      renderArrow(dom, group, { from: d.from, to: d.to }, style, style.colors.hover);
    } else if (d.type === 'marquee') {
      const rect = dom.createElementNS(SVG_NS, 'rect');
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
      const line = dom.createElementNS(SVG_NS, 'line');
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
