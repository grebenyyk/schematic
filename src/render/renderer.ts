import type { Document as MolDocument } from '../core/model/document';
import { allAtoms } from '../core/model/document';
import { bondsOf, type Bond, type Molecule } from '../core/model/molecule';
import { ringPath } from '../core/model/rings';
import { norm, sub, type Vec2 } from '../core/geometry/vec2';
import type { StyleSheet } from '../core/style/stylesheet';
import { bondAxis, renderBond, singleBondJunctionSetback, type BondAxis } from './bonds';
import { hasVisibleLabel, renderLabel } from './labels';
import { renderDecorations, type Decoration } from './decorators';

const SVG_NS = 'http://www.w3.org/2000/svg';

function layer(dom: Document, svg: SVGSVGElement, cls: string): SVGGElement {
  const g = dom.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', cls);
  svg.appendChild(g);
  return g;
}

/** How much to shorten a bond endpoint: clearance where a label sits. */
function trimFor(labeled: boolean, style: StyleSheet): number {
  return labeled ? style.marginPt + style.labelSizePt * 0.35 : 0;
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

/**
 * How far short of a degree-2 junction with an acyclic double bond this
 * single bond should stop at the given endpoint, so its end meets the
 * nearer double line (the gapless bend). At sp2 junctions (two single
 * bonds + a double bond) there is no setback — everything converges at
 * the vertex instead.
 */
function junctionSetback(mol: Molecule, bond: Bond, atomId: number, style: StyleSheet): number {
  if (bond.order !== 1) return 0;
  const incident = [...bondsOf(mol, atomId)];
  if (incident.length !== 2) return 0;
  const halfGap = (style.doubleBondSpacing * style.bondLengthPt) / 2;
  const otherId = bond.a === atomId ? bond.b : bond.a;
  const u = norm(sub(mol.atoms.get(otherId)!.pos, mol.atoms.get(atomId)!.pos));
  let setback = 0;
  for (const bondId of incident) {
    if (bondId === bond.id) continue;
    const d = mol.bonds.get(bondId)!;
    if (d.order !== 2 || ringPath(mol, d.id) !== null) continue;
    const dOtherId = d.a === atomId ? d.b : d.a;
    const dDir = norm(sub(mol.atoms.get(dOtherId)!.pos, mol.atoms.get(atomId)!.pos));
    const s = singleBondJunctionSetback(u, dDir, halfGap);
    if (s !== null && s > setback) setback = s;
  }
  return setback;
}

function updateViewBox(svg: SVGSVGElement, doc: MolDocument, style: StyleSheet): void {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const a of allAtoms(doc)) {
    minX = Math.min(minX, a.pos.x); maxX = Math.max(maxX, a.pos.x);
    minY = Math.min(minY, a.pos.y); maxY = Math.max(maxY, a.pos.y);
  }
  if (!isFinite(minX)) {
    svg.setAttribute('viewBox', '0 0 100 100');
    return;
  }
  const pad = style.bondLengthPt * 1.5;
  svg.setAttribute(
    'viewBox',
    `${minX - pad} ${minY - pad} ${maxX - minX + 2 * pad} ${maxY - minY + 2 * pad}`,
  );
}

/**
 * The axis a bond is actually drawn along: trimmed by label clearance and
 * junction setbacks at both ends. Shared by the renderer and anything that
 * needs to know where the *drawn* line sits (e.g. hover highlights).
 */
export function bondRenderAxis(mol: Molecule, bond: Bond, style: StyleSheet): BondAxis {
  const a = mol.atoms.get(bond.a)!;
  const b = mol.atoms.get(bond.b)!;
  const fullLen = Math.hypot(b.pos.x - a.pos.x, b.pos.y - a.pos.y);
  const trimEnd = (atomId: number) => {
    const atom = mol.atoms.get(atomId)!;
    const degree = [...bondsOf(mol, atomId)].length;
    return Math.min(
      Math.max(
        trimFor(hasVisibleLabel(atom, degree), style),
        junctionSetback(mol, bond, atomId, style),
      ),
      fullLen / 2,
    );
  };
  return bondAxis(a.pos, b.pos, trimEnd(bond.a), trimEnd(bond.b));
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
): void {
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  const bondsG = layer(dom, svg, 'bonds');
  const labelsG = layer(dom, svg, 'labels');
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
      if (labeled.get(atom.id)) renderLabel(dom, labelsG, atom, style);
    }
  }

  renderDecorations(dom, decoratorsG, decorations, style);
  updateViewBox(svg, doc, style);
}
