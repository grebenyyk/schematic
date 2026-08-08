import { createDocument } from './core/model/document';
import { Editor } from './editor';
import { BondTool } from './interaction/tools/bond';
import { ChainTool } from './interaction/tools/chain';
import { SelectTool } from './interaction/tools/select';
import { ViewportTool } from './interaction/tools/viewport';
import { RingTool } from './interaction/tools/ring';
import { ArrowTool } from './interaction/tools/arrow';
import { PlusTool } from './interaction/tools/plus';
import { hillFormula, molecularWeight, formulaText } from './core/chem/formula';
import { documentSvg, svgToPngBlob, downloadBlob } from './render/export';

const mount = document.getElementById('canvas-host')!;
const undoBtn = document.getElementById('undo') as HTMLButtonElement;
const redoBtn = document.getElementById('redo') as HTMLButtonElement;
const statusline = document.getElementById('statusline')!;

const editor = new Editor(mount, {
  document: createDocument(),
  onHistoryChange: (canUndo, canRedo) => {
    undoBtn.disabled = !canUndo;
    redoBtn.disabled = !canRedo;
  },
  onDocumentChange: (doc, selection) => {
    const counts = hillFormula(doc, selection.atoms.size > 0 ? selection.atoms : undefined);
    statusline.textContent = counts.size === 0
      ? 'drag to draw a bond · click a bond to cycle its order · paste SMILES with ⌘V'
      : `${formulaText(counts)} · ${molecularWeight(counts).toFixed(2)} g/mol`;
  },
  onToolShortcut: (key) => selectTool(key === 'v' ? 'select' : 'bond'),
});

undoBtn.addEventListener('click', () => editor.undo());
redoBtn.addEventListener('click', () => editor.redo());

const bondToolBtn = document.getElementById('tool-bond') as HTMLButtonElement;
const chainToolBtn = document.getElementById('tool-chain') as HTMLButtonElement;
const selectToolBtn = document.getElementById('tool-select') as HTMLButtonElement;
const viewportToolBtn = document.getElementById('tool-viewport') as HTMLButtonElement;
const ringToolBtn = document.getElementById('tool-ring') as HTMLButtonElement;
const arrowToolBtn = document.getElementById('tool-arrow') as HTMLButtonElement;
const plusToolBtn = document.getElementById('tool-plus') as HTMLButtonElement;
const selectMenu = document.getElementById('select-menu') as HTMLDivElement;

let selectMode: 'rect' | 'lasso' = 'rect';

function selectTool(which: 'bond' | 'chain' | 'select' | 'viewport' | 'ring' | 'arrow' | 'plus') {
  (document.activeElement as HTMLElement | null)?.blur?.();
  editor.setTool(
    which === 'bond' ? new BondTool()
      : which === 'chain' ? new ChainTool()
        : which === 'viewport' ? new ViewportTool()
          : which === 'ring' ? new RingTool()
            : which === 'arrow' ? new ArrowTool()
              : which === 'plus' ? new PlusTool()
                : new SelectTool(selectMode));
  bondToolBtn.classList.toggle('active', which === 'bond');
  chainToolBtn.classList.toggle('active', which === 'chain');
  selectToolBtn.classList.toggle('active', which === 'select');
  viewportToolBtn.classList.toggle('active', which === 'viewport');
  ringToolBtn.classList.toggle('active', which === 'ring');
  arrowToolBtn.classList.toggle('active', which === 'arrow');
  plusToolBtn.classList.toggle('active', which === 'plus');
}
bondToolBtn.addEventListener('click', () => selectTool('bond'));
chainToolBtn.addEventListener('click', () => selectTool('chain'));
viewportToolBtn.addEventListener('click', () => selectTool('viewport'));
ringToolBtn.addEventListener('click', () => selectTool('ring'));
arrowToolBtn.addEventListener('click', () => selectTool('arrow'));
plusToolBtn.addEventListener('click', () => selectTool('plus'));

// bottom-right corner of the select button opens the mode menu
selectToolBtn.addEventListener('click', (e) => {
  const r = selectToolBtn.getBoundingClientRect();
  if (e.clientX > r.right - 14 && e.clientY > r.bottom - 14) {
    e.stopPropagation(); // don't let the document handler close it immediately
    selectMenu.hidden = !selectMenu.hidden;
    return;
  }
  selectTool('select');
});
selectMenu.querySelectorAll('button').forEach((btn) => {
  btn.addEventListener('click', () => {
    selectMode = (btn as HTMLButtonElement).dataset.mode as 'rect' | 'lasso';
    selectMenu.querySelectorAll('button').forEach((b) =>
      b.classList.toggle('active-mode', b === btn));
    (document.getElementById('select-icon-rect') as unknown as SVGElement).style.display =
      selectMode === 'rect' ? 'inline' : 'none';
    (document.getElementById('select-icon-lasso') as unknown as SVGElement).style.display =
      selectMode === 'lasso' ? 'inline' : 'none';
    selectMenu.hidden = true;
    selectTool('select');
  });
});
document.addEventListener('click', () => { selectMenu.hidden = true; });

const exportBtn = document.getElementById('export') as HTMLButtonElement;
const exportMenu = document.getElementById('export-menu') as HTMLDivElement;

async function runExport(which: string): Promise<void> {
  const svg = documentSvg(document, editor.document, editor.style);
  if (which === 'copy-png') {
    try {
      const blob = await svgToPngBlob(svg);
      await navigator.clipboard?.write([new ClipboardItem({ 'image/png': blob })]);
    } catch (err) {
      console.error('Copy PNG failed', err);
    }
  } else if (which === 'download-svg') {
    downloadBlob('molecule.svg', new Blob([svg], { type: 'image/svg+xml' }));
  } else if (which === 'download-png') {
    try {
      downloadBlob('molecule.png', await svgToPngBlob(svg));
    } catch (err) {
      console.error('PNG export failed', err);
    }
  }
}

exportBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  exportMenu.hidden = !exportMenu.hidden;
});
exportMenu.addEventListener('click', async (e) => {
  const btn = (e.target as HTMLElement).closest('button');
  if (!btn) return;
  e.stopPropagation();
  exportMenu.hidden = true;
  await runExport(btn.dataset.export!);
});
document.addEventListener('click', () => { exportMenu.hidden = true; });

// debug/e2e hook
(window as unknown as { editor: Editor }).editor = editor;
