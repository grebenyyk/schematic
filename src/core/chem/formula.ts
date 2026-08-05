import type { Document } from '../model/document';
import { implicitHydrogens } from './valence';

const ATOMIC_WEIGHT: Record<string, number> = {
  H: 1.008, B: 10.81, C: 12.011, N: 14.007, O: 15.999, F: 18.998,
  Si: 28.085, P: 30.974, S: 32.06, Cl: 35.45, Br: 79.904, I: 126.904,
};

const SUBSCRIPT = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];

/**
 * Element → count map, implicit H included. When onlyAtoms is given, counts
 * just those atoms (H still derived from the full bonding context).
 */
export function hillFormula(doc: Document, onlyAtoms?: Set<number>): Map<string, number> {
  const counts = new Map<string, number>();
  const bump = (el: string, n: number) => counts.set(el, (counts.get(el) ?? 0) + n);
  for (const mol of doc.molecules) {
    for (const atom of mol.atoms.values()) {
      if (onlyAtoms && !onlyAtoms.has(atom.id)) continue;
      bump(atom.element, 1);
      const h = implicitHydrogens(mol, atom.id);
      if (h > 0) bump('H', h);
    }
  }
  return counts;
}

export function molecularWeight(counts: Map<string, number>): number {
  let mw = 0;
  for (const [el, n] of counts) mw += (ATOMIC_WEIGHT[el] ?? 0) * n;
  return mw;
}

/** Hill system: C first, then H, then alphabetical; unicode subscripts. */
export function formulaText(counts: Map<string, number>): string {
  const sub = (n: number) => (n === 1 ? '' : String(n).split('').map((d) => SUBSCRIPT[Number(d)]).join(''));
  const parts: string[] = [];
  const order = [...counts.keys()].sort((a, b) => {
    if (a === 'C') return -1;
    if (b === 'C') return 1;
    if (a === 'H' && counts.has('C')) return -1;
    if (b === 'H' && counts.has('C')) return 1;
    return a.localeCompare(b);
  });
  for (const el of order) parts.push(`${el}${sub(counts.get(el)!)}`);
  return parts.join('');
}
