import type { Document as MolDocument } from '../core/model/document';
import { allAtoms } from '../core/model/document';
import { bondsOf, type Bond, type Molecule } from '../core/model/molecule';
import { ringPath } from '../core/model/rings';
import { add, norm, scale, sub, type Vec2 } from '../core/geometry/vec2';
import type { StyleSheet } from '../core/style/stylesheet';
import { bondAxis, renderBond, ringInwardNormal, type BondAxis } from './bonds';
import { renderArrow, renderPlus } from './arrow';
import { hasVisibleLabel, labelBoxes, rayBoxDistance, renderLabel } from './labels';
import { renderDecorations, type Decoration } from './decorators';
import type { ViewBox } from './viewport';

const SVG_NS = 'http://www.w3.org/2000/svg';

function layer(dom: Document, svg: SVGSVGElement, cls: string): SVGGElement {
  const g = dom.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', cls);
  svg.appendChild(g);
  return g;
}

/** Unit directions of the other bonds leaving an atom (excluding bondId). */
function adjacentDirections(mol: Molecule, bond: Bond, atomId: number): Vec2[] {
  const dirs: Vec2[] = [];
  for (const otherId of bondsOf(mol, atomId)) {
    if (otherId === bond.id) continue;
    const other = mol.bonds.get(otherId)!;
    const neighborId = other.a === atomId ? other.b : other.a;
    dirs.push(norm(sub(mol.atoms.get(neighborId)!.pos, mol.atoms.get(atomId)!.pos)));
  }
  return dirs;
}

/** Content bounds plus padding — the viewBox a fresh camera would use. */
export function contentViewBox(doc: MolDocument, style: StyleSheet): ViewBox {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const a of allAtoms(doc)) {
    minX = Math.min(minX, a.pos.x); maxX = Math.max(maxX, a.pos.x);
    minY = Math.min(minY, a.pos.y); maxY = Math.max(maxY, a.pos.y);
  }
  for (const arrow of doc.arrows) {
    for (const p of [arrow.from, arrow.to]) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
  }
  for (const plus of doc.pluses) {
    minX = Math.min(minX, plus.pos.x); maxX = Math.max(maxX, plus.pos.x);
    minY = Math.min(minY, plus.pos.y); maxY = Math.max(maxY, plus.pos.y);
  }
  if (!isFinite(minX)) return { x: 0, y: 0, width: 100, height: 100 };
  const pad = style.bondLengthPt * 1.5;
  return {
    x: minX - pad,
    y: minY - pad,
    width: maxX - minX + 2 * pad,
    height: maxY - minY + 2 * pad,
  };
}

/**
 * At a degree-2 junction (a single bond meeting an acyclic double bond,
 * e.g. mid-chain C=C), the single bond is set back to where it meets the
 * nearer double line, so the chain reads as one continuous bent stroke.
 * Returns 0 at sp2 junctions, where singles run to the vertex instead.
 */
function junctionSetback(mol: Molecule, bond: Bond, atomId: number, style: StyleSheet): number {
  if (bond.order !== 1) return 0;
  const incident = [...bondsOf(mol, atomId)];
  if (incident.length !== 2) return 0;
  const halfGap = (style.doubleBondSpacing * style.bondLengthPt) / 2;
  const otherId = bond.a === atomId ? bond.b : bond.a;
  const u = norm(sub(mol.atoms.get(otherId)!.pos, mol.atoms.get(atomId)!.pos));
  const dbl = mol.bonds.get(incident.find((id) => id !== bond.id)!)!;
  if (dbl.order !== 2 || ringPath(mol, dbl.id) !== null) return 0;
  const dOtherId = dbl.a === atomId ? dbl.b : dbl.a;
  const dDir = norm(sub(mol.atoms.get(dOtherId)!.pos, mol.atoms.get(atomId)!.pos));
  const sin = Math.abs(u.x * dDir.y - u.y * dDir.x);
  return sin < 1e-9 ? 0 : halfGap / sin;
}

/**
 * The axis a bond is actually drawn along: trimmed by label clearance at
 * both ends. Shared by the renderer and anything that needs to know where
 * the *drawn* line sits (e.g. hover highlights).
 */
export function bondRenderAxis(mol: Molecule, bond: Bond, style: StyleSheet): BondAxis {
  const a = mol.atoms.get(bond.a)!;
  const b = mol.atoms.get(bond.b)!;
  const fullLen = Math.hypot(b.pos.x - a.pos.x, b.pos.y - a.pos.y);
  const trimEnd = (atomId: number) => {
    const atom = mol.atoms.get(atomId)!;
    const degree = [...bondsOf(mol, atomId)].length;
    let trim = junctionSetback(mol, bond, atomId, style);
    if (hasVisibleLabel(atom, degree)) {
      // trim to the label boxes (main text + charge box), plus clearance
      const otherId = bond.a === atomId ? bond.b : bond.a;
      const other = mol.atoms.get(otherId)!;
      const dir = norm(sub(other.pos, atom.pos));
      let exit = Infinity;
      for (const box of labelBoxes(mol, atomId, style)) {
        exit = Math.min(exit, rayBoxDistance(atom.pos, dir, box));
      }
      if (isFinite(exit)) trim = Math.max(trim, Math.max(exit, 0) + style.marginPt);
    }
    return Math.min(trim, fullLen / 2);
  };
  return bondAxis(a.pos, b.pos, trimEnd(bond.a), trimEnd(bond.b));
}

/**
 * Where a bond's highlight dot sits: the midpoint of the drawn (trimmed) axis,
 * nudged half a double-bond gap inside the ring for ring double bonds so the
 * dot lands between the two lines. Shared by bond hover and selection.
 */
export function bondDotCenter(mol: Molecule, bond: Bond, style: StyleSheet): Vec2 {
  const axis = bondRenderAxis(mol, bond, style);
  let center: Vec2 = { x: (axis.a.x + axis.b.x) / 2, y: (axis.a.y + axis.b.y) / 2 };
  if (bond.order === 2) {
    const path = ringPath(mol, bond.id);
    if (path) {
      const inward = ringInwardNormal(axis, path);
      const halfGap = (style.doubleBondSpacing * style.bondLengthPt) / 2;
      center = add(center, scale(inward, halfGap));
    }
  }
  return center;
}

/**
 * Full redraw of a document into an SVG element: layered groups
 * bonds → labels → decorators. Incremental patching comes later,
 * once commands report affected ids.
 */
export function renderDocument(
  dom: Document,
  svg: SVGSVGElement,
  doc: MolDocument,
  style: StyleSheet,
  decorations: Decoration[] = [],
  viewBox?: ViewBox,
): void {
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  const bondsG = layer(dom, svg, 'bonds');
  const labelsG = layer(dom, svg, 'labels');
  const reactionsG = layer(dom, svg, 'reactions');
  const decoratorsG = layer(dom, svg, 'decorators');

  for (const mol of doc.molecules) {
    const labeled = new Map<number, boolean>();
    for (const atom of mol.atoms.values()) {
      const degree = [...bondsOf(mol, atom.id)].length;
      labeled.set(atom.id, hasVisibleLabel(atom, degree));
    }
    for (const bond of mol.bonds.values()) {
      const axis = bondRenderAxis(mol, bond, style);
      const adj = bond.order === 2
        ? {
            a: adjacentDirections(mol, bond, bond.a),
            b: adjacentDirections(mol, bond, bond.b),
          }
        : null;
      renderBond(dom, bondsG, bond, axis, style, bond.order === 2 ? ringPath(mol, bond.id) : null, adj);
    }
    for (const atom of mol.atoms.values()) {
      if (labeled.get(atom.id)) renderLabel(dom, labelsG, mol, atom, style);
    }
  }

  for (const arrow of doc.arrows) renderArrow(dom, reactionsG, arrow, style);
  for (const plus of doc.pluses) renderPlus(dom, reactionsG, plus, style);

  renderDecorations(dom, decoratorsG, decorations, style);
  const vb = viewBox ?? contentViewBox(doc, style);
  svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.width} ${vb.height}`);
}
