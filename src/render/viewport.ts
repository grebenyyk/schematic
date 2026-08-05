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

/** Anchored camera: top-left origin plus a stored pt-per-CSS-px scale. */
export interface Camera {
  x: number;
  y: number;
  scale: number;
}

/**
 * Grow-only, anchor-stable camera. Returns the SAME object when the content
 * already fits (in-view moves never shift the view). On overflow the origin
 * only moves left/up and the scale only grows — never a recenter or zoom-in.
 * Pair with preserveAspectRatio="xMinYMin meet".
 */
export function updateCamera(
  cam: Camera | null,
  content: ViewBox,
  rectW: number,
  rectH: number,
): Camera {
  if (!cam) {
    return {
      x: content.x,
      y: content.y,
      scale: Math.max(content.width / rectW, content.height / rectH),
    };
  }
  const curW = cam.scale * rectW;
  const curH = cam.scale * rectH;
  // epsilon: content sitting exactly on the edge (within float noise and
  // sub-pixel amounts) counts as fitting — otherwise the camera grows by a
  // hair on every such render, which reads as a jiggle
  const EPS = 0.5;
  const fits =
    content.x >= cam.x - EPS && content.y >= cam.y - EPS &&
    content.x + content.width <= cam.x + curW + EPS &&
    content.y + content.height <= cam.y + curH + EPS;
  if (fits) return cam;
  const x = Math.min(cam.x, content.x);
  const y = Math.min(cam.y, content.y);
  const w = Math.max(cam.x + curW, content.x + content.width) - x;
  const h = Math.max(cam.y + curH, content.y + content.height) - y;
  return { x, y, scale: Math.max(w / rectW, h / rectH) };
}
