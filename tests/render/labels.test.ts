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
    expect(labelText(mol, id)).toEqual({ element: 'O', h: 1, flipped: false });
  });

  test('terminal N with one bond is NH2', () => {
    const { mol, id } = molWith('N', [{ order: 1, dx: -14.4 }]);
    expect(labelText(mol, id)).toEqual({ element: 'N', h: 2, flipped: false });
  });

  test('bond leaving to the right flips the H to the front (HO, H2N)', () => {
    const { mol, id } = molWith('O', [{ order: 1, dx: 14.4 }]);
    expect(labelText(mol, id)).toEqual({ element: 'O', h: 1, flipped: true });
    const n = molWith('N', [{ order: 1, dx: 14.4 }]);
    expect(labelText(n.mol, n.id)).toEqual({ element: 'N', h: 2, flipped: true });
  });

  test('double-bonded O has no H', () => {
    const { mol, id } = molWith('O', [{ order: 2, dx: -14.4 }]);
    expect(labelText(mol, id)).toEqual({ element: 'O', h: 0, flipped: false });
  });

  test('middle N with two bonds is NH', () => {
    const { mol, id } = molWith('N', [{ order: 1, dx: -14.4 }, { order: 1, dx: 14.4 }]);
    expect(labelText(mol, id)).toEqual({ element: 'N', h: 1, flipped: false });
  });

  test('bonds leaning right flip the H to the left, even with several bonds', () => {
    // down-left bond + strong right bond: H goes left ('HN') so the right
    // bond attaches to the N letter
    const { mol, id } = molWith('N', [{ order: 1, dx: -7.2 }, { order: 1, dx: 14.4 }]);
    expect(labelText(mol, id).flipped).toBe(true);
  });

  test('bonds leaning left keep H on the right', () => {
    const { mol, id } = molWith('N', [{ order: 1, dx: -14.4 }, { order: 1, dx: 7.2 }]);
    expect(labelText(mol, id).flipped).toBe(false);
  });
});

describe('renderLabel H counts', () => {
  const makeG = () => {
    const svg = document.createElementNS(SVG_NS, 'svg');
    const g = document.createElementNS(SVG_NS, 'g');
    svg.appendChild(g);
    document.body.appendChild(svg);
    return g as unknown as SVGGElement;
  };

  test('H count 2 renders as a subscript tspan', () => {
    const { mol, id } = molWith('N', [{ order: 1, dx: -14.4 }]);
    const g = makeG();
    renderLabel(document, g, mol, mol.atoms.get(id)!, ACS1996);
    const text = g.querySelector('text')!;
    expect(text.textContent).toBe('NH2');
    const sub = [...text.querySelectorAll('tspan')].find((t) => t.getAttribute('baseline-shift') === 'sub');
    expect(sub?.textContent).toBe('2');
  });

  test('flipped label renders H first, then subscript, then element (H2N, not HN2)', () => {
    const { mol, id } = molWith('N', [{ order: 1, dx: 14.4 }]);
    const g = makeG();
    renderLabel(document, g, mol, mol.atoms.get(id)!, ACS1996);
    const text = g.querySelector('text')!;
    expect(text.textContent).toBe('H2N');
    // subscript tspan sits between the H and the N
    expect(text.childNodes[0].textContent).toBe('H');
    expect(text.childNodes[1].textContent).toBe('2');
    expect(text.childNodes[2].textContent).toBe('N');
  });

  test('OH with bond from the left: shifted RIGHT so the O letter sits at the atom position', () => {
    const { mol, id } = molWith('O', [{ order: 1, dx: -14.4 }]);
    const g = makeG();
    const measure = (t: string) => t.length * 6; // fake: 6pt per char
    renderLabel(document, g, mol, mol.atoms.get(id)!, ACS1996, measure);
    const text = g.querySelector('text')!;
    expect(text.textContent).toBe('OH');
    // text 'OH' centered at x: O center = x - width('OH')/2 + width('O')/2 = x - 3
    // → x = +3 puts the O exactly at the atom position
    expect(Number(text.getAttribute('x'))).toBeCloseTo(3);
  });

  test('flipped HO with bond to the right: shifted LEFT so O sits at the atom position', () => {
    const { mol, id } = molWith('O', [{ order: 1, dx: 14.4 }]);
    const g = makeG();
    const measure = (t: string) => t.length * 6;
    renderLabel(document, g, mol, mol.atoms.get(id)!, ACS1996, measure);
    const text = g.querySelector('text')!;
    expect(text.textContent).toBe('HO');
    // O is the second glyph: O center = x + 3 → x = -3
    expect(Number(text.getAttribute('x'))).toBeCloseTo(-3);
  });

  test('single-letter labels are not shifted', () => {
    const { mol, id } = molWith('O', [{ order: 2, dx: -14.4 }]);
    const g = makeG();
    renderLabel(document, g, mol, mol.atoms.get(id)!, ACS1996, (t) => t.length * 6);
    expect(Number(g.querySelector('text')!.getAttribute('x'))).toBeCloseTo(0);
  });
});
