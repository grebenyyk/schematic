import { describe, test, expect } from 'vitest';
import { vec } from '../../../src/core/geometry/vec2';
import { createDocument, findAtom } from '../../../src/core/model/document';
import { History } from '../../../src/core/commands/history';
import { AddAtom, MoveAtoms } from '../../../src/core/commands/ops';

const atom = (id: number, x = 0, y = 0) => ({ id, element: 'C', pos: vec(x, y), charge: 0, hydrogens: null as null });

describe('MoveAtoms', () => {
  test('translates the given atoms; undo restores positions', () => {
    const h = new History(createDocument());
    h.commit(new AddAtom(atom(1), null));
    h.commit(new AddAtom(atom(2, 14.4, 0), 0));

    h.commit(new MoveAtoms([1, 2], vec(10, -5)));
    expect(findAtom(h.document, 1)?.atom.pos).toEqual({ x: 10, y: -5 });
    expect(findAtom(h.document, 2)?.atom.pos).toEqual({ x: 24.4, y: -5 });

    h.undo();
    expect(findAtom(h.document, 1)?.atom.pos.x).toBeCloseTo(0);
    expect(findAtom(h.document, 1)?.atom.pos.y).toBeCloseTo(0);
    expect(findAtom(h.document, 2)?.atom.pos.x).toBeCloseTo(14.4);
    expect(findAtom(h.document, 2)?.atom.pos.y).toBeCloseTo(0);

    h.redo();
    expect(findAtom(h.document, 1)?.atom.pos).toEqual({ x: 10, y: -5 });
  });

  test('leaves unlisted atoms alone', () => {
    const h = new History(createDocument());
    h.commit(new AddAtom(atom(1), null));
    h.commit(new AddAtom(atom(2, 14.4, 0), 0));
    h.commit(new MoveAtoms([1], vec(5, 5)));
    expect(findAtom(h.document, 2)?.atom.pos).toEqual({ x: 14.4, y: 0 });
  });
});
