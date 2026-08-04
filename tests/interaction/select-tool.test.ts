import { describe, test, expect } from 'vitest';
import { vec } from '../../src/core/geometry/vec2';
import { ACS1996 } from '../../src/core/style/presets';
import { createDocument, withMolecule, findAtom } from '../../src/core/model/document';
import type { Document } from '../../src/core/model/document';
import { emptyMolecule, addAtom, addBond } from '../../src/core/model/molecule';
import type { Command } from '../../src/core/commands/command';
import { SelectTool } from '../../src/interaction/tools/select';
import type { ToolContext, PointerInfo, Selection } from '../../src/interaction/tools';
import type { Decoration } from '../../src/render/decorators';

function makeCtx(initial: Document) {
  const state = {
    doc: initial,
    nextId: 1000,
    decorations: [] as Decoration[][],
    selection: { atoms: new Set<number>(), bonds: new Set<number>() } as Selection,
  };
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
    getSelection: () => state.selection,
    setSelection: (s) => { state.selection = s; },
  };
  return { ctx, state };
}

const at = (x: number, y: number, shift = false): PointerInfo => ({ pos: vec(x, y), alt: false, shift });

function chain3(): Document {
  let m = emptyMolecule();
  m = addAtom(m, { id: 1, element: 'C', pos: vec(0, 0), charge: 0, hydrogens: null });
  m = addAtom(m, { id: 2, element: 'C', pos: vec(14.4, 0), charge: 0, hydrogens: null });
  m = addAtom(m, { id: 3, element: 'C', pos: vec(28.8, 0), charge: 0, hydrogens: null });
  m = addBond(m, { id: 10, a: 1, b: 2, order: 1, stereo: 'none' });
  m = addBond(m, { id: 11, a: 2, b: 3, order: 1, stereo: 'none' });
  return withMolecule(createDocument(), m);
}

describe('SelectTool clicking', () => {
  test('click an atom selects just it', () => {
    const { ctx, state } = makeCtx(chain3());
    const tool = new SelectTool();
    tool.onDown(at(0.3, 0.3), ctx);
    tool.onUp(at(0.3, 0.3), ctx);
    expect([...state.selection.atoms]).toEqual([1]);
    expect(state.selection.bonds.size).toBe(0);
  });

  test('click a bond selects it', () => {
    const { ctx, state } = makeCtx(chain3());
    const tool = new SelectTool();
    tool.onDown(at(7.2, 0.4), ctx);
    tool.onUp(at(7.2, 0.4), ctx);
    expect([...state.selection.bonds]).toEqual([10]);
  });

  test('shift-click adds and toggles', () => {
    const { ctx, state } = makeCtx(chain3());
    const tool = new SelectTool();
    tool.onDown(at(0.3, 0.3), ctx);
    tool.onUp(at(0.3, 0.3), ctx);
    tool.onDown(at(14.5, 0.3, true), ctx);
    tool.onUp(at(14.5, 0.3, true), ctx);
    expect([...state.selection.atoms].sort()).toEqual([1, 2]);
    tool.onDown(at(0.3, 0.3, true), ctx); // toggle off
    tool.onUp(at(0.3, 0.3, true), ctx);
    expect([...state.selection.atoms]).toEqual([2]);
  });

  test('click on empty space clears the selection', () => {
    const { ctx, state } = makeCtx(chain3());
    const tool = new SelectTool();
    tool.onDown(at(0.3, 0.3), ctx);
    tool.onUp(at(0.3, 0.3), ctx);
    tool.onDown(at(100, 100), ctx);
    tool.onUp(at(100, 100), ctx);
    expect(state.selection.atoms.size).toBe(0);
  });
});

describe('SelectTool marquee', () => {
  test('drag on empty space selects enclosed atoms and their bonds', () => {
    const { ctx, state } = makeCtx(chain3());
    const tool = new SelectTool();
    tool.onDown(at(-5, -5), ctx);
    tool.onMove(at(20, 5), ctx);
    tool.onUp(at(20, 5), ctx);
    expect([...state.selection.atoms].sort()).toEqual([1, 2]);
    expect([...state.selection.bonds]).toEqual([10]); // 11 sticks out (atom 3 outside)
  });

  test('shows the marquee rect while dragging', () => {
    const { ctx, state } = makeCtx(chain3());
    const tool = new SelectTool();
    tool.onDown(at(-5, -5), ctx);
    tool.onMove(at(20, 5), ctx);
    expect(state.decorations.at(-1)?.some((d) => d.type === 'marquee')).toBe(true);
  });
});

describe('SelectTool move', () => {
  test('dragging a selected atom moves the whole selection in one command', () => {
    const { ctx, state } = makeCtx(chain3());
    const tool = new SelectTool();
    // select atoms 1 and 2
    tool.onDown(at(-5, -5), ctx);
    tool.onMove(at(20, 5), ctx);
    tool.onUp(at(20, 5), ctx);
    // drag atom 1 by (10, 20)
    tool.onDown(at(0.3, 0.3), ctx);
    tool.onMove(at(10.3, 20.3), ctx);
    tool.onUp(at(10.3, 20.3), ctx);
    expect(findAtom(state.doc, 1)?.atom.pos).toEqual({ x: 10, y: 20 });
    expect(findAtom(state.doc, 2)?.atom.pos).toEqual({ x: 24.4, y: 20 });
    expect(findAtom(state.doc, 3)?.atom.pos).toEqual({ x: 28.8, y: 0 }); // untouched
  });

  test('dragging an unselected atom selects it and moves it alone', () => {
    const { ctx, state } = makeCtx(chain3());
    const tool = new SelectTool();
    tool.onDown(at(0.3, 0.3), ctx);
    tool.onMove(at(10.3, 20.3), ctx);
    tool.onUp(at(10.3, 20.3), ctx);
    expect([...state.selection.atoms]).toEqual([1]);
    expect(findAtom(state.doc, 1)?.atom.pos).toEqual({ x: 10, y: 20 });
  });
});
