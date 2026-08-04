import { describe, test, expect } from 'vitest';
import { vec } from '../../../src/core/geometry/vec2';
import { createDocument, findAtom } from '../../../src/core/model/document';
import { History } from '../../../src/core/commands/history';
import { AddAtom, SetElement, SetCharge } from '../../../src/core/commands/ops';

const atom = (id: number) => ({ id, element: 'C', pos: vec(0, 0), charge: 0, hydrogens: null as null });

describe('SetElement', () => {
  test('changes the element and undoes cleanly', () => {
    const h = new History(createDocument());
    h.commit(new AddAtom(atom(1), null));
    h.commit(new SetElement(1, 'N'));
    expect(findAtom(h.document, 1)?.atom.element).toBe('N');
    h.undo();
    expect(findAtom(h.document, 1)?.atom.element).toBe('C');
    h.redo();
    expect(findAtom(h.document, 1)?.atom.element).toBe('N');
  });

  test('supports two-letter elements', () => {
    const h = new History(createDocument());
    h.commit(new AddAtom(atom(1), null));
    h.commit(new SetElement(1, 'Cl'));
    expect(findAtom(h.document, 1)?.atom.element).toBe('Cl');
  });
});

describe('SetCharge', () => {
  test('sets charge and undoes to the previous value', () => {
    const h = new History(createDocument());
    h.commit(new AddAtom(atom(1), null));
    h.commit(new SetCharge(1, 1));
    expect(findAtom(h.document, 1)?.atom.charge).toBe(1);
    h.commit(new SetCharge(1, -1));
    expect(findAtom(h.document, 1)?.atom.charge).toBe(-1);
    h.undo();
    expect(findAtom(h.document, 1)?.atom.charge).toBe(1);
    h.undo();
    expect(findAtom(h.document, 1)?.atom.charge).toBe(0);
  });
});
