# Minimal Molecule Sketcher — Architecture Blueprint

A concrete plan for a single-page, human-first molecule/reaction sketcher.
Design goals: **loads instantly, beautiful ACS-style output, zero chrome, works offline, the page *is* the product.**

---

## 0. Guiding decisions

| Decision | Choice | Why |
|---|---|---|
| Language | TypeScript, strict mode | model code is the heart; types pay off in geometry/chemistry logic |
| Framework | **none** for the core; the page shell is vanilla DOM | avoids Ketcher's React+Redux tax; adapters can be added later |
| Rendering | **SVG** (one `<svg>` per editor) | crisp zoom, HiDPI for free, trivial export, CSS-themable |
| Build | Vite, single `index.html` entry, ES modules, no router | one static page; PWA via `vite-plugin-pwa` later |
| Cheminformatics | own TS engine for parsing/layout; WASM (RDKit/Indigo) pluggable behind an interface, lazy-loaded | no server, no hard dependency on a WASM supply chain |
| Dependencies (runtime) | ideally **zero** | keep it under ~150 KB gzipped |
| State/undo | immutable document + command log | undo/redo is trivially correct; enables "compound gesture" undo |

---

## 1. File structure

```
/
├── index.html                  # the page: canvas + minimal chrome
├── styles/
│   └── page.css                # page chrome only (dark/light)
├── src/
│   ├── main.ts                 # boots the app: new Editor(mountEl, config)
│   │
│   ├── core/                   # ── framework-free, DOM-free, pure TS ──
│   │   ├── model/
│   │   │   ├── molecule.ts     # Atom, Bond, Fragment, Molecule types + ops
│   │   │   ├── reaction.ts     # Arrow, Plus, agents above/below arrow
│   │   │   ├── document.ts     # Scene = molecules + reaction elements + selection
│   │   │   └── stereo.ts       # wedge/hash bonds, E/Z, R/S bookkeeping
│   │   ├── chem/
│   │   │   ├── valence.ts      # valence table, implicit-H computation
│   │   │   ├── aromatic.ts     # aromaticity perception (Hückel), kekulization
│   │   │   ├── smiles.ts       # SMILES parse + write
│   │   │   ├── molfile.ts      # V2000/V3000 MOL/RXN parse + write
│   │   │   └── layout.ts       # 2D coordinate generation for pasted SMILES
│   │   ├── commands/
│   │   │   ├── command.ts      # Command { do(doc), undo(doc) } interface
│   │   │   ├── history.ts      # undo/redo stacks + compound commands
│   │   │   └── ops.ts          # AddAtom, AddBond, MoveFragment, Delete, SetStereo…
│   │   ├── geometry/
│   │   │   ├── vec2.ts         # vector math
│   │   │   ├── snapping.ts     # 15° angle snap, bond-length snap, merge-target hit
│   │   │   └── hit.ts          # pick atom/bond/label under pointer
│   │   └── style/
│   │       ├── stylesheet.ts   # StyleSheet interface (the ONE config object)
│   │       └── presets.ts      # acs1996, flat, dark  (see §4)
│   │
│   ├── render/
│   │   ├── renderer.ts         # scene → SVG DOM (incremental patching)
│   │   ├── bonds.ts            # single/double/triple, wedge, hash, aromatic dash
│   │   ├── labels.ts           # atom labels, charges, H-counts, subscripts
│   │   ├── decorators.ts       # selection outlines, hover highlights, snap guides
│   │   └── export.ts           # SVG → standalone SVG / PNG (canvas rasterize)
│   │
│   ├── interaction/            # pointer-event → tool state machines
│   │   ├── tools.ts            # Tool interface { onDown/onMove/onUp/onHover }
│   │   ├── tools/
│   │   │   ├── bond.ts         # click-drag draws bond, click ring-template…
│   │   │   ├── chain.ts        # drag out zig-zag chains
│   │   │   ├── atom.ts         # place/change element (click, or type over)
│   │   │   ├── select.ts       # marquee + lasso, move, rotate, delete
│   │   │   └── erase.ts
│   │   ├── keyboard.ts         # hotkeys: 1/2/3 bond order, c/n/o… atoms, templates
│   │   ├── gestures.ts         # touch: 1-finger draw, 2-finger pan/zoom
│   │   └── clipboard.ts        # copy/paste MOL+SMILES+SVG+PNG
│   │
│   ├── services/               # OPTIONAL, lazy — never required
│   │   ├── provider.ts         # interface ChemService { clean(doc), parse(fmt), … }
│   │   ├── local.ts            # own TS engine implements ChemService (default)
│   │   └── wasm-rdkit.ts       # rdkit wasm adapter — loaded on demand only
│   │
│   └── shell/                  # the page chrome — deliberately tiny
│       ├── toolbar.ts          # one slim toolbar, tool icons only
│       ├── statusline.ts       # formula / MW of selection
│       ├── menu.ts             # export, import, theme, about
│       └── pwa.ts              # service worker registration
│
└── public/
    ├── manifest.webmanifest
    └── icons/
```

**The load-bearing boundary:** everything in `core/` is pure TypeScript — no DOM, no events. `render/` turns a document into SVG. `interaction/` turns events into commands. `shell/` is replaceable. You could run `core/` headless in tests, and later wrap it as a Web Component or React component without touching it.

---

## 2. The model layer

Keep the document small and honest. No normalization-at-every-mutation; invariants are enforced by commands, not by the data structures.

```ts
// core/model/molecule.ts
export type ElementSymbol = 'C' | 'H' | 'N' | 'O' | 'S' | 'P' | 'F' | 'Cl' | 'Br' | 'I' | 'B' | 'Si' | string;

export interface Atom {
  id: number;
  element: ElementSymbol;       // 'C' renders as nothing unless terminal/labeled
  pos: Vec2;                    // canvas coords in "pt-space" (1 pt = 1 style unit)
  charge: number;
  isotope?: number;
  hydrogens?: number | null;    // explicit override; null = derive from valence
  radical?: 'none' | 'singlet' | 'doublet' | 'triplet';
  stereoLabel?: 'R' | 'S' | null;
}

export type BondOrder = 1 | 2 | 3 | 'aromatic';
export type BondStereo = 'none' | 'wedge' | 'hash' | 'wavy' | 'up' | 'down' | 'cis-trans';

export interface Bond {
  id: number;
  a: number; b: number;         // atom ids
  order: BondOrder;
  stereo: BondStereo;
}

export interface Molecule { atoms: Map<number, Atom>; bonds: Map<number, Bond>; }

// core/model/document.ts
export interface Document {
  molecules: Molecule[];                      // disconnected fragments = separate molecules
  reaction: { arrow?: Arrow; pluses: Plus[] } | null;
  selection: Selection;                       // sets of atom/bond/element ids
  meta: { nextId: number };
}
```

Coordinate system: **store positions in style points, not pixels.** A bond is 14.4 units long. Rendering multiplies by a zoom factor; the model never knows about zoom or DPI. This one decision kills whole classes of HiDPI/export bugs.

## 3. Commands and history

```ts
// core/commands/command.ts
export interface Command {
  do(doc: Document): Document;    // pure: returns new document
  undo(doc: Document): Document;  // inverse
  label?: string;                 // for a future undo menu ("Draw bond")
}
```

- Commands are **pure functions over immutable documents** (structural sharing via plain object spreads + persistent `Map`s is fine at this scale — a molecule editor document is tiny).
- `History` holds two stacks. A **CompoundCommand** groups a whole pointer gesture (e.g. "drag out a 4-carbon chain") into one undoable unit — copy ChemDoodle's `CompoundAction` idea; it's the difference between undo feeling professional and undo feeling broken.
- Every tool only ever emits commands. There is exactly one mutation path, so undo/redo, clipboard, autosave, and a future collab mode all hook the same stream.

```ts
// example tool emission
function onPointerUp(e, ctx) {
  if (this.draftAtoms.length > 1)
    ctx.commit(new CompoundCommand(this.draftAtoms.map(pair => new AddBond(pair, 1)), 'Draw chain'));
}
```

## 4. Rendering: the ACS style sheet as data

The renderer is parameterized by **one** style object. The default preset *is* ACS Document 1996:

```ts
// core/style/stylesheet.ts
export interface StyleSheet {
  bondLengthPt: number;        // ACS: 14.4
  lineWidthPt: number;         // ACS: 0.6
  boldWidthPt: number;         // ACS: 2.0
  marginPt: number;            // ACS: 1.6   — clearance around atom labels
  hashSpacingPt: number;       // ACS: 2.5
  doubleBondSpacing: number;   // fraction of bond length; ACS: 0.18
  chainAngleDeg: number;       // ACS: 120
  labelFont: string;           // 'Helvetica, Arial, sans-serif'
  labelSizePt: number;         // ACS: 10
  labelColorMode: 'mono' | 'hetero-color';  // mono = all black (journal default)
  aromaticStyle: 'circle' | 'kekule' | 'dashed';
  wedgeTaper: 'sharp' | 'narrow';           // wedge tip width
  colors: { bond: string; selection: string; hover: string; background: string };
  atomColors?: Record<string, string>;      // for hetero-color / flat themes
}
```

```ts
// core/style/presets.ts
export const ACS1996: StyleSheet = {
  bondLengthPt: 14.4, lineWidthPt: 0.6, boldWidthPt: 2.0,
  marginPt: 1.6, hashSpacingPt: 2.5, doubleBondSpacing: 0.18,
  chainAngleDeg: 120, labelFont: 'Helvetica, Arial, sans-serif',
  labelSizePt: 10, labelColorMode: 'mono',
  aromaticStyle: 'kekule', wedgeTaper: 'sharp',
  colors: { bond: '#000', selection: '#3a7bd5', hover: '#9fc3ee', background: '#fff' },
};
export const FLAT /* modern colored */, DARK /* for dark mode */ …
```

**Rendering pipeline** (`render/renderer.ts`):

1. Compute derived geometry per bond: unit vector, normal, trimmed endpoints (shorten by `marginPt` where a label sits), double-line offsets, wedge polygon points, hash dash segments.
2. Emit SVG in **layered groups**: `<g class=bonds>` → `<g class=labels>` → `<g class=decorators>`. Bond layer before label layer so label backgrounds knock out bond lines (white `<rect>` behind each label, sized from measured text — or use `paint-order: stroke` with a thick background-colored stroke, which is cheaper and looks identical).
3. **Incremental patching:** keep a map `id → <g>` and only re-emit atoms/bonds the last command touched (commands can report their affected ids). Full redraws only on zoom/style change. At SVG scene sizes for a page of molecules this is instant; don't over-engineer with virtual DOM.
4. **Text:** real `<text>` elements, `dominant-baseline="central"`, font metrics measured once per stylesheet via an offscreen canvas for label knockout boxes. Subscript/superscript via `<tspan dy>`.
5. HiDPI: nothing special needed — SVG is vector. For **PNG export**, rasterize at `2×`–`3×` the display size via an `<img>` → canvas pipeline (`export.ts`).

This is also where you get the killer cheap feature: **"Export SVG" is just `outerHTML` + stylesheet inlining.** Publication-ready vector output for free.

## 5. Interaction model (the human-first part)

This is where you beat the incumbents, so it's worth being opinionated:

- **One tool, not a toolbar of modes.** Default tool draws: click-drag from empty space = new bond at snap angle; drag from an atom = extend; click a bond = cycle 1→2→3 order; drag on a bond = set stereo wedge/hash. ChemDraw users call this the "everything tool" workflow; it removes mode-switching.
- **Keyboard-first atom entry:** hover an atom, type `n` → it becomes N; type `ocl` → O–Cl chain start. This is the single most-loved sketching feature (ChemDraw hotkeys) and no web tool does it well.
- **Snap, don't constrain:** 15° angle snapping with a subtle guide line while dragging; hold a modifier (Alt) to draw freehand angles. Bond length snaps to style-sheet length; merging onto a nearby existing atom is shown with a hover highlight *before* you drop.
- **Ring templates as gestures, not palette icons:** click-drag with the polygon tool and the ring grows between start and current pointer; number keys 3–8 place that ring at the hovered bond/atom.
- **Marquee selection always available** via plain drag on empty space with Shift (or a two-mode toggle); move/rotate/delete operate on selection; `Delete` = erase, `Ctrl+D` = duplicate-and-drag.
- **Touch:** one finger draws exactly like the pointer; two fingers pan/zoom only. No gesture conflicts — this is where every incumbent's changelog shows pain.
- **Formula + MW status line**, live, for the selection or whole scene. Costs 30 lines, feels like magic.
- **Undo:** `Ctrl+Z`/`Ctrl+Shift+Z` — gestures are compound commands, so undo always undoes one *human action*, never one micro-step.

## 5b. Reaction sketching (chains of reactions, orgchem-problem style)

The arrow is a **free-standing scene element**, not metadata binding molecules together. A "reaction chain" is just molecules + arrows on one canvas — no Reaction object, no reactant/product membership. This is how ChemDraw treats arrows and it is the right call: hard attachment is the Ketcher trap (rigidity, no benefit to a sketcher).

**Model** (`core/model/reaction.ts`):

```ts
export interface ReactionArrow {
  id: number;
  from: Vec2;  to: Vec2;   // pt-space, like everything else
  kind: 'simple' | 'equilibrium' | 'resonance' | 'retrosynthetic' | 'dashed';
  above: LabelText | null; // reagents — always optional
  below: LabelText | null;
}
export interface LabelText { raw: string; }  // typed "H2SO4, Delta" → typeset H₂SO₄, Δ
```

**Interaction:**

- Arrow tool = **click-drag**: rubber-bands an arrow snapped to horizontal/vertical/45°, default length ~3 bond lengths; single click drops a default arrow. Arrows are selectable, movable, resizable (drag head/tail handles).
- **Inline reagent typing, never a dialog:** select an arrow and just start typing → text goes above; `Tab`/`Enter` switches to the below slot; `Esc` commits. Clicking directly above/below an existing arrow edits that slot. Empty slots simply don't exist; deleting the text removes the slot. An arrow with no labels is first-class.
- **Chem-aware typesetting as you type:** digits subscript after element letters, `+`/`-` superscript, tokens like `Delta`, `hv`, `°C` recognized; literal unicode accepted too.
- **Soft magnet, never a constraint:** moving a molecule near an arrow endpoint lets the endpoint *follow* the molecule edge; nothing hard-attaches.
- **"Add next step" gesture:** one shortcut places an arrow to the right of the current selection, pans the view, and re-arms the drawing tool — the fast path for A → B → C → D problem-set chains that no incumbent optimizes for.

**Rendering** (`render/arrow.ts`): filled-triangle arrowhead sized off `boldWidthPt`, stem at `lineWidthPt`; equilibrium = two half-arrows, resonance = double-headed, retrosynthetic = double-line open arrow, dashed stem — all from the `StyleSheet`, so ACS look stays consistent. Labels center above/below and the **arrow auto-extends to fit longer reagent text**. Labels use the same `<text>` + subscript machinery as atom labels.

**Commands:** `AddArrow`, `MoveArrow`, `SetArrowKind` (repeated click / right-click cycles kinds), `SetArrowLabel` — ordinary compound-friendly commands, so a whole chain-building session undoes step by step.

**Export:** arrows/labels are part of the scene → PNG/SVG export just works. RXN on the clipboard only via explicit "Export as reaction"; never infer reaction membership from spatial layout (classic over-engineering trap).

## 6. Cheminformatics, strictly optional

```ts
// services/provider.ts
export interface ChemService {
  parseSmiles(s: string): Document;         // used by paste/URL-import
  writeSmiles(doc: Document): string;
  writeMolfile(doc: Document): string;      // V3000
  clean(doc: Document): Document;           // 2D layout / "tidy up"
}
```

- `services/local.ts` implements all of it in your own TS: SMILES parse/write is a few hundred lines; layout (`chem/layout.ts`) handles chains + ring systems well enough for pasted structures (SmilesDrawer proves this is feasible in <80 KB).
- `clean()` (proper layout like ChemDraw's "Clean Up Structure") is the one genuinely hard algorithm. Ship v1 without it, or lazy-load a WASM adapter behind the same interface (`import('./wasm-rdkit.ts')` on first use) with graceful fallback.
- **Clipboard:** copy writes `chemical/x-mdl-molfile`, SMILES, SVG and PNG to the clipboard simultaneously; paste sniffs formats. Editor-to-editor interop then just works.

## 7. The page itself

```
┌──────────────────────────────────────────────┐
│ [logo]   bond▾ ring▾  ⎘ select  ⌫  ↶ ↷   ⚙   │  ← one 40px toolbar, icon-only
├──────────────────────────────────────────────┤
│                                              │
│                                              │
│                 drawing surface              │
│                                              │
│                                              │
├──────────────────────────────────────────────┤
│ C₈H₉NO₂ · 151.16 g/mol        Export ▾ ⤓ ⧉   │  ← status line + export
└──────────────────────────────────────────────┘
```

- No sign-in, no modals on open, no tutorial. The page is drawable in under a second from cold load.
- Theme toggle (light/dark — just swaps the `StyleSheet.colors` and page CSS).
- Everything local: no network calls at all in the default build. PWA manifest + service worker make it installable/offline.
- Share/export formats in one menu: **PNG (2×/3×), SVG, SMILES, MOL, copy-all-to-clipboard**.

## 8. Build order (suggested)

1. `core/model` + `core/style` + `render` (draw a hard-coded benzene, pixel-tune the ACS look) — *the look is the product; nail it first.*
2. `interaction/tools/bond` + `commands` + `history` — you can now draw and undo.
3. Atom labels, charges, implicit H, hotkeys, chain tool.
4. Selection/move/rotate/delete, eraser, ring templates.
5. SMILES+MOL parse/write, clipboard interop, PNG/SVG export.
6. Reaction mode (arrow, plus signs), touch gestures, dark theme.
7. PWA, then (optional) WASM `clean()` and a Web Component wrapper.

**Deliberately out of scope for v1:** S-groups, R-groups, polymers/sequence mode, name→structure, 3D, database search. Those are the features that made the incumbents integration-first; adding them later behind the `ChemService` seam keeps the door open without paying the complexity tax now.
