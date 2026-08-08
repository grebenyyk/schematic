import { test, expect } from 'vitest';
import { ViewportTool } from '../../src/interaction/tools/viewport';
import type { Tool } from '../../src/interaction/tools';

test('ViewportTool is a mode-marker Tool with no required handlers', () => {
  const tool: Tool = new ViewportTool();
  expect(tool).toBeInstanceOf(ViewportTool);
  // pan/zoom are editor-level; the marker defines no pointer handlers
  expect(tool.onDown).toBeUndefined();
  expect(tool.onMove).toBeUndefined();
  expect(tool.onUp).toBeUndefined();
});
