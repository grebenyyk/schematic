import type { Atom, Molecule } from '../core/model/molecule';
import { bondsOf } from '../core/model/molecule';
import type { Vec2 } from '../core/geometry/vec2';
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
  element: string;
  /** Implicit H count (0 = no H shown). */
  h: number;
  /** True when H precedes the element (bond leaves to the right): HO–, H2N–. */
  flipped: boolean;
}

export function labelText(mol: Molecule, atomId: number): LabelContent {
  const atom = mol.atoms.get(atomId)!;
  const h = implicitHydrogens(mol, atomId);
  // H's go on the side the bonds lean AWAY from, so bonds visually attach to
  // the element letter, not the hydrogens. Ties (or vertical bonds): H right.
  let lean = 0;
  for (const bondId of bondsOf(mol, atomId)) {
    const bond = mol.bonds.get(bondId)!;
    const otherId = bond.a === atomId ? bond.b : bond.a;
    lean += mol.atoms.get(otherId)!.pos.x - atom.pos.x;
  }
  const flipped = h > 0 && lean > 0;
  return { element: atom.element, h, flipped };
}

/**
 * Fill a <text> with a label: element + H (+ subscript) + charge superscript.
 * Flipped labels lead with H (and its subscript), then the element.
 */
export function appendLabelContent(
  doc: Document,
  text: SVGTextElement,
  content: LabelContent & { charge: string },
  style: StyleSheet,
): void {
  const { element, h, flipped, charge } = content;
  const sub = (t: string) => {
    const el = doc.createElementNS(SVG_NS, 'tspan');
    el.setAttribute('baseline-shift', 'sub');
    el.setAttribute('font-size', String(style.labelSizePt * 0.75));
    el.textContent = t;
    text.appendChild(el);
  };
  if (flipped && h > 0) {
    text.textContent = 'H';
    if (h >= 2) sub(String(h));
    text.appendChild(doc.createTextNode(element));
  } else {
    text.textContent = element + (h > 0 ? 'H' : '');
    if (h >= 2) sub(String(h));
  }
  if (charge) {
    const sup = doc.createElementNS(SVG_NS, 'tspan');
    sup.setAttribute('baseline-shift', 'super');
    sup.setAttribute('font-size', String(style.labelSizePt * 0.75));
    sup.textContent = charge;
    text.appendChild(sup);
  }
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

export interface LabelBox {
  cx: number;
  cy: number;
  halfW: number;
  halfHUp: number;
  halfHDown: number;
}

/** Bounding box of a rendered label (element + H + charge), for bond trimming. */
export function labelBox(
  mol: Molecule,
  atomId: number,
  style: StyleSheet,
  measure?: TextMeasurer,
): LabelBox {
  const atom = mol.atoms.get(atomId)!;
  const m = measure ?? makeMeasurer(style);
  const { element, h, flipped } = labelText(mol, atomId);
  const charge = chargeText(atom.charge);
  const hWidth = h > 0 ? m('H') + (h >= 2 ? m(String(h), 0.75) : 0) : 0;
  // the element letter sits at the atom position: for 'OH' the label shifts
  // RIGHT by half the H part, for flipped 'HO' it shifts LEFT
  const xShift = h > 0 ? (flipped ? -1 : 1) * (hWidth / 2) : 0;
  const width = m(element) + hWidth + (charge ? m(charge, 0.75) : 0);
  return {
    cx: atom.pos.x + xShift,
    cy: atom.pos.y,
    halfW: width / 2,
    halfHUp: style.labelSizePt * 0.38 + (charge ? style.labelSizePt * 0.35 : 0),
    halfHDown: style.labelSizePt * 0.38 + (h >= 2 ? style.labelSizePt * 0.2 : 0),
  };
}

/** Distance from `from` along `dir` to the edge of the label box. */
export function rayRectExit(from: Vec2, dir: Vec2, box: LabelBox): number {
  const dx = from.x - box.cx;
  const dy = from.y - box.cy;
  let t = Infinity;
  if (dir.x > 1e-9) t = Math.min(t, (box.halfW - dx) / dir.x);
  else if (dir.x < -1e-9) t = Math.min(t, (-box.halfW - dx) / dir.x);
  if (dir.y < -1e-9) t = Math.min(t, (-box.halfHUp - dy) / dir.y);
  else if (dir.y > 1e-9) t = Math.min(t, (box.halfHDown - dy) / dir.y);
  return t;
}

export function renderLabel(
  doc: Document,
  group: SVGGElement,
  mol: Molecule,
  atom: Atom,
  style: StyleSheet,
  measure?: TextMeasurer,
): void {
  const content = labelText(mol, atom.id);
  const box = labelBox(mol, atom.id, style, measure);
  const text = doc.createElementNS(SVG_NS, 'text');
  text.setAttribute('class', 'atom-label');
  text.dataset.atomId = String(atom.id);
  text.setAttribute('x', String(box.cx));
  text.setAttribute('y', String(box.cy));
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('dominant-baseline', 'central');
  text.setAttribute('font-family', style.labelFont);
  text.setAttribute('font-size', String(style.labelSizePt));
  text.setAttribute('fill', labelColor(atom, style));
  // no knockout: bonds are trimmed to the label box, a halo is unnecessary
  appendLabelContent(doc, text, { ...content, charge: chargeText(atom.charge) }, style);

  group.appendChild(text);
}
