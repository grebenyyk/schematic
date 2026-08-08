import type { Tool } from '../tools';

/**
 * The hand tool. Panning and zooming are viewport (not document) operations
 * and are handled at the editor level — where the camera and client
 * coordinates live — so this is a mode marker: when active, a drag pans the
 * camera and the cursor becomes a grab hand. Wheel-to-zoom works in every tool.
 */
export class ViewportTool implements Tool {}
