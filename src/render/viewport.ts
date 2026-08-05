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

/**
 * Grow-only viewport: returns the union of the current view and the content
 * bounds. Moving fragments never shifts the camera; the view only expands
 * when content leaves it, keeping the existing region anchored.
 */
export function expandViewBox(current: ViewBox, content: ViewBox): ViewBox {
  const x1 = Math.min(current.x, content.x);
  const y1 = Math.min(current.y, content.y);
  const x2 = Math.max(current.x + current.width, content.x + content.width);
  const y2 = Math.max(current.y + current.height, content.y + content.height);
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}
