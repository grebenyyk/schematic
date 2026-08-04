import type { Vec2 } from '../core/geometry/vec2';

export interface ClientRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Map client (CSS pixel) coordinates to SVG viewBox points, honoring the
 * default preserveAspectRatio="xMidYMid meet": uniform scale = min of the
 * axis scales, content centered in the leftover space.
 */
export function clientToPt(client: Vec2, rect: ClientRect, box: ViewBox): Vec2 {
  if (rect.width <= 0 || rect.height <= 0) return { x: box.x, y: box.y };
  // pt per CSS px: the larger ratio wins so the whole viewBox fits ("meet")
  const s = Math.max(box.width / rect.width, box.height / rect.height);
  const drawnW = box.width / s;
  const drawnH = box.height / s;
  const offsetX = (rect.width - drawnW) / 2;
  const offsetY = (rect.height - drawnH) / 2;
  return {
    x: box.x + (client.x - rect.left - offsetX) * s,
    y: box.y + (client.y - rect.top - offsetY) * s,
  };
}
