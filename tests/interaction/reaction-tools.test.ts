import { describe, test, expect } from 'vitest';
import { vec } from '../../src/core/geometry/vec2';
import { ACS1996 } from '../../src/core/style/presets';
import { createDocument } from '../../src/core/model/document';
import type { Document } from '../../src/core/model/document';
import type { Command } from '../../src/core/commands/command';
import { AddArrow, AddPlus } from '../../src/core/commands/ops';
import { pick } from '../../src/core/geometry/hit';
import { ArrowTool } from '../../src/interaction/tools/arrow';
import { PlusTool } from '../../src/interaction/tools/plus';
import type { ToolContext, PointerInfo, Selection } from '../../src/interaction/tools';
import type { Decoration } from '../../src/render/decorators';

function makeCtx(initial: Document) {
  const state = { doc: initial, nextId: 1000, decorations: [] as Decoration[][] };
  const ctx: ToolContext = {
    style: ACS1996,
    get document() { return state.doc; },
    commit(cmd: Command) { state.doc = cmd.do(state.doc); },
    allocIds(n: number) {
      const ids = Array.from({ length: n }, (_, i) => state.nextId + i);
      state.nextId += n;
      return ids;
    },
    setDecorations(d: Decoration[]) { state.decorations.push(d); },
    getSelection: () => ({ atoms: new Set(), bonds: new Set() }),
    setSelection: (_s: Selection) => {},
    setPreviewMove: () => {},
    setPreviewRotate: () => {},
  };
  return { ctx, state };
}

const at = (x: number, y: number, alt = false): PointerInfo => ({ pos: vec(x, y), alt, shift: false });

describe('ArrowTool', () => {
  test('drag draws an arrow snapped to 45°', () => {
    const { ctx, state } = makeCtx(createDocument());
    const tool = new ArrowTool();
    tool.onDown(at(0, 0), ctx);
    tool.onMove(at(10, 10), ctx);
    tool.onUp(at(10, 10), ctx);
    expect(state.doc.arrows).toHaveLength(1);
    const a = state.doc.arrows[0];
    expect(a.from).toEqual({ x: 0, y: 0 });
    expect(a.to.x).toBeCloseTo(a.to.y, 5); // 45° → equal x and y
  });

  test('a click drops a default horizontal arrow', () => {
    const { ctx, state } = makeCtx(createDocument());
    const tool = new ArrowTool();
    tool.onDown(at(50, 50), ctx);
    tool.onUp(at(50, 50), ctx); // no move → default
    expect(state.doc.arrows).toHaveLength(1);
    const a = state.doc.arrows[0];
    expect(a.from).toEqual({ x: 50, y: 50 });
    expect(a.to.x).toBeCloseTo(50 + 3 * ACS1996.bondLengthPt, 5);
    expect(a.to.y).toBe(50);
  });

  test('Alt disables angle snapping', () => {
    const { ctx, state } = makeCtx(createDocument());
    const tool = new ArrowTool();
    tool.onDown(at(0, 0), ctx);
    tool.onMove(at(10, 3, true), ctx); // Alt → free end
    tool.onUp(at(10, 3), ctx);
    expect(state.doc.arrows[0].to).toEqual({ x: 10, y: 3 });
  });
});

describe('PlusTool', () => {
  test('click places a plus at the pointer', () => {
    const { ctx, state } = makeCtx(createDocument());
    const tool = new PlusTool();
    tool.onUp(at(20, 20), ctx);
    expect(state.doc.pluses).toHaveLength(1);
    expect(state.doc.pluses[0].pos).toEqual({ x: 20, y: 20 });
  });
});

describe('pick arrows/pluses', () => {
  test('hits an arrow near its segment, a plus near its point', () => {
    let doc = createDocument();
    doc = new AddArrow({ id: 1, from: { x: 0, y: 0 }, to: { x: 20, y: 0 } }).do(doc);
    doc = new AddPlus({ id: 2, pos: { x: 0, y: 20 } }).do(doc);
    expect(pick(doc, { x: 10, y: 0.5 }, { atomRadius: 5, bondTolerance: 3 })?.kind).toBe('arrow');
    expect(pick(doc, { x: 0, y: 20 }, { atomRadius: 5, bondTolerance: 3 })?.kind).toBe('plus');
    expect(pick(doc, { x: 100, y: 100 }, { atomRadius: 5, bondTolerance: 3 })).toBeNull();
  });
});
