import { describe, test, expect } from 'vitest';
import { vec, angle, dist, sub } from '../../src/core/geometry/vec2';
import { ACS1996 } from '../../src/core/style/presets';
import { createDocument, withMolecule, findAtom, findBond, allBonds } from '../../src/core/model/document';
import type { Document } from '../../src/core/model/document';
import { emptyMolecule, addAtom, addBond } from '../../src/core/model/molecule';
import type { Command } from '../../src/core/commands/command';
import { BondTool } from '../../src/interaction/tools/bond';
import type { ToolContext, PointerInfo } from '../../src/interaction/tools';
import type { Decoration } from '../../src/render/decorators';

/** Fake context: applies commits to a real document, records decorations. */
function makeCtx(initial: Document) {
  const state = {
    doc: initial,
    nextId: 1000,
    decorations: [] as Decoration[][],
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
  };
  return { ctx, state };
}

const at = (x: number, y: number, alt = false): PointerInfo => ({ pos: vec(x, y), alt, shift: false });

function docWithBond() {
  let m = emptyMolecule();
  m = addAtom(m, { id: 1, element: 'C', pos: vec(0, 0), charge: 0, hydrogens: null });
  m = addAtom(m, { id: 2, element: 'C', pos: vec(14.4, 0), charge: 0, hydrogens: null });
  m = addBond(m, { id: 10, a: 1, b: 2, order: 1, stereo: 'none' });
  return withMolecule(createDocument(), m);
}

describe('BondTool drag from empty space', () => {
  test('creates a snapped two-atom molecule in one compound command', () => {
    const { ctx, state } = makeCtx(createDocument());
    const tool = new BondTool();
    tool.onDown(at(50, 50), ctx);
    tool.onMove(at(64.2, 50.4), ctx);
    tool.onUp(at(64.2, 50.4), ctx);

    expect(state.doc.molecules).toHaveLength(1);
    const mol = state.doc.molecules[0];
    expect(mol.atoms.size).toBe(2);
    expect(mol.bonds.size).toBe(1);
    const [a, b] = [...mol.atoms.values()];
    expect(dist(a.pos, b.pos)).toBeCloseTo(ACS1996.bondLengthPt);
    const deg = (angle(sub(b.pos, a.pos)) * 180) / Math.PI;
    expect(Math.round(deg / 15) * 15).toBeCloseTo(deg, 5);
  });

  test('alt disables angle snapping', () => {
    const { ctx, state } = makeCtx(createDocument());
    const tool = new BondTool();
    tool.onDown(at(50, 50), ctx);
    tool.onMove(at(62, 57, true), ctx);
    tool.onUp(at(62, 57, true), ctx);
    const [a, b] = [...state.doc.molecules[0].atoms.values()];
    const deg = (angle(sub(b.pos, a.pos)) * 180) / Math.PI;
    expect(Math.abs(deg - 30)).toBeGreaterThan(0.1); // 30.26°, not snapped to 30
    expect(deg).toBeCloseTo(30.26, 1);
  });

  test('shows a snap guide while dragging', () => {
    const { ctx, state } = makeCtx(createDocument());
    const tool = new BondTool();
    tool.onDown(at(50, 50), ctx);
    tool.onMove(at(64, 50), ctx);
    expect(state.decorations.at(-1)?.some((d) => d.type === 'snap-guide')).toBe(true);
  });
});

describe('BondTool drag from an atom', () => {
  test('extends the molecule with one new atom and bond', () => {
    const { ctx, state } = makeCtx(docWithBond());
    const tool = new BondTool();
    tool.onDown(at(0.5, 0.5), ctx); // on atom 1
    tool.onMove(at(-13, 6), ctx);
    tool.onUp(at(-13, 6), ctx);
    expect(state.doc.molecules).toHaveLength(1);
    expect(state.doc.molecules[0].atoms.size).toBe(3);
    expect(state.doc.molecules[0].bonds.size).toBe(2);
  });
});

describe('BondTool merge onto existing atom', () => {
  test('drag end near an atom bonds to it instead of placing a new atom', () => {
    const { ctx, state } = makeCtx(docWithBond());
    const tool = new BondTool();
    tool.onDown(at(30, 30), ctx);
    tool.onMove(at(14.9, 0.6), ctx); // near atom 2
    tool.onUp(at(14.9, 0.6), ctx);
    expect(state.doc.molecules).toHaveLength(1); // merged
    expect(state.doc.molecules[0].atoms.size).toBe(3); // 2 old + 1 new
    expect(state.doc.molecules[0].bonds.size).toBe(2);
  });

  test('highlighting the merge target while hovering the drag end', () => {
    const { ctx, state } = makeCtx(docWithBond());
    const tool = new BondTool();
    tool.onDown(at(30, 30), ctx);
    tool.onMove(at(14.9, 0.6), ctx);
    expect(state.decorations.at(-1)?.some((d) => d.type === 'hover-atom')).toBe(true);
  });

  test('drag between atoms of two molecules merges them, undoably', () => {
    let doc = docWithBond();
    let m2 = emptyMolecule();
    m2 = addAtom(m2, { id: 21, element: 'O', pos: vec(0, 40), charge: 0, hydrogens: null });
    m2 = addAtom(m2, { id: 22, element: 'C', pos: vec(14.4, 40), charge: 0, hydrogens: null });
    m2 = addBond(m2, { id: 20, a: 21, b: 22, order: 1, stereo: 'none' });
    doc = withMolecule(doc, m2);

    const { ctx, state } = makeCtx(doc);
    const tool = new BondTool();
    tool.onDown(at(0.3, 0.2), ctx);       // atom 1 (molecule 0)
    tool.onMove(at(0.2, 40.3), ctx);      // near atom 21 (molecule 1)
    tool.onUp(at(0.2, 40.3), ctx);

    expect(state.doc.molecules).toHaveLength(1);
    expect(state.doc.molecules[0].atoms.size).toBe(4);
    expect(state.doc.molecules[0].bonds.size).toBe(3);
  });
});

describe('BondTool click on an atom', () => {
  test('adds a methyl group at 120° to the existing bond', () => {
    const { ctx, state } = makeCtx(docWithBond());
    const tool = new BondTool();
    tool.onDown(at(14.3, 0.3), ctx); // click atom 2
    tool.onUp(at(14.3, 0.3), ctx);
    const mol = state.doc.molecules[0];
    expect(mol.atoms.size).toBe(3);
    expect(mol.bonds.size).toBe(2);
    const added = [...mol.atoms.values()].find((a) => a.id !== 1 && a.id !== 2)!;
    expect(added.element).toBe('C');
    const atom2 = mol.atoms.get(2)!;
    expect(dist(added.pos, atom2.pos)).toBeCloseTo(ACS1996.bondLengthPt);
    // 120° to the existing bond (which points west from atom 2): 60° or 300°
    const d = ((angle(sub(added.pos, atom2.pos)) * 180) / Math.PI + 360) % 360;
    expect([60, 300].some((x) => Math.abs(d - x) < 1e-6)).toBe(true);
  });

  test('click with an atom at the landing spot closes onto it instead of stacking', () => {
    // atom 1 has two bonds fanning left; the max-clearance direction points
    // east, exactly where atom 2 sits (one bond length away, unbonded)
    let m = emptyMolecule();
    m = addAtom(m, { id: 1, element: 'C', pos: vec(0, 0), charge: 0, hydrogens: null });
    m = addAtom(m, { id: 9, element: 'C', pos: vec(-12.5, -7.2), charge: 0, hydrogens: null });
    m = addAtom(m, { id: 10, element: 'C', pos: vec(-12.5, 7.2), charge: 0, hydrogens: null });
    m = addAtom(m, { id: 2, element: 'C', pos: vec(14.4, 0), charge: 0, hydrogens: null });
    m = addBond(m, { id: 100, a: 1, b: 9, order: 1, stereo: 'none' });
    m = addBond(m, { id: 101, a: 1, b: 10, order: 1, stereo: 'none' });
    const { ctx, state } = makeCtx(withMolecule(createDocument(), m));
    const tool = new BondTool();
    tool.onDown(at(0.2, 0.2), ctx);
    tool.onUp(at(0.2, 0.2), ctx);
    const mol = state.doc.molecules[0];
    expect(mol.atoms.size).toBe(4); // no new atom stacked
    expect(mol.bonds.size).toBe(3); // bonded onto atom 2
    const closed = [...mol.bonds.values()].some(
      (b) => (b.a === 1 && b.b === 2) || (b.a === 2 && b.b === 1));
    expect(closed).toBe(true);
  });

  test('does not add to a valence-saturated atom (C with 4 bonds)', () => {
    let m = emptyMolecule();
    m = addAtom(m, { id: 1, element: 'C', pos: vec(0, 0), charge: 0, hydrogens: null });
    for (let i = 0; i < 4; i++) {
      const a = (Math.PI / 180) * (45 + i * 90);
      m = addAtom(m, { id: 10 + i, element: 'C', pos: vec(14.4 * Math.cos(a), 14.4 * Math.sin(a)), charge: 0, hydrogens: null });
      m = addBond(m, { id: 100 + i, a: 1, b: 10 + i, order: 1, stereo: 'none' });
    }
    const { ctx, state } = makeCtx(withMolecule(createDocument(), m));
    const tool = new BondTool();
    tool.onDown(at(0.3, 0.3), ctx);
    tool.onUp(at(0.3, 0.3), ctx);
    expect(state.doc.molecules[0].atoms.size).toBe(5); // unchanged
    expect(state.doc.molecules[0].bonds.size).toBe(4);
  });

  test('click on trimethylamine N adds a methyl AND a + charge (ammonium)', () => {
    let m = emptyMolecule();
    m = addAtom(m, { id: 1, element: 'N', pos: vec(0, 0), charge: 0, hydrogens: null });
    for (let i = 0; i < 3; i++) {
      const a = (Math.PI / 180) * (30 + i * 120);
      m = addAtom(m, { id: 10 + i, element: 'C', pos: vec(14.4 * Math.cos(a), 14.4 * Math.sin(a)), charge: 0, hydrogens: null });
      m = addBond(m, { id: 100 + i, a: 1, b: 10 + i, order: 1, stereo: 'none' });
    }
    const { ctx, state } = makeCtx(withMolecule(createDocument(), m));
    const tool = new BondTool();
    tool.onDown(at(0.3, 0.3), ctx);
    tool.onUp(at(0.3, 0.3), ctx);
    const n = state.doc.molecules[0].atoms.get(1)!;
    expect(state.doc.molecules[0].atoms.size).toBe(5);
    expect(state.doc.molecules[0].bonds.size).toBe(4);
    expect(n.charge).toBe(1);
  });

  test('does not add beyond the onium cap ([NMe4]+ is the limit)', () => {
    let m = emptyMolecule();
    m = addAtom(m, { id: 1, element: 'N', pos: vec(0, 0), charge: 1, hydrogens: null });
    for (let i = 0; i < 4; i++) {
      const a = (Math.PI / 180) * (45 + i * 90);
      m = addAtom(m, { id: 10 + i, element: 'C', pos: vec(14.4 * Math.cos(a), 14.4 * Math.sin(a)), charge: 0, hydrogens: null });
      m = addBond(m, { id: 100 + i, a: 1, b: 10 + i, order: 1, stereo: 'none' });
    }
    const { ctx, state } = makeCtx(withMolecule(createDocument(), m));
    const tool = new BondTool();
    tool.onDown(at(0.3, 0.3), ctx);
    tool.onUp(at(0.3, 0.3), ctx);
    expect(state.doc.molecules[0].atoms.size).toBe(5); // unchanged
    expect(state.doc.molecules[0].atoms.get(1)!.charge).toBe(1);
  });

  test('adds to an atom with remaining valence (C with 3 bonds)', () => {
    let m = emptyMolecule();
    m = addAtom(m, { id: 1, element: 'C', pos: vec(0, 0), charge: 0, hydrogens: null });
    for (let i = 0; i < 3; i++) {
      const a = (Math.PI / 180) * (30 + i * 120);
      m = addAtom(m, { id: 10 + i, element: 'C', pos: vec(14.4 * Math.cos(a), 14.4 * Math.sin(a)), charge: 0, hydrogens: null });
      m = addBond(m, { id: 100 + i, a: 1, b: 10 + i, order: 1, stereo: 'none' });
    }
    const { ctx, state } = makeCtx(withMolecule(createDocument(), m));
    const tool = new BondTool();
    tool.onDown(at(0.3, 0.3), ctx);
    tool.onUp(at(0.3, 0.3), ctx);
    expect(state.doc.molecules[0].atoms.size).toBe(5);
    expect(state.doc.molecules[0].bonds.size).toBe(4);
  });

  test('repeated clicks extend a zigzag chain, undoably per click', () => {
    const { ctx, state } = makeCtx(docWithBond());
    const tool = new BondTool();
    tool.onDown(at(14.3, 0.3), ctx);
    tool.onUp(at(14.3, 0.3), ctx);
    const first = [...state.doc.molecules[0].atoms.values()].find((a) => a.id >= 1000)!;
    // click the newly added atom
    tool.onDown(at(first.pos.x + 0.2, first.pos.y + 0.2), ctx);
    tool.onUp(at(first.pos.x + 0.2, first.pos.y + 0.2), ctx);
    const mol = state.doc.molecules[0];
    expect(mol.atoms.size).toBe(4);
    expect(mol.bonds.size).toBe(3);
    // zigzag: the two new bonds are not collinear with the first bond
    const atoms = [...mol.atoms.values()];
    const newest = atoms.find((a) => a.id > first.id)!;
    const dirNew = angle(sub(newest.pos, first.pos));
    const dirFirst = angle(sub(first.pos, mol.atoms.get(2)!.pos));
    expect(Math.abs(dirNew - dirFirst)).toBeGreaterThan(0.5);
  });
});

describe('BondTool click cycling', () => {
  test('click on a bond cycles order 1→2→3→1', () => {
    const { ctx, state } = makeCtx(docWithBond());
    const tool = new BondTool();
    const clickOnBond = () => {
      tool.onDown(at(7.2, 0.5), ctx);
      tool.onUp(at(7.2, 0.5), ctx);
    };
    clickOnBond();
    expect(findBond(state.doc, 10)?.bond.order).toBe(2);
    clickOnBond();
    expect(findBond(state.doc, 10)?.bond.order).toBe(3);
    clickOnBond();
    expect(findBond(state.doc, 10)?.bond.order).toBe(1);
  });

  test('cycling skips orders that would exceed valence (isobutene)', () => {
    // CH2=C(CH3)2: clicking the double bond skips 3 (pentavalent C) → wraps to 1
    let m = emptyMolecule();
    m = addAtom(m, { id: 1, element: 'C', pos: vec(0, 0), charge: 0, hydrogens: null });
    m = addAtom(m, { id: 2, element: 'C', pos: vec(14.4, 0), charge: 0, hydrogens: null });
    m = addAtom(m, { id: 3, element: 'C', pos: vec(21.6, 12.5), charge: 0, hydrogens: null });
    m = addAtom(m, { id: 4, element: 'C', pos: vec(21.6, -12.5), charge: 0, hydrogens: null });
    m = addBond(m, { id: 10, a: 1, b: 2, order: 2, stereo: 'none' });
    m = addBond(m, { id: 11, a: 2, b: 3, order: 1, stereo: 'none' });
    m = addBond(m, { id: 12, a: 2, b: 4, order: 1, stereo: 'none' });
    const { ctx, state } = makeCtx(withMolecule(createDocument(), m));
    const tool = new BondTool();
    const click = () => { tool.onDown(at(7.2, 0.4), ctx); tool.onUp(at(7.2, 0.4), ctx); };
    click();
    expect(findBond(state.doc, 10)?.bond.order).toBe(1); // 2 →(skip 3)→ 1
    click();
    expect(findBond(state.doc, 10)?.bond.order).toBe(2); // 1 → 2 is fine
    click();
    expect(findBond(state.doc, 10)?.bond.order).toBe(1); // and skips 3 again
  });

  test('click on empty space places a methane (lone carbon)', () => {
    const { ctx, state } = makeCtx(createDocument());
    const tool = new BondTool();
    tool.onDown(at(50, 50), ctx);
    tool.onUp(at(50, 50), ctx);
    expect(state.doc.molecules).toHaveLength(1);
    const mol = state.doc.molecules[0];
    expect(mol.atoms.size).toBe(1);
    expect(mol.bonds.size).toBe(0);
    const atom = [...mol.atoms.values()][0];
    expect(atom.element).toBe('C');
    expect(atom.pos).toEqual({ x: 50, y: 50 });
  });
});

describe('BondTool hover', () => {
  test('hovering an atom or bond shows a highlight', () => {
    const { ctx, state } = makeCtx(docWithBond());
    const tool = new BondTool();
    tool.onHover(at(0.4, 0.4), ctx);
    expect(state.decorations.at(-1)).toEqual([expect.objectContaining({ type: 'hover-atom' })]);
    tool.onHover(at(7.2, 0.6), ctx);
    expect(state.decorations.at(-1)).toEqual([expect.objectContaining({ type: 'hover-bond' })]);
    tool.onHover(at(40, 40), ctx);
    expect(state.decorations.at(-1)).toEqual([]);
  });

  test('bond hover dot sits at the center of the drawn (trimmed) line, not the atom midpoint', () => {
    // C=O bond: the O label (plain 'O', no H) trims the drawn line at the O end
    let m = emptyMolecule();
    m = addAtom(m, { id: 1, element: 'C', pos: vec(0, 0), charge: 0, hydrogens: null });
    m = addAtom(m, { id: 2, element: 'O', pos: vec(14.4, 0), charge: 0, hydrogens: null });
    m = addBond(m, { id: 10, a: 1, b: 2, order: 2, stereo: 'none' });
    const { ctx, state } = makeCtx(withMolecule(createDocument(), m));
    const tool = new BondTool();
    tool.onHover(at(5.5, 0.5), ctx);
    const deco = state.decorations.at(-1)![0];
    expect(deco.type).toBe('hover-bond');
    if (deco.type === 'hover-bond') {
      // trim = label-box half-width (estimate measurer: 0.62 × size) + margin
      const oTrim = (0.62 * ACS1996.labelSizePt) / 2 + ACS1996.marginPt;
      const expectedCenterX = (14.4 - oTrim) / 2; // trimmed axis center, not 7.2
      expect(deco.center.x).toBeCloseTo(expectedCenterX, 5);
      expect(deco.center.x).not.toBeCloseTo(7.2, 1);
    }
  });

  test('ring double bond hover dot sits between the two lines (inside the ring)', () => {
    // benzene
    let m = emptyMolecule();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 180) * (90 + i * 60);
      m = addAtom(m, {
        id: i + 1, element: 'C',
        pos: vec(14.4 * Math.cos(a), 14.4 * Math.sin(a)),
        charge: 0, hydrogens: null,
      });
    }
    for (let i = 0; i < 6; i++) {
      m = addBond(m, {
        id: 10 + i, a: i + 1, b: ((i + 1) % 6) + 1,
        order: i % 2 === 0 ? 2 : 1, stereo: 'none',
      });
    }
    const { ctx, state } = makeCtx(withMolecule(createDocument(), m));
    const tool = new BondTool();
    // hover the midpoint of bond 10 (atoms 1–2, a double bond at the top-left)
    const pa = m.atoms.get(1)!.pos, pb = m.atoms.get(2)!.pos;
    const mid = vec((pa.x + pb.x) / 2, (pa.y + pb.y) / 2);
    tool.onHover(at(mid.x, mid.y), ctx);
    const deco = state.decorations.at(-1)![0];
    expect(deco.type).toBe('hover-bond');
    if (deco.type === 'hover-bond') {
      // dot must be between the on-axis line and the inner line:
      // half the double-bond gap inside the ring (toward the center)
      const halfGap = (ACS1996.doubleBondSpacing * ACS1996.bondLengthPt) / 2;
      expect(dist(deco.center, vec(0, 0))).toBeCloseTo(dist(mid, vec(0, 0)) - halfGap, 4);
    }
  });

  test('existing atoms/bonds are untouched by hover', () => {
    const { ctx, state } = makeCtx(docWithBond());
    const tool = new BondTool();
    tool.onHover(at(0.4, 0.4), ctx);
    expect([...allBonds(state.doc)]).toHaveLength(1);
    expect(findAtom(state.doc, 1)).not.toBeNull();
  });
});
