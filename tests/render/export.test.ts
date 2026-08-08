// @vitest-environment jsdom
import { describe, test, expect } from 'vitest';
import { vec } from '../../src/core/geometry/vec2';
import { documentSvg } from '../../src/render/export';
import { ACS1996 } from '../../src/core/style/presets';
import { createDocument, withMolecule } from '../../src/core/model/document';
import { emptyMolecule, addAtom, addBond } from '../../src/core/model/molecule';

describe('documentSvg', () => {
  test('a self-contained SVG: bonds + labels, no decorators, with xmlns', () => {
    let m = emptyMolecule();
    m = addAtom(m, { id: 1, element: 'C', pos: vec(0, 0), charge: 0, hydrogens: null });
    m = addAtom(m, { id: 2, element: 'O', pos: vec(14.4, 0), charge: 0, hydrogens: null });
    m = addBond(m, { id: 10, a: 1, b: 2, order: 2, stereo: 'none' });
    const doc = withMolecule(createDocument(), m);

    const svg = documentSvg(document, doc, ACS1996);

    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('class="bonds"');
    expect(svg).toContain('class="labels"');
    expect(svg).toContain('class="bond"');
    // exports strip the live selection/snap-guide layer
    expect(svg).not.toContain('decorators');
    // the O heteroatom is labeled; the bonded carbon is not
    expect(svg).toMatch(/>O</);
  });

  test('carries an explicit pixel width/height for rasterization', () => {
    let m = emptyMolecule();
    m = addAtom(m, { id: 1, element: 'C', pos: vec(0, 0), charge: 0, hydrogens: null });
    m = addAtom(m, { id: 2, element: 'C', pos: vec(14.4, 0), charge: 0, hydrogens: null });
    m = addBond(m, { id: 10, a: 1, b: 2, order: 1, stereo: 'none' });
    const svg = documentSvg(document, withMolecule(createDocument(), m), ACS1996);
    expect(svg).toMatch(/width="/);
    expect(svg).toMatch(/height="/);
  });
});
