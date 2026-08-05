import { describe, test, expect } from 'vitest';
import { vec, angle, sub, dist } from '../../../src/core/geometry/vec2';
import { createDocument, withMolecule, findAtom } from '../../../src/core/model/document';
import { emptyMolecule, addAtom, addBond } from '../../../src/core/model/molecule';
import { History } from '../../../src/core/commands/history';
import { ScaleAtoms } from '../../../src/core/commands/ops';
import { rectifyCommand } from '../../../src/core/commands/rectify';

describe('ScaleAtoms', () => {
  test('scales positions around a center; undo restores', () => {
    let doc = createDocument();
    let m = emptyMolecule();
    m = addAtom(m, { id: 1, element: 'C', pos: vec(10, 0), charge: 0, hydrogens: null });
    m = addAtom(m, { id: 2, element: 'C', pos: vec(20, 0), charge: 0, hydrogens: null });
    doc = withMolecule(doc, m);
    const h = new History(doc);
    h.commit(new ScaleAtoms([1, 2], vec(10, 0), 2));
    expect(findAtom(h.document, 2)?.atom.pos).toEqual({ x: 30, y: 0 });
    h.undo();
    expect(findAtom(h.document, 2)?.atom.pos).toEqual({ x: 20, y: 0 });
  });
});

describe('rectifyCommand', () => {
  /** Chain tilted ~7° with off-length bonds. */
  function sloppyDoc() {
    let doc = createDocument();
    let m = emptyMolecule();
    m = addAtom(m, { id: 1, element: 'C', pos: vec(0, 0), charge: 0, hydrogens: null });
    m = addAtom(m, { id: 2, element: 'C', pos: vec(13.9, 1.7), charge: 0, hydrogens: null });
    m = addAtom(m, { id: 3, element: 'C', pos: vec(27.1, -0.9), charge: 0, hydrogens: null });
    m = addBond(m, { id: 10, a: 1, b: 2, order: 1, stereo: 'none' });
    m = addBond(m, { id: 11, a: 2, b: 3, order: 1, stereo: 'none' });
    return withMolecule(doc, m);
  }

  test('straightens the dominant direction to 15° grid and normalizes bond lengths', () => {
    const doc = sloppyDoc();
    const cmd = rectifyCommand(doc, [1, 2, 3], 14.4);
    expect(cmd).not.toBeNull();
    const out = cmd!.do(doc);
    const p1 = findAtom(out, 1)!.atom.pos;
    const p2 = findAtom(out, 2)!.atom.pos;
    const p3 = findAtom(out, 3)!.atom.pos;
    // longest bond (1–2) snapped to the 15° grid
    const deg = (angle(sub(p2, p1)) * 180) / Math.PI;
    expect(Math.round(deg / 15) * 15).toBeCloseTo(deg, 5);
    // mean bond length normalized to the style bond length
    const mean = (dist(p1, p2) + dist(p2, p3)) / 2;
    expect(mean).toBeCloseTo(14.4, 4);
  });

  test('returns null for fewer than two atoms or no bonds', () => {
    expect(rectifyCommand(createDocument(), [], 14.4)).toBeNull();
    const doc = withMolecule(createDocument(),
      addAtom(emptyMolecule(), { id: 1, element: 'C', pos: vec(0, 0), charge: 0, hydrogens: null }));
    expect(rectifyCommand(doc, [1], 14.4)).toBeNull();
  });
});
