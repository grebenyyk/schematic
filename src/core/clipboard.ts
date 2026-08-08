import type { BondOrder, BondStereo } from './model/molecule';
import type { Document, Selection } from './model/document';

/** A serialized selection for in-app / cross-tab copy-paste. Positions are absolute. */
export interface SelectionBlob {
  v: 1;
  atoms: { id: number; element: string; charge: number; hydrogens: number | null; isotope?: number; x: number; y: number }[];
  bonds: { id: number; a: number; b: number; order: BondOrder; stereo: BondStereo }[];
  arrows: { id: number; fx: number; fy: number; tx: number; ty: number }[];
  pluses: { id: number; x: number; y: number }[];
}

/**
 * Snapshot the selected atoms (plus their internal bonds), arrows, and pluses.
 * A bond is copied only when both its endpoints are selected, so the copy is a
 * coherent fragment.
 */
export function serializeSelection(doc: Document, sel: Selection): SelectionBlob {
  const out: SelectionBlob = { v: 1, atoms: [], bonds: [], arrows: [], pluses: [] };
  for (const mol of doc.molecules) {
    for (const a of mol.atoms.values()) {
      if (!sel.atoms.has(a.id)) continue;
      const entry: SelectionBlob['atoms'][number] = {
        id: a.id, element: a.element, charge: a.charge,
        hydrogens: a.hydrogens ?? null, x: a.pos.x, y: a.pos.y,
      };
      if (a.isotope !== undefined) entry.isotope = a.isotope;
      out.atoms.push(entry);
    }
    for (const b of mol.bonds.values()) {
      if (sel.atoms.has(b.a) && sel.atoms.has(b.b)) {
        out.bonds.push({ id: b.id, a: b.a, b: b.b, order: b.order, stereo: b.stereo });
      }
    }
  }
  for (const arrow of doc.arrows) {
    if (sel.arrows?.has(arrow.id)) {
      out.arrows.push({ id: arrow.id, fx: arrow.from.x, fy: arrow.from.y, tx: arrow.to.x, ty: arrow.to.y });
    }
  }
  for (const plus of doc.pluses) {
    if (sel.pluses?.has(plus.id)) out.pluses.push({ id: plus.id, x: plus.pos.x, y: plus.pos.y });
  }
  return out;
}

/** Parse a selection blob from JSON; null if malformed. */
export function parseSelectionBlob(text: string): SelectionBlob | null {
  try {
    const o = JSON.parse(text);
    if (!o || !Array.isArray(o.atoms) || !Array.isArray(o.bonds)) return null;
    return o as SelectionBlob;
  } catch {
    return null;
  }
}
