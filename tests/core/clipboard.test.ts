import { describe, test, expect } from 'vitest';
import { vec } from '../../src/core/geometry/vec2';
import { createDocument, withMolecule } from '../../src/core/model/document';
import { emptyMolecule, addAtom, addBond } from '../../src/core/model/molecule';
import { AddArrow, AddPlus } from '../../src/core/commands/ops';
import { serializeSelection, parseSelectionBlob } from '../../src/core/clipboard';

describe('clipboard serialization', () => {
  const docWithSelection = () => {
    let m = emptyMolecule();
    m = addAtom(m, { id: 1, element: 'C', pos: vec(0, 0), charge: 0, hydrogens: null });
    m = addAtom(m, { id: 2, element: 'C', pos: vec(14.4, 0), charge: 0, hydrogens: null });
    m = addAtom(m, { id: 3, element: 'O', pos: vec(28.8, 0), charge: 0, hydrogens: null }); // not selected
    m = addBond(m, { id: 10, a: 1, b: 2, order: 1, stereo: 'none' });
    m = addBond(m, { id: 11, a: 2, b: 3, order: 1, stereo: 'none' }); // spans in/out → dropped
    let doc = withMolecule(createDocument(), m);
    doc = new AddArrow({ id: 20, from: { x: 0, y: 10 }, to: { x: 20, y: 10 } }).do(doc);
    doc = new AddPlus({ id: 21, pos: { x: 30, y: 10 } }).do(doc);
    return doc;
  };

  test('captures selected atoms + their internal bonds + arrows + pluses', () => {
    const blob = serializeSelection(docWithSelection(), {
      atoms: new Set([1, 2]),
      bonds: new Set(),
      arrows: new Set([20]),
      pluses: new Set([21]),
    });
    expect(blob.atoms.map((a) => a.id).sort()).toEqual([1, 2]);
    expect(blob.bonds.map((b) => b.id)).toEqual([10]); // bond 11 dropped (atom 3 not selected)
    expect(blob.arrows.map((a) => a.id)).toEqual([20]);
    expect(blob.pluses.map((p) => p.id)).toEqual([21]);
  });

  test('parseSelectionBlob round-trips and rejects junk', () => {
    const blob = serializeSelection(docWithSelection(), {
      atoms: new Set([1, 2]),
      bonds: new Set(),
    });
    const parsed = parseSelectionBlob(JSON.stringify(blob));
    expect(parsed?.atoms).toHaveLength(2);
    expect(parseSelectionBlob('not json')).toBeNull();
    expect(parseSelectionBlob('{"atoms":1}')).toBeNull();
  });
});
