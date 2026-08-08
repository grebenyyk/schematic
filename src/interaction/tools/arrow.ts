import { dist, type Vec2 } from '../../core/geometry/vec2';
import { AddArrow } from '../../core/commands/ops';
import type { PointerInfo, Tool, ToolContext } from '../tools';

const CLICK_THRESHOLD = 2;
const ANGLE_STEP_DEG = 45;
const DEFAULT_LEN_MULT = 3; // a click drops an arrow ~3 bond lengths long
const DEG = Math.PI / 180;

/** Snap the endpoint to the nearest 45° from `from`, preserving distance. */
function snapAngle(from: Vec2, to: Vec2): Vec2 {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const r = Math.hypot(dx, dy);
  const a = Math.round(Math.atan2(dy, dx) / (ANGLE_STEP_DEG * DEG)) * ANGLE_STEP_DEG * DEG;
  return { x: from.x + r * Math.cos(a), y: from.y + r * Math.sin(a) };
}

/**
 * Draw a reaction arrow: drag to rubber-band it (snapped to 45°, Alt = free);
 * a bare click drops a default horizontal arrow.
 */
export class ArrowTool implements Tool {
  private start: Vec2 | null = null;
  private end: Vec2 | null = null;
  private moved = false;

  onDown(e: PointerInfo, _ctx?: ToolContext): void {
    this.start = e.pos;
    this.end = null;
    this.moved = false;
  }

  onMove(e: PointerInfo, ctx: ToolContext): void {
    if (!this.start || dist(this.start, e.pos) < CLICK_THRESHOLD) return;
    this.moved = true;
    this.end = e.alt ? e.pos : snapAngle(this.start, e.pos);
    ctx.setDecorations([{ type: 'arrow', from: this.start, to: this.end }]);
  }

  onUp(_e: PointerInfo, ctx: ToolContext): void {
    if (!this.start) return;
    const to = this.moved && this.end
      ? this.end
      : { x: this.start.x + ctx.style.bondLengthPt * DEFAULT_LEN_MULT, y: this.start.y };
    const [id] = ctx.allocIds(1);
    ctx.commit(new AddArrow({ id, from: this.start, to }));
    ctx.setDecorations([]);
    this.start = null;
    this.end = null;
    this.moved = false;
  }
}
