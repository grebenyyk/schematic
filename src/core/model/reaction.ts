import type { Vec2 } from '../geometry/vec2';

/**
 * A free-standing reaction arrow in pt-space. Not metadata binding molecules —
 * it's just a scene element placed between structures (the ChemDraw model).
 * v1 is the simple reaction arrow only.
 */
export interface ReactionArrow {
  id: number;
  from: Vec2;
  to: Vec2;
}

/** A plus sign between molecules (pt-space). */
export interface Plus {
  id: number;
  pos: Vec2;
}
