# schematic

A browser-based sketcher for chemical structures and reactions. It runs client-side with no backend and no runtime dependencies.

## What it does

- Draw structures with bond, chain, and ring tools. Click a bond to cycle its order (single/double/triple); type an element symbol over an atom to change it.
- Place reaction arrows and plus signs; select, move, and delete atoms, bonds, arrows, and pluses together.
- Pan and zoom the canvas; fit to content.
- Paste a SMILES string (⌘V / Ctrl+V) to insert a laid-out structure. Copy and paste a selection (⌘C / ⌘V) to duplicate it.
- Export the canvas as SVG or PNG, or copy a PNG to the clipboard.
- Undo/redo per action, with a live formula and molecular-weight readout of the current selection.

## Controls

- **Tools (toolbar):** select, bond, chain, ring, arrow, plus, pan/zoom.
- **Bonds:** drag from empty space or an atom to draw; click a bond to cycle its order; press `1`/`2`/`3` over a bond to set its order.
- **Atoms:** hover an atom and type an element symbol (`o`, `n`, `cl`, …); press `+`/`-` to adjust charge.
- **Rings:** with the ring tool, hover and press `3`–`8` to place an n-membered ring (`6` places benzene).
- **Selection:** drag to marquee or lasso; drag a selection to move; the handle at the corner rotates it. Cmd- or Shift-click toggles individual items.
- **View:** two-finger scroll or mouse wheel to zoom toward the cursor; ⌘0 / Ctrl+0 to fit.
- **Other:** ⌘Z / Ctrl+Z undo, ⌘⇧Z / Ctrl+Shift+Z redo, Delete to erase, Esc to clear the selection.

## Running locally

```
npm install
npm run dev      # start the dev server
npm test         # run the unit tests
npm run build    # type-check and build to dist/
```

## Deployment

The site is published to GitHub Pages from the `main` branch by the workflow in `.github/workflows/deploy.yml`. Vite is configured with `base: '/schematic/'`, so the live site is at <https://grebenyyk.github.io/schematic/>.

## Implementation

TypeScript, rendered as SVG, built with Vite, tested with Vitest. The model, rendering, and interaction code are kept in separate layers: `src/core/` is pure TypeScript with no DOM code, `src/render/` turns a document into SVG, and `src/interaction/` maps pointer and keyboard input to document changes.
