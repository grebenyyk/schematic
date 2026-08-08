// @vitest-environment jsdom
import { describe, test, expect } from 'vitest';
import { renderDocument } from '../../src/render/renderer';
import { ACS1996 } from '../../src/core/style/presets';
import { createDocument } from '../../src/core/model/document';
import { AddArrow, AddPlus } from '../../src/core/commands/ops';

const SVG_NS = 'http://www.w3.org/2000/svg';

describe('reactions rendering', () => {
  test('reactions layer: arrow = stem line + head polygon; plus = two lines', () => {
    const svg = document.createElementNS(SVG_NS, 'svg') as unknown as SVGSVGElement;
    let doc = createDocument();
    doc = new AddArrow({ id: 1, from: { x: 0, y: 0 }, to: { x: 20, y: 0 } }).do(doc);
    doc = new AddPlus({ id: 2, pos: { x: 10, y: 10 } }).do(doc);
    renderDocument(document, svg, doc, ACS1996);

    const g = svg.querySelector('g.reactions')!;
    expect(g.querySelectorAll('polygon').length).toBe(1); // arrowhead
    expect(g.querySelectorAll('line').length).toBe(3); // arrow stem + 2 plus strokes
  });
});
