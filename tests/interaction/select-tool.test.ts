import { describe, test, expect } from 'vitest';
import { vec } from '../../src/core/geometry/vec2';
import { ACS1996 } from '../../src/core/style/presets';
import { createDocument, withMolecule, findAtom } from '../../src/core/model/document';
import type { Document } from '../../src/core/model/document';
import { emptyMolecule, addAtom, addBond } from '../../src/core/model/molecule';
import type { Command } from '../../src/core/commands/command';
import { SelectTool, selectionHandlePos } from '../../src/interaction/tools/select';
import { AddArrow, RotateAtoms } from '../../src/core/commands/ops';
import type { ToolContext, PointerInfo, Selection } from '../../src/interaction/tools';
import type { Decoration } from '../../src/render/decorators';

function makeCtx(initial: Document) {
  const state = {
    doc: initial,
    nextId: 1000,
    decorations: [] as Decoration[][],
    selection: { atoms: new Set<number>(), bonds: new Set<number>() } as Selection,
    previewDelta: null as { x: number; y: number } | null,
    previewRotate: null as { center: { x: number; y: number }; angle: number } | null,
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
    setPreviewMove: (d) => { state.previewDelta = d; },
    setPreviewRotate: (p) => { state.previewRotate = p; },
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

describe('SelectTool lasso', () => {
  test('lasso around a part of the molecule selects enclosed atoms and bonds', () => {
    const { ctx, state } = makeCtx(chain3());
    const tool = new SelectTool('lasso');
    // triangle around atoms 1 and 2, atom 3 outside
    tool.onDown(at(-5, -5), ctx);
    tool.onMove(at(25, -5), ctx);
    tool.onMove(at(10, 10), ctx);
    tool.onUp(at(10, 10), ctx);
    expect([...state.selection.atoms].sort()).toEqual([1, 2]);
    expect([...state.selection.bonds]).toEqual([10]);
  });

  test('lasso shows a dashed path while drawing', () => {
    const { ctx, state } = makeCtx(chain3());
    const tool = new SelectTool('lasso');
    tool.onDown(at(-5, -5), ctx);
    tool.onMove(at(25, -5), ctx);
    expect(state.decorations.at(-1)?.some((d) => d.type === 'lasso')).toBe(true);
  });

  test('lasso that closes back near its start still selects (not a click)', () => {
    const { ctx, state } = makeCtx(chain3());
    const tool = new SelectTool('lasso');
    // triangle around atoms 1 and 2, but release within the click threshold of start
    tool.onDown(at(-5, -5), ctx);
    tool.onMove(at(25, -5), ctx);
    tool.onMove(at(10, 10), ctx);
    tool.onMove(at(-4.6, -4.6), ctx); // back near the start (< 2 pt away)
    tool.onUp(at(-4.6, -4.6), ctx);
    expect([...state.selection.atoms].sort()).toEqual([1, 2]);
    expect([...state.selection.bonds]).toEqual([10]);
  });

  test('lasso with no real drag (a click) selects nothing', () => {
    const { ctx, state } = makeCtx(chain3());
    const tool = new SelectTool('lasso');
    tool.onDown(at(-5, -5), ctx);
    tool.onUp(at(-4.8, -4.8), ctx); // < 2 pt, no polygon drawn
    expect([...state.selection.atoms]).toEqual([]);
  });

  test('rect mode is the default', () => {
    const { ctx, state } = makeCtx(chain3());
    const tool = new SelectTool();
    tool.onDown(at(-5, -5), ctx);
    tool.onMove(at(20, 5), ctx);
    tool.onUp(at(20, 5), ctx);
    expect([...state.selection.atoms].sort()).toEqual([1, 2]);
  });
});

describe('SelectTool rotate handle', () => {
  test('dragging the corner handle rotates the selection by a 15°-snapped angle', () => {
    const { ctx, state } = makeCtx(chain3());
    const tool = new SelectTool();
    // select atoms 1 and 2
    tool.onDown(at(-5, -5), ctx);
    tool.onMove(at(20, 5), ctx);
    tool.onUp(at(20, 5), ctx);

    // handle: bbox (0,0)-(14.4,0) top-right + (8,-8) → (22.4, -8)
    // center of selection: (7.2, 0). start angle: atan2(-8, 15.2) ≈ -27.7°
    tool.onDown(at(22.4, -8), ctx);
    // drag to ~60° more clockwise: target angle ≈ -87.7° at same radius
    const c = { x: 7.2, y: 0 };
    const r = Math.hypot(15.2, 8);
    const target = -87.73 * (Math.PI / 180);
    tool.onMove(at(c.x + r * Math.cos(target), c.y + r * Math.sin(target)), ctx);
    expect(state.previewRotate).not.toBeNull();
    // preview is smooth (raw angle), snap applies on drop
    expect(state.previewRotate!.angle).toBeCloseTo(target - Math.atan2(-8, 15.2), 3);
    tool.onUp(at(c.x + r * Math.cos(target), c.y + r * Math.sin(target)), ctx);

    // atom 2 (14.4, 0) rotated -60° around (7.2, 0): rel (7.2,0) → (3.6, -6.235)
    const a2 = findAtom(state.doc, 2)!.atom.pos;
    expect(a2.x).toBeCloseTo(10.8, 3);
    expect(a2.y).toBeCloseTo(-6.235, 3);
    expect(state.previewRotate).toBeNull();
  });
});

describe('rotate handle placement', () => {
  test('handle sits on the top-right diagonal at maxRadius + offset from the centroid', () => {
    const { ctx } = makeCtx(chain3());
    const sel = { atoms: new Set([1, 2]), bonds: new Set<number>() };
    const pos = selectionHandlePos(ctx.document, sel)!;
    const center = { x: 7.2, y: 0 };
    const d = Math.hypot(pos.x - center.x, pos.y - center.y);
    expect(d).toBeCloseTo(7.2 + 8, 4); // maxRadius 7.2 + offset 8
    expect(pos.x).toBeGreaterThan(center.x);
    expect(pos.y).toBeLessThan(center.y); // upper right
    expect(Math.abs(pos.x - center.x)).toBeCloseTo(Math.abs(pos.y - center.y), 4); // 45°
  });

  test('handle position is stable across rotations of an asymmetric selection', () => {
    // three atoms with an off-center centroid: bbox center would drift under
    // rotation, the mean-position centroid must not
    let m = emptyMolecule();
    m = addAtom(m, { id: 1, element: 'C', pos: vec(0, 0), charge: 0, hydrogens: null });
    m = addAtom(m, { id: 2, element: 'C', pos: vec(14.4, 0), charge: 0, hydrogens: null });
    m = addAtom(m, { id: 3, element: 'C', pos: vec(28.8, 5), charge: 0, hydrogens: null });
    m = addBond(m, { id: 10, a: 1, b: 2, order: 1, stereo: 'none' });
    m = addBond(m, { id: 11, a: 2, b: 3, order: 1, stereo: 'none' });
    const { ctx, state } = makeCtx(withMolecule(createDocument(), m));
    const sel = { atoms: new Set([1, 2, 3]), bonds: new Set<number>() };
    const before = selectionHandlePos(ctx.document, sel)!;
    ctx.commit(new RotateAtoms([1, 2, 3], { x: (0 + 14.4 + 28.8) / 3, y: 5 / 3 }, Math.PI / 3));
    const after = selectionHandlePos(state.doc, sel)!;
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  test('handle position is stable across rotations of the selection', () => {
    const { ctx, state } = makeCtx(chain3());
    const tool = new SelectTool();
    tool.onDown(at(-5, -5), ctx);
    tool.onMove(at(20, 5), ctx);
    tool.onUp(at(20, 5), ctx);
    const before = selectionHandlePos(state.doc, state.selection);
    // rotate the selection 60° via the command directly
    ctx.commit(new RotateAtoms([...state.selection.atoms], { x: 7.2, y: 0 }, Math.PI / 3));
    const after = selectionHandlePos(state.doc, state.selection);
    expect(after!.x).toBeCloseTo(before!.x, 6);
    expect(after!.y).toBeCloseTo(before!.y, 6);
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

  test('during a move drag the context gets a live preview delta, cleared on drop', () => {
    const { ctx, state } = makeCtx(chain3());
    const tool = new SelectTool();
    tool.onDown(at(-5, -5), ctx);
    tool.onMove(at(20, 5), ctx);
    tool.onUp(at(20, 5), ctx);
    tool.onDown(at(0.3, 0.3), ctx);
    tool.onMove(at(10.3, 20.3), ctx);
    expect(state.previewDelta).not.toBeNull();
    expect(state.previewDelta!.x).toBeCloseTo(10);
    expect(state.previewDelta!.y).toBeCloseTo(20);
    expect(findAtom(state.doc, 1)?.atom.pos).toEqual({ x: 0, y: 0 }); // not yet committed
    tool.onUp(at(10.3, 20.3), ctx);
    expect(state.previewDelta).toBeNull();
    expect(findAtom(state.doc, 1)?.atom.pos).toEqual({ x: 10, y: 20 });
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

describe('SelectTool additive toggle (Shift / Cmd)', () => {
  const meta = (x: number, y: number): PointerInfo => ({ pos: vec(x, y), alt: false, shift: false, meta: true });

  test('Cmd-click a selected atom deselects it, then re-selects it', () => {
    const { ctx, state } = makeCtx(chain3());
    const tool = new SelectTool();
    tool.onDown(at(0, 0), ctx);   // click atom 1 → selects it
    tool.onUp(at(0, 0), ctx);
    expect(state.selection.atoms.has(1)).toBe(true);

    tool.onDown(meta(0, 0), ctx); // Cmd-click atom 1 → toggles off
    tool.onUp(meta(0, 0), ctx);
    expect(state.selection.atoms.has(1)).toBe(false);

    tool.onDown(meta(0, 0), ctx); // Cmd-click again → toggles on
    tool.onUp(meta(0, 0), ctx);
    expect(state.selection.atoms.has(1)).toBe(true);
  });
});

describe('SelectTool superfine move (arrows/pluses vs atoms)', () => {
  test('an arrow moves on a sub-threshold drag (superfine); an atom does not', () => {
    let doc = chain3();
    doc = new AddArrow({ id: 50, from: { x: 0, y: 20 }, to: { x: 20, y: 20 } }).do(doc);
    const { ctx, state } = makeCtx(doc);
    const tool = new SelectTool();

    // select the arrow, then nudge it 1 pt (under CLICK_THRESHOLD = 2)
    tool.onDown(at(10, 20), ctx);
    tool.onUp(at(10, 20), ctx);
    expect(state.selection.arrows?.has(50)).toBe(true);
    tool.onDown(at(10, 20), ctx);
    tool.onMove(at(11, 20), ctx);
    tool.onUp(at(11, 20), ctx);
    expect(state.doc.arrows[0].from.x).toBeCloseTo(1, 5); // committed the 1-pt move

    // an atom nudged 1 pt does NOT move (keeps the click threshold)
    tool.onDown(at(0.3, 0.3), ctx);
    tool.onMove(at(1.1, 0.3), ctx);
    tool.onUp(at(1.1, 0.3), ctx);
    expect(findAtom(state.doc, 1)?.atom.pos).toEqual({ x: 0, y: 0 });
  });
});
