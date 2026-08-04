import { vec } from './core/geometry/vec2';
import { createDocument, withMolecule, allocId, type Document } from './core/model/document';
import { emptyMolecule, addAtom, addBond, type Molecule, type BondOrder, type BondStereo } from './core/model/molecule';
import { Editor } from './editor';
import { BondTool } from './interaction/tools/bond';
import { ChainTool } from './interaction/tools/chain';
import { SelectTool } from './interaction/tools/select';
import { hillFormula, molecularWeight, formulaText } from './core/chem/formula';

/** Benzene ring (kekulé), centered at (cx, cy). */
function benzene(doc: Document, cx: number, cy: number): Document {
  let m: Molecule = emptyMolecule();
  const ids: number[] = [];
  const r = 14.4; // hexagon side == circumradius
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (90 + i * 60);
    const res = allocId(doc);
    doc = res.doc;
    ids.push(res.id);
    m = addAtom(m, {
      id: res.id, element: 'C',
      pos: vec(cx + r * Math.cos(a), cy + r * Math.sin(a)),
      charge: 0, hydrogens: null,
    });
  }
  for (let i = 0; i < 6; i++) {
    const res = allocId(doc);
    doc = res.doc;
    m = addBond(m, {
      id: res.id, a: ids[i], b: ids[(i + 1) % 6],
      order: (i % 2 === 0 ? 2 : 1) as BondOrder, stereo: 'none' as BondStereo,
    });
  }
  return withMolecule(doc, m);
}

/** A small showcase: O hetero-labels, a double bond, a triple bond, a wedge. */
function showcase(doc: Document, ox: number, oy: number): Document {
  let m: Molecule = emptyMolecule();
  const put = (element: string, x: number, y: number, charge = 0) => {
    const res = allocId(doc);
    doc = res.doc;
    m = addAtom(m, { id: res.id, element, pos: vec(ox + x, oy + y), charge, hydrogens: null });
    return res.id;
  };
  const bond = (a: number, b: number, order: BondOrder, stereo: BondStereo = 'none') => {
    const res = allocId(doc);
    doc = res.doc;
    m = addBond(m, { id: res.id, a, b, order, stereo });
  };
  // CH3–COOH fragment, trigonal 120° at the carbonyl carbon
  const c1 = put('C', 0, 0);
  const c2 = put('C', 14.4, 0);
  const o1 = put('O', 14.4 + 14.4 * Math.cos(-Math.PI / 3), 14.4 * Math.sin(-Math.PI / 3));
  const o2 = put('O', 14.4 + 14.4 * Math.cos(Math.PI / 3), 14.4 * Math.sin(Math.PI / 3));
  bond(c1, c2, 1);
  bond(c2, o1, 2);
  bond(c2, o2, 1);
  // acetonitrile: CH3–C≡N
  const c3 = put('C', 0, 34);
  const c4 = put('C', 14.4, 34);
  const n1 = put('N', 28.8, 34);
  bond(c3, c4, 1);
  bond(c4, n1, 3);
  return withMolecule(doc, m);
}

let doc = createDocument();
doc = benzene(doc, -40, 0);
doc = showcase(doc, 20, -10);

const mount = document.getElementById('canvas-host')!;
const undoBtn = document.getElementById('undo') as HTMLButtonElement;
const redoBtn = document.getElementById('redo') as HTMLButtonElement;
const statusline = document.getElementById('statusline')!;

const editor = new Editor(mount, {
  document: doc,
  onHistoryChange: (canUndo, canRedo) => {
    undoBtn.disabled = !canUndo;
    redoBtn.disabled = !canRedo;
  },
  onDocumentChange: (doc) => {
    const counts = hillFormula(doc);
    statusline.textContent = counts.size === 0
      ? 'draw: drag to bond · click a bond to cycle order · type an element over an atom'
      : `${formulaText(counts)} · ${molecularWeight(counts).toFixed(2)} g/mol`;
  },
});

undoBtn.addEventListener('click', () => editor.undo());
redoBtn.addEventListener('click', () => editor.redo());

const bondToolBtn = document.getElementById('tool-bond') as HTMLButtonElement;
const chainToolBtn = document.getElementById('tool-chain') as HTMLButtonElement;
const selectToolBtn = document.getElementById('tool-select') as HTMLButtonElement;

function selectTool(which: 'bond' | 'chain' | 'select') {
  editor.setTool(
    which === 'bond' ? new BondTool() : which === 'chain' ? new ChainTool() : new SelectTool());
  bondToolBtn.classList.toggle('active', which === 'bond');
  chainToolBtn.classList.toggle('active', which === 'chain');
  selectToolBtn.classList.toggle('active', which === 'select');
}
bondToolBtn.addEventListener('click', () => selectTool('bond'));
chainToolBtn.addEventListener('click', () => selectTool('chain'));
selectToolBtn.addEventListener('click', () => selectTool('select'));

// debug/e2e hook
(window as unknown as { editor: Editor }).editor = editor;
