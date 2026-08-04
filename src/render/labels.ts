import type { Atom } from '../core/model/molecule';
import type { StyleSheet } from '../core/style/stylesheet';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Skeletal rule: carbon shows no label when it has bonds and no charge. */
export function hasVisibleLabel(atom: Atom, degree: number): boolean {
  if (atom.element !== 'C') return true;
  return degree === 0 || atom.charge !== 0 || atom.hydrogens != null || atom.isotope != null;
}

export function chargeText(charge: number): string {
  if (charge === 0) return '';
  const sign = charge > 0 ? '+' : '−';
  const n = Math.abs(charge);
  return n === 1 ? sign : `${n}${sign}`;
}

export function labelColor(atom: Atom, style: StyleSheet): string {
  if (style.labelColorMode === 'hetero-color') {
    return style.atomColors?.[atom.element] ?? style.colors.bond;
  }
  return style.colors.bond;
}

export function renderLabel(
  doc: Document,
  group: SVGGElement,
  atom: Atom,
  style: StyleSheet,
): void {
  const text = doc.createElementNS(SVG_NS, 'text');
  text.setAttribute('class', 'atom-label');
  text.dataset.atomId = String(atom.id);
  text.setAttribute('x', String(atom.pos.x));
  text.setAttribute('y', String(atom.pos.y));
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('dominant-baseline', 'central');
  text.setAttribute('font-family', style.labelFont);
  text.setAttribute('font-size', String(style.labelSizePt));
  text.setAttribute('fill', labelColor(atom, style));
  // label knockout: thick background-colored stroke painted under the fill
  text.setAttribute('paint-order', 'stroke');
  text.setAttribute('stroke', style.colors.background);
  text.setAttribute('stroke-width', String(style.marginPt * 2));
  text.setAttribute('stroke-linejoin', 'round');
  text.textContent = atom.element;

  const charge = chargeText(atom.charge);
  if (charge) {
    const sup = doc.createElementNS(SVG_NS, 'tspan');
    sup.setAttribute('baseline-shift', 'super');
    sup.setAttribute('font-size', String(style.labelSizePt * 0.75));
    sup.textContent = charge;
    text.appendChild(sup);
  }

  group.appendChild(text);
}
