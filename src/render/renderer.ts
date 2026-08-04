import type { Document as MolDocument } from '../core/model/document';
import { allAtoms } from '../core/model/document';
import { bondsOf } from '../core/model/molecule';
import { ringPath } from '../core/model/rings';
import type { StyleSheet } from '../core/style/stylesheet';
import { bondAxis, renderBond } from './bonds';
import { hasVisibleLabel, renderLabel } from './labels';
import { renderDecorations, type Decoration } from './decorators';

const SVG_NS = 'http://www.w3.org/2000/svg';

function layer(dom: Document, svg: SVGSVGElement, cls: string): SVGGElement {
  const g = dom.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', cls);
  svg.appendChild(g);
  return g;
}

/** How much to shorten a bond endpoint: clearance where a label sits. */
function trimFor(labeled: boolean, style: StyleSheet): number {
  return labeled ? style.marginPt + style.labelSizePt * 0.35 : 0;
}

function updateViewBox(svg: SVGSVGElement, doc: MolDocument, style: StyleSheet): void {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const a of allAtoms(doc)) {
    minX = Math.min(minX, a.pos.x); maxX = Math.max(maxX, a.pos.x);
    minY = Math.min(minY, a.pos.y); maxY = Math.max(maxY, a.pos.y);
  }
  if (!isFinite(minX)) {
    svg.setAttribute('viewBox', '0 0 100 100');
    return;
  }
  const pad = style.bondLengthPt * 1.5;
  svg.setAttribute(
    'viewBox',
    `${minX - pad} ${minY - pad} ${maxX - minX + 2 * pad} ${maxY - minY + 2 * pad}`,
  );
}

/**
 * Full redraw of a document into an SVG element: layered groups
 * bonds → labels → decorators. Incremental patching comes later,
 * once commands report affected ids.
 */
export function renderDocument(
  dom: Document,
  svg: SVGSVGElement,
  doc: MolDocument,
  style: StyleSheet,
  decorations: Decoration[] = [],
): void {
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  const bondsG = layer(dom, svg, 'bonds');
  const labelsG = layer(dom, svg, 'labels');
  const decoratorsG = layer(dom, svg, 'decorators');

  for (const mol of doc.molecules) {
    const labeled = new Map<number, boolean>();
    for (const atom of mol.atoms.values()) {
      const degree = [...bondsOf(mol, atom.id)].length;
      labeled.set(atom.id, hasVisibleLabel(atom, degree));
    }
    for (const bond of mol.bonds.values()) {
      const a = mol.atoms.get(bond.a)!;
      const b = mol.atoms.get(bond.b)!;
      const axis = bondAxis(
        a.pos, b.pos,
        trimFor(labeled.get(a.id)!, style),
        trimFor(labeled.get(b.id)!, style),
      );
      renderBond(dom, bondsG, bond, axis, style, bond.order === 2 ? ringPath(mol, bond.id) : null);
    }
    for (const atom of mol.atoms.values()) {
      if (labeled.get(atom.id)) renderLabel(dom, labelsG, atom, style);
    }
  }

  renderDecorations(dom, decoratorsG, decorations, style);
  updateViewBox(svg, doc, style);
}
