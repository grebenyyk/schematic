import { describe, test, expect } from 'vitest';
import { createDocument, findArrow, findPlus } from '../../../src/core/model/document';
import { AddArrow, AddPlus, MoveArrows, MovePluses, DeleteArrows, DeletePluses } from '../../../src/core/commands/ops';

describe('reaction commands', () => {
  test('AddArrow appends; undo removes', () => {
    let doc = createDocument();
    const cmd = new AddArrow({ id: 5, from: { x: 0, y: 0 }, to: { x: 10, y: 0 } });
    doc = cmd.do(doc);
    expect(doc.arrows).toHaveLength(1);
    expect(findArrow(doc, 5)).toBeDefined();
    doc = cmd.undo(doc);
    expect(doc.arrows).toHaveLength(0);
  });

  test('MoveArrows translates both endpoints; undo restores', () => {
    let doc = new AddArrow({ id: 1, from: { x: 0, y: 0 }, to: { x: 10, y: 0 } }).do(createDocument());
    const mv = new MoveArrows([1], { x: 5, y: 2 });
    doc = mv.do(doc);
    expect(findArrow(doc, 1)!.from).toEqual({ x: 5, y: 2 });
    expect(findArrow(doc, 1)!.to).toEqual({ x: 15, y: 2 });
    doc = mv.undo(doc);
    expect(findArrow(doc, 1)!.from).toEqual({ x: 0, y: 0 });
  });

  test('DeleteArrows removes; undo restores the snapshot', () => {
    let doc = createDocument();
    doc = new AddArrow({ id: 1, from: { x: 0, y: 0 }, to: { x: 1, y: 0 } }).do(doc);
    doc = new AddArrow({ id: 2, from: { x: 0, y: 0 }, to: { x: 1, y: 0 } }).do(doc);
    const del = new DeleteArrows([1]);
    doc = del.do(doc);
    expect(doc.arrows.map((a) => a.id)).toEqual([2]);
    doc = del.undo(doc);
    expect(doc.arrows.map((a) => a.id).sort()).toEqual([1, 2]);
  });

  test('AddPlus / MovePluses / DeletePluses', () => {
    let doc = new AddPlus({ id: 1, pos: { x: 0, y: 0 } }).do(createDocument());
    expect(findPlus(doc, 1)).toBeDefined();
    doc = new MovePluses([1], { x: 3, y: 4 }).do(doc);
    expect(findPlus(doc, 1)!.pos).toEqual({ x: 3, y: 4 });
    doc = new DeletePluses([1]).do(doc);
    expect(doc.pluses).toHaveLength(0);
  });
});
