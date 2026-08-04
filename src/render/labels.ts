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
  // H's — and, when there are no H's, charges — go on the side the bonds
  // lean AWAY from, so bonds visually attach to the element letter.
  // Tolerance: a vertical bond is a tie (decorations right), not a lean.
  let lean = 0;
  for (const bondId of bondsOf(mol, atomId)) {
    const bond = mol.bonds.get(bondId)!;
    const otherId = bond.a === atomId ? bond.b : bond.a;
    lean += mol.atoms.get(otherId)!.pos.x - atom.pos.x;
  }
  return { element: atom.element, h, flipped: lean > 1e-6 };
}

/** True when the charge superscript belongs on the LEFT (where the H was). */
export function chargeOnLeft(content: LabelContent, charge: string): boolean {
  return charge !== '' && content.h === 0 && content.flipped;
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
  const sup = (t: string) => {
    const el = doc.createElementNS(SVG_NS, 'tspan');
    el.setAttribute('baseline-shift', 'super');
    el.setAttribute('font-size', String(style.labelSizePt * 0.75));
    el.textContent = t;
    text.appendChild(el);
  };
  if (chargeOnLeft(content, charge)) {
    sup(charge);
    text.appendChild(doc.createTextNode(element));
    return;
  }
  if (flipped && h > 0) {
    text.textContent = 'H';
    if (h >= 2) sub(String(h));
    text.appendChild(doc.createTextNode(element));
  } else {
    text.textContent = element + (h > 0 ? 'H' : '');
    if (h >= 2) sub(String(h));
  }
  if (charge) sup(charge);
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
  const chargeWidth = charge ? m(charge, 0.75) : 0;
  // the element letter NEVER moves: H's extend to their side, and the
  // charge extends to the side the H's were on
  const onLeft = chargeOnLeft({ element, h, flipped }, charge);
  const leftW = (flipped ? hWidth : 0) + (onLeft ? chargeWidth : 0);
  const rightW = (flipped ? 0 : hWidth) + (onLeft ? 0 : chargeWidth);
  const width = m(element) + hWidth + chargeWidth;
  return {
    cx: atom.pos.x + (rightW - leftW) / 2,
    cy: atom.pos.y,
    halfW: width / 2,
    halfHUp: style.labelSizePt * 0.38 + (charge ? style.labelSizePt * 0.35 : 0),
    // subscripts hang to the side, not toward bonds: no extra depth for them
    halfHDown: style.labelSizePt * 0.38,
  };
}

/**
 * Distance from `from` along `dir` until the ray first touches the box:
 * entry when outside, exit when inside, Infinity on a miss. Slab method.
 */
export function rayBoxDistance(from: Vec2, dir: Vec2, box: LabelBox): number {
  const dx = from.x - box.cx;
  const dy = from.y - box.cy;
  let tmin = -Infinity;
  let tmax = Infinity;

  if (Math.abs(dir.x) < 1e-9) {
    if (dx < -box.halfW || dx > box.halfW) return Infinity;
  } else {
    const t1 = (-box.halfW - dx) / dir.x;
    const t2 = (box.halfW - dx) / dir.x;
    tmin = Math.max(tmin, Math.min(t1, t2));
    tmax = Math.min(tmax, Math.max(t1, t2));
  }

  const top = -box.halfHUp;
  const bottom = box.halfHDown;
  if (Math.abs(dir.y) < 1e-9) {
    if (dy < top || dy > bottom) return Infinity;
  } else {
    const t1 = (top - dy) / dir.y;
    const t2 = (bottom - dy) / dir.y;
    tmin = Math.max(tmin, Math.min(t1, t2));
    tmax = Math.min(tmax, Math.max(t1, t2));
  }

  if (tmax < tmin || tmax < 0) return Infinity;
  return tmin > 0 ? tmin : tmax;
}

/**
 * The label as boxes for bond trimming: the main text at glyph height,
 * plus a separate taller box for the charge superscript above its right
 * end — so superscripts only block bonds that actually reach them.
 */
export function labelBoxes(
  mol: Molecule,
  atomId: number,
  style: StyleSheet,
  measure?: TextMeasurer,
): LabelBox[] {
  const atom = mol.atoms.get(atomId)!;
  const m = measure ?? makeMeasurer(style);
  const { element, h, flipped } = labelText(mol, atomId);
  const charge = chargeText(atom.charge);
  const hWidth = h > 0 ? m('H') + (h >= 2 ? m(String(h), 0.75) : 0) : 0;
  const leftW = flipped ? hWidth : 0;
  const rightW = flipped ? 0 : hWidth;
  const mainCx = atom.pos.x + (rightW - leftW) / 2;
  const mainHalfW = (m(element) + hWidth) / 2;
  const up = style.labelSizePt * 0.38;
  const boxes: LabelBox[] = [
    { cx: mainCx, cy: atom.pos.y, halfW: mainHalfW, halfHUp: up, halfHDown: up },
  ];
  if (charge) {
    const cw = m(charge, 0.75);
    const onLeft = chargeOnLeft({ element, h, flipped }, charge);
    boxes.push({
      cx: onLeft ? mainCx - mainHalfW - cw / 2 : mainCx + mainHalfW + cw / 2,
      cy: atom.pos.y,
      halfW: cw / 2,
      halfHUp: style.labelSizePt * 0.73,
      halfHDown: style.labelSizePt * 0.1,
    });
  }
  return boxes;
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
