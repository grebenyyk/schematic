// @vitest-environment jsdom
import { describe, test, expect, beforeEach } from 'vitest';
import { vec } from '../../src/core/geometry/vec2';
import { ACS1996 } from '../../src/core/style/presets';
import { createDocument, withMolecule, allocId } from '../../src/core/model/document';
import { emptyMolecule, addAtom, addBond, type Molecule } from '../../src/core/model/molecule';
import { renderDocument } from '../../src/render/renderer';
import { renderDecorations, type Decoration } from '../../src/render/decorators';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** C≡N plus a standalone O, exercising triple bond + hetero labels. */
function demoDoc() {
  let doc = createDocument();
  let m: Molecule = emptyMolecule();
  const ids: number[] = [];
  for (let i = 0; i < 3; i++) {
    const r = allocId(doc);
    doc = r.doc;
    ids.push(r.id);
  }
  m = addAtom(m, { id: ids[0], element: 'C', pos: vec(0, 0), charge: 0, hydrogens: null });
  m = addAtom(m, { id: ids[1], element: 'N', pos: vec(14.4, 0), charge: 1, hydrogens: null });
  m = addAtom(m, { id: ids[2], element: 'O', pos: vec(40, 20), charge: 0, hydrogens: null });
  m = addBond(m, { id: ids[0] + 100, a: ids[0], b: ids[1], order: 3, stereo: 'none' });
  return withMolecule(doc, m);
}

describe('renderDocument', () => {
  let svg: SVGSVGElement;
  beforeEach(() => {
    svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
    document.body.appendChild(svg);
  });

  test('emits layered groups in order: bonds, labels, decorators', () => {
    renderDocument(document, svg, demoDoc(), ACS1996);
    const classes = [...svg.children].map((c) => c.getAttribute('class'));
    expect(classes).toEqual(['bonds', 'labels', 'decorators']);
  });

  test('triple bond renders three lines in the bonds layer', () => {
    renderDocument(document, svg, demoDoc(), ACS1996);
    const bonds = svg.querySelector('g.bonds')!;
    expect(bonds.querySelectorAll('g.bond')).toHaveLength(1);
    expect(bonds.querySelectorAll('line')).toHaveLength(3);
  });

  test('hetero atoms get text labels; bonded carbon does not', () => {
    renderDocument(document, svg, demoDoc(), ACS1996);
    const labels = svg.querySelector('g.labels')!;
    const texts = [...labels.querySelectorAll('text')];
    const contents = texts.map((t) => t.textContent);
    expect(contents.some((c) => c?.includes('N'))).toBe(true);
    expect(contents.some((c) => c?.includes('O'))).toBe(true);
    expect(contents.some((c) => c === 'C')).toBe(false);
  });

  test('labels use paint-order stroke knockout with background color', () => {
    renderDocument(document, svg, demoDoc(), ACS1996);
    const text = svg.querySelector('g.labels text')!;
    expect(text.getAttribute('paint-order')).toBe('stroke');
    expect(text.getAttribute('stroke')).toBe(ACS1996.colors.background);
  });

  test('charge renders as superscript tspan', () => {
    renderDocument(document, svg, demoDoc(), ACS1996);
    const nLabel = [...svg.querySelectorAll('g.labels text')].find((t) => t.textContent?.includes('N'))!;
    const sup = nLabel.querySelector('tspan');
    expect(sup?.textContent).toBe('+');
    expect(sup?.getAttribute('baseline-shift')).toBe('super');
  });

  test('sets a viewBox covering the content', () => {
    renderDocument(document, svg, demoDoc(), ACS1996);
    expect(svg.getAttribute('viewBox')).toMatch(/^-?[\d.]+ -?[\d.]+ [\d.]+ [\d.]+$/);
  });

  test('re-render replaces previous content (full redraw)', () => {
    renderDocument(document, svg, demoDoc(), ACS1996);
    renderDocument(document, svg, demoDoc(), ACS1996);
    expect(svg.querySelectorAll('g.bond')).toHaveLength(1);
  });
});

describe('renderDecorations', () => {
  test('hover atom draws a circle, snap guide draws a dashed line', () => {
    const svg = document.createElementNS(SVG_NS, 'svg') as unknown as SVGSVGElement;
    const g = document.createElementNS(SVG_NS, 'g') as unknown as SVGGElement;
    svg.appendChild(g);
    const decorations: Decoration[] = [
      { type: 'hover-atom', pos: vec(5, 5) },
      { type: 'snap-guide', from: vec(0, 0), to: vec(14.4, 0) },
    ];
    renderDecorations(document, g, decorations, ACS1996);
    expect(g.querySelectorAll('circle')).toHaveLength(1);
    const guide = g.querySelector('line')!;
    expect(guide.getAttribute('stroke-dasharray')).toBeTruthy();
    expect(guide.getAttribute('stroke')).toBe(ACS1996.colors.hover);
  });
});
