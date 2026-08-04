import { describe, test, expect } from 'vitest';
import { vec } from '../../../src/core/geometry/vec2';
import { createDocument, findAtom, findBond, allocId } from '../../../src/core/model/document';
import { History } from '../../../src/core/commands/history';
import { CompoundCommand } from '../../../src/core/commands/command';
import { AddAtom, AddBond, SetBondOrder, DeleteAtoms } from '../../../src/core/commands/ops';

const atom = (id: number, x = 0, y = 0) => ({ id, element: 'C', pos: vec(x, y), charge: 0, hydrogens: null as null });

describe('History with AddAtom/AddBond', () => {
  test('commit applies the command; undo reverts; redo reapplies', () => {
    const h = new History(createDocument());
    h.commit(new AddAtom(atom(1), null));
    expect(findAtom(h.document, 1)).not.toBeNull();
    expect(h.document.molecules).toHaveLength(1);

    expect(h.undo()).toBe(true);
    expect(findAtom(h.document, 1)).toBeNull();
    expect(h.document.molecules).toHaveLength(0);

    expect(h.redo()).toBe(true);
    expect(findAtom(h.document, 1)).not.toBeNull();
  });

  test('undo on empty history returns false', () => {
    const h = new History(createDocument());
    expect(h.undo()).toBe(false);
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(false);
  });

  test('committing clears the redo stack', () => {
    const h = new History(createDocument());
    h.commit(new AddAtom(atom(1), null));
    h.undo();
    h.commit(new AddAtom(atom(2), null));
    expect(h.canRedo).toBe(false);
  });

  test('AddAtom onto existing molecule does not create a new one', () => {
    const h = new History(createDocument());
    h.commit(new AddAtom(atom(1), null));
    h.commit(new AddAtom(atom(2, 14.4, 0), 0));
    h.commit(new AddBond({ id: 10, a: 1, b: 2, order: 1, stereo: 'none' }, 0));
    expect(h.document.molecules).toHaveLength(1);
    expect(findBond(h.document, 10)).not.toBeNull();
    h.undo();
    expect(findBond(h.document, 10)).toBeNull();
    expect(findAtom(h.document, 2)).not.toBeNull();
  });

  test('id allocation survives undo (no id reuse)', () => {
    const h = new History(createDocument());
    const r = allocId(h.document);
    // history documents are replaced by commands; simulate tool allocating then committing
    const h2 = new History(r.doc);
    h2.commit(new AddAtom(atom(r.id), null));
    h2.undo();
    expect(h2.document.meta.nextId).toBe(r.doc.meta.nextId);
  });
});

describe('SetBondOrder', () => {
  test('changes order and restores on undo', () => {
    const h = new History(createDocument());
    h.commit(new AddAtom(atom(1), null));
    h.commit(new AddAtom(atom(2, 14.4, 0), 0));
    h.commit(new AddBond({ id: 10, a: 1, b: 2, order: 1, stereo: 'none' }, 0));
    h.commit(new SetBondOrder(10, 2));
    expect(findBond(h.document, 10)?.bond.order).toBe(2);
    h.undo();
    expect(findBond(h.document, 10)?.bond.order).toBe(1);
  });
});

describe('DeleteAtoms', () => {
  test('removes atoms and incident bonds, undo restores them', () => {
    const h = new History(createDocument());
    h.commit(new AddAtom(atom(1), null));
    h.commit(new AddAtom(atom(2, 14.4, 0), 0));
    h.commit(new AddAtom(atom(3, 28.8, 0), 0));
    h.commit(new AddBond({ id: 10, a: 1, b: 2, order: 1, stereo: 'none' }, 0));
    h.commit(new AddBond({ id: 11, a: 2, b: 3, order: 2, stereo: 'none' }, 0));

    h.commit(new DeleteAtoms([2]));
    expect(findAtom(h.document, 2)).toBeNull();
    expect(findBond(h.document, 10)).toBeNull();
    expect(findBond(h.document, 11)).toBeNull();

    h.undo();
    expect(findAtom(h.document, 2)).not.toBeNull();
    expect(findBond(h.document, 10)?.bond.order).toBe(1);
    expect(findBond(h.document, 11)?.bond.order).toBe(2);
  });
});

describe('AddBond across molecules', () => {
  test('merges the two molecules; undo splits them back', () => {
    const h = new History(createDocument());
    h.commit(new AddAtom(atom(1), null));
    h.commit(new AddAtom(atom(2, 0, 40), null));
    expect(h.document.molecules).toHaveLength(2);

    h.commit(new AddBond({ id: 10, a: 1, b: 2, order: 1, stereo: 'none' }, 0, 1));
    expect(h.document.molecules).toHaveLength(1);
    expect(h.document.molecules[0].atoms.size).toBe(2);
    expect(findBond(h.document, 10)).not.toBeNull();

    h.undo();
    expect(h.document.molecules).toHaveLength(2);
    expect(findBond(h.document, 10)).toBeNull();
    expect(findAtom(h.document, 1)).not.toBeNull();
    expect(findAtom(h.document, 2)).not.toBeNull();
  });
});

describe('CompoundCommand', () => {
  test('a whole gesture undoes as one unit', () => {
    const h = new History(createDocument());
    h.commit(new CompoundCommand([
      new AddAtom(atom(1), null),
      new AddAtom(atom(2, 14.4, 0), 0),
      new AddBond({ id: 10, a: 1, b: 2, order: 1, stereo: 'none' }, 0),
    ], 'Draw bond'));
    expect(findBond(h.document, 10)).not.toBeNull();
    h.undo();
    expect(h.document.molecules).toHaveLength(0);
    expect(h.canRedo).toBe(true);
    h.redo();
    expect(findBond(h.document, 10)).not.toBeNull();
  });
});
