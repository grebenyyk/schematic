import { describe, test, expect } from 'vitest';
import { vec } from '../../../src/core/geometry/vec2';
import { createDocument, findAtom } from '../../../src/core/model/document';
import { History } from '../../../src/core/commands/history';
import { AddAtom, RotateAtoms } from '../../../src/core/commands/ops';

const atom = (id: number, x = 0, y = 0) => ({ id, element: 'C', pos: vec(x, y), charge: 0, hydrogens: null as null });

describe('RotateAtoms', () => {
  test('rotates atoms around a center; undo restores', () => {
    const h = new History(createDocument());
    h.commit(new AddAtom(atom(1, 10, 0), null));
    h.commit(new AddAtom(atom(2, 20, 0), 0));

    h.commit(new RotateAtoms([1, 2], vec(10, 0), Math.PI / 2));
    // (10,0) stays; (20,0) → 90° around (10,0) → (10,10)
    expect(findAtom(h.document, 1)?.atom.pos.x).toBeCloseTo(10);
    expect(findAtom(h.document, 1)?.atom.pos.y).toBeCloseTo(0);
    expect(findAtom(h.document, 2)?.atom.pos.x).toBeCloseTo(10);
    expect(findAtom(h.document, 2)?.atom.pos.y).toBeCloseTo(10);

    h.undo();
    expect(findAtom(h.document, 2)?.atom.pos.x).toBeCloseTo(20);
    expect(findAtom(h.document, 2)?.atom.pos.y).toBeCloseTo(0);
  });

  test('unlisted atoms are untouched', () => {
    const h = new History(createDocument());
    h.commit(new AddAtom(atom(1, 10, 0), null));
    h.commit(new AddAtom(atom(2, 20, 0), 0));
    h.commit(new RotateAtoms([1], vec(10, 0), Math.PI / 2));
    expect(findAtom(h.document, 2)?.atom.pos.x).toBeCloseTo(20);
  });
});
