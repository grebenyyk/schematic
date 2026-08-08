import { describe, test, expect } from 'vitest';
import { vec } from '../../src/core/geometry/vec2';
import { ACS1996 } from '../../src/core/style/presets';
import { createDocument, withMolecule } from '../../src/core/model/document';
import type { Document } from '../../src/core/model/document';
import { emptyMolecule, addAtom, addBond } from '../../src/core/model/molecule';
import type { Command } from '../../src/core/commands/command';
import { RingTool } from '../../src/interaction/tools/ring';
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

const at = (x: number, y: number): PointerInfo => ({ pos: vec(x, y), alt: false, shift: false });

function docWithOneAtom(): Document {
  let m = emptyMolecule();
  m = addAtom(m, { id: 1, element: 'C', pos: vec(0, 0), charge: 0, hydrogens: null });
  return withMolecule(createDocument(), m);
}

function docWithBond(): Document {
  let m = emptyMolecule();
  m = addAtom(m, { id: 1, element: 'C', pos: vec(0, 0), charge: 0, hydrogens: null });
  m = addAtom(m, { id: 2, element: 'C', pos: vec(14.4, 0), charge: 0, hydrogens: null });
  m = addBond(m, { id: 10, a: 1, b: 2, order: 1, stereo: 'none' });
  return withMolecule(createDocument(), m);
}

const orders = (d: Document) => [...d.molecules[0].bonds.values()].map((b) => b.order).sort();

describe('RingTool placement', () => {
  test('hover empty space + 6 → a benzene: 6 atoms, 6 bonds, 3 double', () => {
    const { ctx, state } = makeCtx(createDocument());
    const tool = new RingTool();
    tool.onHover(at(50, 50), ctx);
    expect(tool.onKey('6', ctx)).toBe(true);

    expect(state.doc.molecules).toHaveLength(1);
    const mol = state.doc.molecules[0];
    expect(mol.atoms.size).toBe(6);
    expect(mol.bonds.size).toBe(6);
    const o = orders(state.doc);
    expect(o.filter((x) => x === 2).length).toBe(3);
    expect(o.filter((x) => x === 1).length).toBe(3);
  });

  test('hover an atom + 6 → ring attached at the atom (anchor reused)', () => {
    const { ctx, state } = makeCtx(docWithOneAtom());
    const tool = new RingTool();
    tool.onHover(at(0, 0), ctx);
    tool.onKey('6', ctx);

    const mol = state.doc.molecules[0];
    expect(mol.atoms.size).toBe(6); // 1 existing anchor + 5 new
    expect(mol.atoms.has(1)).toBe(true);
    expect(mol.bonds.size).toBe(6);
  });

  test('hover a bond + 6 → ring fused on the bond (shared edge reused)', () => {
    const { ctx, state } = makeCtx(docWithBond());
    const tool = new RingTool();
    tool.onHover(at(7.2, 0.5), ctx);
    tool.onKey('6', ctx);

    const mol = state.doc.molecules[0];
    expect(mol.atoms.size).toBe(6); // 2 existing + 4 new
    expect(mol.bonds.size).toBe(6); // 1 existing shared + 5 new
  });

  test('pressing 5 makes a 5-ring with all single bonds', () => {
    const { ctx, state } = makeCtx(createDocument());
    const tool = new RingTool();
    tool.onHover(at(50, 50), ctx);
    tool.onKey('5', ctx);

    const mol = state.doc.molecules[0];
    expect(mol.atoms.size).toBe(5);
    expect(mol.bonds.size).toBe(5);
    expect([...mol.bonds.values()].every((b) => b.order === 1)).toBe(true);
  });

  test('non-digit keys are not handled; 1/2 are consumed but place nothing', () => {
    const { ctx, state } = makeCtx(createDocument());
    const tool = new RingTool();
    expect(tool.onKey('x', ctx)).toBe(false);
    const before = state.doc.molecules.length;
    expect(tool.onKey('1', ctx)).toBe(true);
    expect(state.doc.molecules.length).toBe(before);
  });

  test('the hover preview draws one snap-guide per ring edge', () => {
    const { ctx, state } = makeCtx(createDocument());
    const tool = new RingTool();
    tool.onHover(at(50, 50), ctx);
    const last = state.decorations.at(-1)!;
    expect(last.filter((d) => d.type === 'snap-guide')).toHaveLength(6);
  });
});
