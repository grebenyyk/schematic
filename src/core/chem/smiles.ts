import { vec } from '../geometry/vec2';
import { addAtom, addBond, emptyMolecule, type Atom, type Molecule, type BondOrder } from '../model/molecule';

const ORGANIC = new Set(['B', 'C', 'N', 'O', 'P', 'S', 'F', 'I']);
const AROMATIC_ORGANIC = new Set(['b', 'c', 'n', 'o', 'p', 's']);
const isDigit = (c: string | undefined): c is string => !!c && c >= '0' && c <= '9';

/** A bond order, with 'aromatic' kept distinct until kekulization. */
type Order = BondOrder | 'aromatic';

interface PendingAtom {
  element: string;
  charge: number;
  hydrogens: number | null;
  isotope: number | undefined;
  aromatic: boolean;
}

/** An organic-subset atom (outside brackets): no charge, H derived, no isotope. */
const organic = (element: string, aromatic: boolean): PendingAtom => ({
  element, charge: 0, hydrogens: null, isotope: undefined, aromatic,
});

/**
 * Parse a SMILES string into one Molecule per '.'-separated fragment. Atom
 * positions are left at the origin for the layouter. Aromatic systems are
 * kekulized to alternating single/double bonds. v1 subset (no E/Z, no chirality):
 * organic subset + bracket atoms, bonds -=#:, branches, ring closures 1–9 / %nn.
 */
export function parseSmiles(smiles: string): Molecule[] {
  return smiles
    .split('.')
    .map(parseFragment)
    .filter((m): m is Molecule => m !== null);
}

function parseFragment(src: string): Molecule | null {
  if (src.length === 0) return null;
  let mol = emptyMolecule();
  const aromatic = new Set<number>();
  let prev: number | null = null;
  let pending: Order | null = null;
  const branch: (number | null)[] = [];
  const ring = new Map<number, { atom: number; order: Order | null }>();
  let nextId = 0;
  let nextBond = 0;

  const def = (a: number, b: number): Order =>
    aromatic.has(a) && aromatic.has(b) ? 'aromatic' : 1;
  const formBond = (a: number, b: number, order: Order) => {
    mol = addBond(mol, { id: ++nextBond, a, b, order, stereo: 'none' });
  };
  const addNode = (p: PendingAtom) => {
    const id = ++nextId;
    const atom: Atom = {
      id, element: p.element, charge: p.charge, hydrogens: p.hydrogens, pos: vec(0, 0),
    };
    if (p.isotope !== undefined) atom.isotope = p.isotope;
    mol = addAtom(mol, atom);
    if (p.aromatic) aromatic.add(id);
    if (prev !== null) formBond(prev, id, pending ?? def(prev, id));
    prev = id;
    pending = null;
  };
  const handleRing = (digit: number) => {
    if (prev === null) return;
    if (ring.has(digit)) {
      const e = ring.get(digit)!;
      ring.delete(digit);
      formBond(e.atom, prev, pending ?? e.order ?? def(e.atom, prev));
    } else {
      ring.set(digit, { atom: prev, order: pending });
    }
    pending = null;
  };

  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '[') {
      const close = src.indexOf(']', i);
      if (close === -1) break;
      addNode(parseBracket(src.slice(i + 1, close)));
      i = close + 1;
    } else if (c === 'C' && src[i + 1] === 'l') {
      addNode(organic('Cl', false)); i += 2;
    } else if (c === 'B' && src[i + 1] === 'r') {
      addNode(organic('Br', false)); i += 2;
    } else if (ORGANIC.has(c)) {
      addNode(organic(c, false)); i += 1;
    } else if (AROMATIC_ORGANIC.has(c)) {
      addNode(organic(c.toUpperCase(), true)); i += 1;
    } else if (c === '=') { pending = 2; i++; }
    else if (c === '#') { pending = 3; i++; }
    else if (c === ':') { pending = 'aromatic'; i++; }
    else if (c === '-' || c === '/' || c === '\\') { pending = 1; i++; }
    else if (c === '(') { branch.push(prev); i++; }
    else if (c === ')') { prev = branch.pop() ?? prev; i++; }
    else if (isDigit(c)) { handleRing(Number(c)); i++; }
    else if (c === '%') { handleRing(Number(src.slice(i + 1, i + 3))); i += 3; }
    else { i++; } // skip @, etc.
  }

  kekulize(mol, aromatic);
  return mol;
}

/** Parse a bracket atom `[isotope?element@?H?charge?:class?]`. */
function parseBracket(content: string): PendingAtom {
  let i = 0;
  let isotope: number | undefined;
  let iso = '';
  while (isDigit(content[i])) iso += content[i++];
  if (iso) isotope = Number(iso);

  let element = '';
  let aromatic = false;
  const ch = content[i] ?? '';
  if (ch >= 'a' && ch <= 'z') {
    aromatic = true;
    element = ch.toUpperCase(); i++;
    if (content[i] >= 'a' && content[i] <= 'z') element += content[i++];
  } else if (ch >= 'A' && ch <= 'Z') {
    element = ch; i++;
    if (content[i] >= 'a' && content[i] <= 'z') element += content[i++];
  }

  while (content[i] === '@') i++; // chirality, ignored

  let hcount = 0;
  if (content[i] === 'H') {
    i++;
    let d = '';
    while (isDigit(content[i])) d += content[i++];
    hcount = d ? Number(d) : 1;
  }

  let charge = 0;
  while (content[i] === '+' || content[i] === '-') {
    const sign = content[i++] === '+' ? 1 : -1;
    let d = '';
    while (isDigit(content[i])) d += content[i++];
    charge += sign * (d ? Number(d) : 1);
  }

  return { element: element || 'C', charge, hydrogens: hcount, isotope, aromatic };
}

/**
 * Convert aromatic bonds to alternating single/double so a benzene ring renders
 * with three double bonds. Assigns exactly one double per aromatic atom
 * (backtracking Kekulé); systems that can't alternate (e.g. 5-membered NH rings)
 * fall back to all-single. Mutates the freshly parsed molecule in place.
 */
function kekulize(mol: Molecule, aromatic: Set<number>): void {
  if (aromatic.size === 0) return;
  const aromBonds = [...mol.bonds.values()].filter((b) => b.order === 'aromatic');
  if (aromBonds.length === 0) return;

  const incident = new Map<number, number[]>();
  for (const b of aromBonds) {
    (incident.get(b.a) ?? incident.set(b.a, []).get(b.a)!).push(b.id);
    (incident.get(b.b) ?? incident.set(b.b, []).get(b.b)!).push(b.id);
  }
  const atoms = [...aromatic];
  const doubleFor = new Map<number, number>(); // atomId → its double-bond id

  const tryAssign = (idx: number): boolean => {
    if (idx >= atoms.length) return true;
    const a = atoms[idx];
    if (doubleFor.has(a)) return tryAssign(idx + 1);
    for (const bid of incident.get(a) ?? []) {
      const b = mol.bonds.get(bid)!;
      const other = b.a === a ? b.b : b.a;
      if (doubleFor.has(other)) continue;
      doubleFor.set(a, bid);
      doubleFor.set(other, bid);
      if (tryAssign(idx + 1)) return true;
      doubleFor.delete(a);
      doubleFor.delete(other);
    }
    return false;
  };

  const ok = tryAssign(0);
  for (const b of aromBonds) {
    b.order = (ok && doubleFor.get(b.a) === b.id ? 2 : 1) as BondOrder;
  }
}
