import type { Atom, Molecule } from '../core/model/molecule';
import { bondsOf } from '../core/model/molecule';
import type { StyleSheet } from '../core/style/stylesheet';
import { implicitHydrogens } from '../core/chem/valence';

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

export interface LabelContent {
  /** Element symbol with 'H' on the appropriate side, e.g. 'OH', 'NH', 'HO'. */
  main: string;
  /** Subscript digit for H counts ≥ 2 (0 = no digit shown). */
  hCount: number;
  /** True when H precedes the element (bond leaves to the right): HO–, H2N–. */
  flipped: boolean;
}

export function labelText(mol: Molecule, atomId: number): LabelContent {
  const atom = mol.atoms.get(atomId)!;
  const h = implicitHydrogens(mol, atomId);
  const incident = [...bondsOf(mol, atomId)];
  const flipped = incident.length === 1 && (() => {
    const bond = mol.bonds.get(incident[0])!;
    const otherId = bond.a === atomId ? bond.b : bond.a;
    return mol.atoms.get(otherId)!.pos.x > atom.pos.x;
  })();
  const hCount = h >= 2 ? h : 0;
  const main = h === 0
    ? atom.element
    : flipped
      ? `H${atom.element}`
      : `${atom.element}H`;
  return { main, hCount, flipped };
}

export function labelColor(atom: Atom, style: StyleSheet): string {
  if (style.labelColorMode === 'hetero-color') {
    return style.atomColors?.[atom.element] ?? style.colors.bond;
  }
  return style.colors.bond;
}

/** Measures text width in pt at the label font (second arg = size scale). */
export type TextMeasurer = (text: string, scale?: number) => number;

let measureCanvas: CanvasRenderingContext2D | null | undefined;

/** Canvas-backed measurement when available, per-char estimate otherwise. */
export function makeMeasurer(style: StyleSheet): TextMeasurer {
  if (measureCanvas === undefined && typeof document !== 'undefined') {
    measureCanvas = document.createElement('canvas').getContext('2d');
  }
  return (text, scale = 1) => {
    const size = style.labelSizePt * scale;
    if (measureCanvas) {
      measureCanvas.font = `${size}px ${style.labelFont}`;
      return measureCanvas.measureText(text).width;
    }
    return text.length * size * 0.62; // jsdom / fallback estimate
  };
}

export function renderLabel(
  doc: Document,
  group: SVGGElement,
  mol: Molecule,
  atom: Atom,
  style: StyleSheet,
  measure?: TextMeasurer,
): void {
  const { main, hCount, flipped } = labelText(mol, atom.id);
  const hasH = main.includes('H') && main.length > atom.element.length;
  let xShift = 0;
  if (hasH) {
    const m = measure ?? makeMeasurer(style);
    // keep the element letter at the atom position: shift by half the H part
    const hPartWidth = m('H') + (hCount > 0 ? m(String(hCount), 0.75) : 0);
    xShift = (flipped ? 1 : -1) * (hPartWidth / 2);
  }
  const text = doc.createElementNS(SVG_NS, 'text');
  text.setAttribute('class', 'atom-label');
  text.dataset.atomId = String(atom.id);
  text.setAttribute('x', String(atom.pos.x + xShift));
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
  text.textContent = main;

  if (hCount > 0) {
    const sub = doc.createElementNS(SVG_NS, 'tspan');
    sub.setAttribute('baseline-shift', 'sub');
    sub.setAttribute('font-size', String(style.labelSizePt * 0.75));
    sub.textContent = String(hCount);
    text.appendChild(sub);
  }
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
