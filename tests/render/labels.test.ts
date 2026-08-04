// @vitest-environment jsdom
import { describe, test, expect } from 'vitest';
import { vec } from '../../src/core/geometry/vec2';
import { ACS1996 } from '../../src/core/style/presets';
import { emptyMolecule, addAtom, addBond, type BondOrder, type Molecule } from '../../src/core/model/molecule';
import { labelText, renderLabel } from '../../src/render/labels';

const SVG_NS = 'http://www.w3.org/2000/svg';

function molWith(
  element: string,
  bonds: { order: BondOrder; dx: number }[],
  charge = 0,
): { mol: Molecule; id: number } {
  let m = emptyMolecule();
  m = addAtom(m, { id: 1, element, pos: vec(0, 0), charge, hydrogens: null });
  bonds.forEach(({ order, dx }, i) => {
    m = addAtom(m, { id: 10 + i, element: 'C', pos: vec(dx, 0), charge: 0, hydrogens: null });
    m = addBond(m, { id: 100 + i, a: 1, b: 10 + i, order, stereo: 'none' });
  });
  return { mol: m, id: 1 };
}

describe('labelText', () => {
  test('terminal O with one single bond is OH', () => {
    const { mol, id } = molWith('O', [{ order: 1, dx: -14.4 }]);
    expect(labelText(mol, id)).toEqual({ main: 'OH', hCount: 0, flipped: false });
  });

  test('terminal N with one bond is NH2', () => {
    const { mol, id } = molWith('N', [{ order: 1, dx: -14.4 }]);
    expect(labelText(mol, id)).toEqual({ main: 'NH', hCount: 2, flipped: false });
  });

  test('bond leaving to the right flips the H to the front (HO, H2N)', () => {
    const { mol, id } = molWith('O', [{ order: 1, dx: 14.4 }]);
    expect(labelText(mol, id)).toEqual({ main: 'HO', hCount: 0, flipped: true });
    const n = molWith('N', [{ order: 1, dx: 14.4 }]);
    expect(labelText(n.mol, n.id)).toEqual({ main: 'HN', hCount: 2, flipped: true });
  });

  test('double-bonded O has no H', () => {
    const { mol, id } = molWith('O', [{ order: 2, dx: -14.4 }]);
    expect(labelText(mol, id)).toEqual({ main: 'O', hCount: 0, flipped: false });
  });

  test('middle N with two bonds is NH', () => {
    const { mol, id } = molWith('N', [{ order: 1, dx: -14.4 }, { order: 1, dx: 14.4 }]);
    expect(labelText(mol, id)).toEqual({ main: 'NH', hCount: 0, flipped: false });
  });
});

describe('renderLabel H counts', () => {
  test('H count 2 renders as a subscript tspan', () => {
    const { mol, id } = molWith('N', [{ order: 1, dx: -14.4 }]);
    const svg = document.createElementNS(SVG_NS, 'svg');
    const g = document.createElementNS(SVG_NS, 'g');
    svg.appendChild(g);
    document.body.appendChild(svg);
    renderLabel(document, g as unknown as SVGGElement, mol, mol.atoms.get(id)!, ACS1996);
    const text = g.querySelector('text')!;
    expect(text.textContent).toBe('NH2');
    const sub = [...text.querySelectorAll('tspan')].find((t) => t.getAttribute('baseline-shift') === 'sub');
    expect(sub?.textContent).toBe('2');
  });
});
