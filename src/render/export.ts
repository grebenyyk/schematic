import { renderDocument, contentViewBox } from './renderer';
import type { Document as MolDocument } from '../core/model/document';
import type { StyleSheet } from '../core/style/stylesheet';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** PNG export is sized for print: content fit to this width at this resolution. */
export const EXPORT_WIDTH_IN = 7;
export const EXPORT_DPI = 600;

/**
 * A self-contained SVG string of the document — bonds and labels only, no
 * selection/snap decorators, tightly fit to the content. Serialized with an
 * explicit xmlns and pixel size so it stands alone as an .svg file (and so the
 * PNG rasterizer has an intrinsic size).
 */
export function documentSvg(dom: Document, doc: MolDocument, style: StyleSheet): string {
  const vb = contentViewBox(doc, style);
  const svg = dom.createElementNS(SVG_NS, 'svg');
  renderDocument(dom, svg, doc, style, [], vb);
  svg.setAttribute('xmlns', SVG_NS);
  svg.setAttribute('width', String(vb.width));
  svg.setAttribute('height', String(vb.height));
  // exports never include the live selection/guides
  svg.querySelector('g.decorators')?.remove();
  return new XMLSerializer().serializeToString(svg);
}

/**
 * Rasterize an SVG string to a PNG Blob. The content is fit to `widthIn`
 * (default 7 in) and sampled at `dpi` (default 600) → 4200 px wide, height by
 * aspect ratio. Vector source, so it stays crisp at that size.
 */
export function svgToPngBlob(
  svg: string,
  opts: { widthIn?: number; dpi?: number } = {},
): Promise<Blob> {
  const widthIn = opts.widthIn ?? EXPORT_WIDTH_IN;
  const dpi = opts.dpi ?? EXPORT_DPI;
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      if (!w || !h) { reject(new Error('SVG has no intrinsic size')); return; }
      const scale = (widthIn * dpi) / w;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('canvas 2D context unavailable')); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('PNG encode failed'))),
        'image/png',
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('SVG rasterization failed')); };
    img.src = url;
  });
}

/** Trigger a browser download of `blob` as `filename`. */
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
