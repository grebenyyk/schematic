import { AddPlus } from '../../core/commands/ops';
import type { PointerInfo, Tool, ToolContext } from '../tools';

/** Place a plus sign: click drops one at the pointer. */
export class PlusTool implements Tool {
  onUp(e: PointerInfo, ctx: ToolContext): void {
    const [id] = ctx.allocIds(1);
    ctx.commit(new AddPlus({ id, pos: e.pos }));
  }
}
