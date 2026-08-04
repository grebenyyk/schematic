import { describe, test, expect } from 'vitest';
import { vec, dist } from '../../src/core/geometry/vec2';
import { ACS1996 } from '../../src/core/style/presets';
import { createDocument, withMolecule } from '../../src/core/model/document';
import type { Document } from '../../src/core/model/document';
import { emptyMolecule, addAtom, addBond } from '../../src/core/model/molecule';
import type { Command } from '../../src/core/commands/command';
import { ChainTool } from '../../src/interaction/tools/chain';
import type { ToolContext, PointerInfo } from '../../src/interaction/tools';
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
  };
  return { ctx, state };
}

const at = (x: number, y: number): PointerInfo => ({ pos: vec(x, y), alt: false, shift: false });

describe('ChainTool', () => {
  test('drag from empty space builds a zigzag chain as one command', () => {
    const { ctx, state } = makeCtx(createDocument());
    const tool = new ChainTool();
    tool.onDown(at(0, 0), ctx);
    tool.onMove(at(40, 5), ctx);
    tool.onUp(at(40, 5), ctx);
    expect(state.doc.molecules).toHaveLength(1);
    const mol = state.doc.molecules[0];
    // 40pt along ≈ 3 segments (round(40/14.4) = 3)
    expect(mol.atoms.size).toBe(4);
    expect(mol.bonds.size).toBe(3);
    const atoms = [...mol.atoms.values()];
    for (const bond of mol.bonds.values()) {
      expect(dist(atoms.find((a) => a.id === bond.a)!.pos, atoms.find((a) => a.id === bond.b)!.pos))
        .toBeCloseTo(ACS1996.bondLengthPt);
    }
  });

  test('chain length follows the drag distance', () => {
    const { ctx, state } = makeCtx(createDocument());
    const tool = new ChainTool();
    tool.onDown(at(0, 0), ctx);
    tool.onMove(at(75, 0), ctx);
    tool.onUp(at(75, 0), ctx);
    expect(state.doc.molecules[0].atoms.size).toBe(6); // round(75/14.4) = 5 segments
  });

  test('drag from an atom extends that molecule', () => {
    let m = emptyMolecule();
    m = addAtom(m, { id: 1, element: 'C', pos: vec(0, 0), charge: 0, hydrogens: null });
    m = addAtom(m, { id: 2, element: 'C', pos: vec(14.4, 0), charge: 0, hydrogens: null });
    m = addBond(m, { id: 10, a: 1, b: 2, order: 1, stereo: 'none' });
    const { ctx, state } = makeCtx(withMolecule(createDocument(), m));
    const tool = new ChainTool();
    tool.onDown(at(14.3, 0.2), ctx); // on atom 2
    tool.onMove(at(45, 3), ctx);
    tool.onUp(at(45, 3), ctx);
    expect(state.doc.molecules).toHaveLength(1);
    expect(state.doc.molecules[0].atoms.size).toBe(4); // 2 old + 2 new
    expect(state.doc.molecules[0].bonds.size).toBe(3);
  });

  test('chain end near an existing atom merges onto it', () => {
    let m = emptyMolecule();
    m = addAtom(m, { id: 1, element: 'C', pos: vec(43, 1), charge: 0, hydrogens: null });
    const { ctx, state } = makeCtx(withMolecule(createDocument(), m));
    const tool = new ChainTool();
    tool.onDown(at(0, 0), ctx);
    tool.onMove(at(42.5, 1.2), ctx);
    tool.onUp(at(42.5, 1.2), ctx);
    expect(state.doc.molecules).toHaveLength(1);
    expect(state.doc.molecules[0].atoms.size).toBe(4); // 3 new + merged existing
    expect(state.doc.molecules[0].bonds.size).toBe(3);
  });

  test('previews the chain while dragging', () => {
    const { ctx, state } = makeCtx(createDocument());
    const tool = new ChainTool();
    tool.onDown(at(0, 0), ctx);
    tool.onMove(at(40, 5), ctx);
    const guides = state.decorations.at(-1)!.filter((d) => d.type === 'snap-guide');
    expect(guides.length).toBe(3);
  });

  test('click without drag does nothing', () => {
    const { ctx, state } = makeCtx(createDocument());
    const tool = new ChainTool();
    tool.onDown(at(10, 10), ctx);
    tool.onUp(at(10, 10), ctx);
    expect(state.doc.molecules).toHaveLength(0);
  });
});
