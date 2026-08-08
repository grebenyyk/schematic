import { describe, test, expect } from 'vitest';
import { parseSmiles } from '../../../src/core/chem/smiles';
import { layoutMolecule } from '../../../src/core/chem/layout';
import { ACS1996 } from '../../../src/core/style/presets';
import { dist, type Vec2 } from '../../../src/core/geometry/vec2';

const L = ACS1996.bondLengthPt;

const laid = (smi: string) => {
  const [m] = parseSmiles(smi);
  layoutMolecule(m!, L);
  return m!;
};
const positions = (m: ReturnType<typeof laid>): Vec2[] =>
  [...m.atoms.values()].map((a) => a.pos);

const noOverlaps = (m: ReturnType<typeof laid>) => {
  const pos = positions(m);
  for (let i = 0; i < pos.length; i++) {
    for (let j = i + 1; j < pos.length; j++) {
      expect(dist(pos[i], pos[j])).toBeGreaterThan(1); // atoms must not coincide
    }
  }
};
const bondLengthsOk = (m: ReturnType<typeof laid>) => {
  for (const b of m.bonds.values()) {
    expect(dist(m.atoms.get(b.a)!.pos, m.atoms.get(b.b)!.pos)).toBeCloseTo(L, 3);
  }
};

describe('layoutMolecule', () => {
  test('acyclic: ethanol places 3 distinct atoms, bonds ≈ L', () => {
    const m = laid('CCO');
    expect(m.atoms.size).toBe(3);
    noOverlaps(m);
    bondLengthsOk(m);
  });

  test('benzene: six atoms on a regular hexagon, bonds ≈ L', () => {
    const m = laid('c1ccccc1');
    const pos = positions(m);
    expect(pos).toHaveLength(6);
    noOverlaps(m);
    bondLengthsOk(m);
    // all vertices equidistant from the centroid
    const c = { x: pos.reduce((s, p) => s + p.x, 0) / 6, y: pos.reduce((s, p) => s + p.y, 0) / 6 };
    const R = dist(pos[0], c);
    for (const p of pos) expect(dist(p, c)).toBeCloseTo(R, 3);
  });

  test('cyclohexane and toluene: distinct atoms, bonds ≈ L', () => {
    for (const smi of ['C1CCCCC1', 'Cc1ccccc1']) {
      const m = laid(smi);
      noOverlaps(m);
      bondLengthsOk(m);
    }
  });

  test('acetic acid: distinct atoms, bonds ≈ L', () => {
    const m = laid('CC(=O)O');
    expect(m.atoms.size).toBe(4);
    noOverlaps(m);
    bondLengthsOk(m);
  });

  test('naphthalene: two fused hexagons, 10 distinct atoms, bonds ≈ L', () => {
    const m = laid('c1ccc2ccccc2c1');
    expect(m.atoms.size).toBe(10);
    noOverlaps(m);
    bondLengthsOk(m);
  });
});
