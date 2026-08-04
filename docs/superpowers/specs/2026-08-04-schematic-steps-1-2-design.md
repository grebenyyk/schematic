# Schematic — Steps 1–2 Design: Scaffold, Renderer, Draw & Undo

Master spec: `Minimal Molecule Sketcher — Architecture Blueprint.md` (repo root).
This document covers only the first build slice: blueprint build-order steps 1–2.

## Goal

A Vite + TypeScript (strict) single-page app, zero runtime dependencies, where:

1. A hard-coded benzene (plus test molecules exercising double/triple/wedge bonds) renders in ACS 1996 style — the look is the product.
2. The user can draw bonds with the pointer (15° snap, extend from atom, click bond to cycle order) and undo/redo whole gestures.

## Repo & Tooling

- Repo: `git init` in project root; remote `github.com/grebenyyk/schematic`; deploy via GitHub Pages at `grebenyyk.github.io/schematic` (Vite `base: '/schematic/'`). Deployment wiring is deferred to the end of the project.
- Dev dependencies only: `vite`, `typescript`, `vitest`, `jsdom` (for renderer smoke tests). No runtime dependencies.
- Vitest runs `core/` headless, exactly as the blueprint intends.

## File layout for this slice

```
index.html
styles/page.css            # page chrome only
vite.config.ts             # base '/schematic/'
src/main.ts                # boots Editor on mount element
src/core/
  geometry/vec2.ts         # vector math
  geometry/snapping.ts     # 15° angle snap, bond-length snap
  geometry/hit.ts          # pick atom/bond under pointer
  model/molecule.ts        # Atom, Bond, Molecule types + pure ops
  model/document.ts        # Document (molecules + selection + meta)
  style/stylesheet.ts      # StyleSheet interface
  style/presets.ts         # ACS1996 (values verbatim from blueprint §4)
  commands/command.ts      # Command { do, undo, label? }
  commands/history.ts      # undo/redo stacks + CompoundCommand
  commands/ops.ts          # AddAtom, AddBond, Delete
src/render/
  renderer.ts              # document → SVG DOM, layered groups
  bonds.ts                 # pure derived-geometry fns + SVG emit: single/double/triple/wedge
  labels.ts                # atom label <text> emission
  decorators.ts            # hover highlights, snap guides
src/interaction/
  tools.ts                 # Tool interface { onDown/onMove/onUp/onHover }
  tools/bond.ts            # click-drag bond drawing
  keyboard.ts              # 1/2/3 bond order, Ctrl+Z / Ctrl+Shift+Z
```

The load-bearing boundary holds: `core/` is DOM-free and event-free; `render/` turns documents into SVG; `interaction/` turns events into commands.

## Step 1 — Renderer

- Coordinates in style points (bond = 14.4 pt); zoom is render-time only, the model never sees it.
- Derived bond geometry (unit vector, normal, trimmed endpoints by `marginPt`, double-line offsets at `doubleBondSpacing`, wedge polygon points) is computed by **pure functions** so it is unit-testable headless.
- SVG emitted in layered groups: `<g class="bonds">` → `<g class="labels">` → `<g class="decorators">`. Labels use real `<text>` with `dominant-baseline="central"`; knockout via `paint-order: stroke` with a background-colored stroke.
- `index.html` loads a hard-coded demo scene (benzene + molecules with double, triple, and wedge bonds) for pixel-tuning the ACS look.
- Full redraw on each render for this slice; incremental patching (blueprint §4.3) deferred until a command stream exists to report affected ids.

## Step 2 — Commands, history, bond tool

- `Command`: pure `do(doc) → doc` / `undo(doc) → doc`. Structural sharing via plain spreads + rebuilt `Map`s (documents are tiny).
- `History`: two stacks; `CompoundCommand` groups one pointer gesture into a single undoable unit.
- Bond tool behavior:
  - Click-drag from empty space → new bond, snapped to 15° increments, length snapped to `bondLengthPt`.
  - Drag from an atom → extends the molecule.
  - Drag end near an existing atom → merges onto it (hover highlight before drop).
  - Click on a bond → cycles order 1→2→3.
  - Alt held → freehand angle (no snap).
- Keyboard: `1`/`2`/`3` set bond order of hovered bond; `Ctrl+Z` / `Ctrl+Shift+Z` undo/redo.
- Exactly one mutation path: tools only emit commands.

## Testing strategy

TDD on the pure core; interaction verified via synthetic pointer events; renderer verified structurally.

- **Unit tests (headless):** vec2 math; molecule/document ops; bond derived geometry (normals, trimming, offsets, wedge polygons); snapping (angle, length, merge-target); hit-testing; command ops; history undo/redo including compound commands.
- **Tool tests:** drive `BondTool` with synthetic pointer events against a fake context; assert emitted commands.
- **Renderer smoke tests (jsdom):** SVG structure — layer order, element counts per bond type, label knockout attributes. No pixel assertions.

## Explicitly deferred (later blueprint steps)

Atom typing/hotkeys for elements, charges, implicit H display, selection/move/rotate/delete, eraser, ring templates, chain tool, SMILES/MOL, clipboard, PNG/SVG export, reaction arrows, touch gestures, dark theme, PWA, WASM clean().
