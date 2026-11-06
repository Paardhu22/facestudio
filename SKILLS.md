# FaceStudio — SKILLS.md

> **Single source of truth** for FaceStudio's product scope, design system, architecture,
> engineering rules, feature specifications, decisions, and iteration history.
> Humans and AI agents must read this file **before planning or changing code**.
>
> Layout: sections **A–F** are *stable rules* (edit deliberately; record rule changes as ADRs in §F).
> Section **G** is an *append-only* iteration log. Section **H** is the *current status* snapshot
> (rewrite it every iteration so it is always accurate).

---

## Table of contents

- [A. Product Identity](#a-product-identity)
- [B. Design System](#b-design-system)
- [C. Application Architecture](#c-application-architecture)
- [D. Engineering Rules](#d-engineering-rules)
- [E. Feature Specifications](#e-feature-specifications)
- [F. Architecture Decision Records](#f-architecture-decision-records)
- [G. Iteration History (append-only)](#g-iteration-history-append-only)
- [H. Current Project Status](#h-current-project-status)
- [Mandatory iteration protocol](#mandatory-iteration-protocol)

---

## Mandatory iteration protocol

Every iteration (features, bug fixes, refactors, UI tweaks, performance work) follows this sequence:

1. Read `SKILLS.md` and the relevant source files.
2. Identify applicable rules and constraints (§B, §C, §D).
3. Plan the change: objective, affected modules, acceptance criteria.
4. Implement the smallest coherent change.
5. Run relevant checks: `npm run typecheck`, `npm run lint`, `npm test`, and `npm run test:e2e` when UI flows change.
6. Review the implementation against the documented rules.
7. Update `SKILLS.md` so it describes what the code **actually** does.
8. Append an entry to §G.
9. Rewrite §H and report: what changed, what was verified (with real command results), what remains.

Hard rules:
- Never claim a test passed unless it ran and passed in this iteration.
- Never mark a feature **Implemented** unless its required behavior works end to end.
- Never silently change a stable rule. Explain why and add or supersede an ADR.
- Never claim the 3,000-image target is met until it has been benchmarked (§E-13, §H).

---

## A. Product Identity

### A.1 Name and purpose
**FaceStudio** is a web-based batch image editor for intelligent face cropping, precise
bounding-box editing, color/tone adjustments, and full-resolution batch export of 1–3,000 images.

### A.2 Primary users
- Photographers and studios producing headshots (corporate, school, events, sports rosters).
- HR, marketing, and communications teams standardizing profile photos.
- Agencies and e-commerce/talent teams normalizing large portrait sets.
- Developers and operators who need consistent face-centered crops for datasets *(not identity work)*.

### A.3 Core use cases
1. Import a folder of hundreds or thousands of portraits.
2. Auto-detect faces and generate consistent headshot crops per image.
3. Correct individual crops manually where the automatic framing is wrong.
4. Apply the same adjustments and output settings to selected images or the whole batch.
5. Export full-resolution results as JPEG, PNG, or WebP in a ZIP with predictable filenames.

### A.4 Product principles
1. **Correctness over polish.** A control that looks right but computes wrong is a bug.
2. **Non-destructive.** Originals are never modified. Edits are serializable instructions.
3. **Deterministic.** The same source and edit instructions always produce the same output.
4. **Scale-aware.** Every feature must work at 1 image and at 3,000 images.
5. **Honest UI.** No dead buttons, no fake progress, no placeholder results presented as real.
6. **Focused.** A small set of professional tools done properly. No feature sprawl.
7. **Privacy by design.** Face *detection* only. Never recognition, identity matching, or biometric profiles.

### A.5 MVP scope
- Routes `/` (landing) and `/editor` (workspace).
- Import JPEG/PNG/WebP via file picker, folder picker, and drag-and-drop; validation; limits.
- Virtualized library with search/filter, multi-select, and status indicators.
- Konva canvas with zoom, pan, fit, before/after, crop overlays, and face overlays.
- Crop modes: Portrait/Headshot, Face-Only, Custom bounding box; multiple faces and multiple crops per image.
- Adjustments: Exposure, Temperature, Tint, Saturation, Brightness via one shared pixel kernel.
- Scopes: Current / Selected / All, with undo/redo of logical operations.
- Output: aspect presets, exact dimensions, fit strategy, format, and quality.
- Durable server-side export jobs: progress, cancel, retry, error review, streaming ZIP download.
- Anonymous session isolation, retention, and cleanup.

### A.6 Explicit non-goals (MVP)
- Face recognition, identity matching, clustering by person, or biometric templates.
- User accounts, teams, sharing, or cloud sync across devices.
- Generative edits, retouching, background removal, or segmentation (hair and shoulders are estimated, not segmented).
- RAW, HEIC, TIFF, GIF, or animated inputs.
- Rotation and straightening tools (EXIF orientation is honored; free rotation is out of scope).
- Mobile editing. The editor is desktop-first; the landing page is fully responsive.
- Multi-node and horizontal scaling (single host; see ADR-003).

---

## B. Design System

### B.1 Visual direction
A pure-black creative workspace (ADR-025) inspired by the *usability* of professional photo tools
(Lightroom- and Photoshop-like density, panel discipline, and precise numeric controls) without copying
any proprietary branding, iconography, or layouts. Images are the most colorful thing on screen:
the canvas, panels, menus, and toolbars use solid #000000 surfaces with neutral silver/graphite edges, so the UI does not bias color judgment. Blue is reserved for primary actions and focus/selection indicators; selections do not tint photos or panel backgrounds. The single blue accent marks focus,
selection, and primary actions.

Avoid excessive gradients, glassmorphism, decorative animation, stock "SaaS" hero blobs, and emoji.
Gradients are allowed only when they carry meaning (for example, the temperature and tint slider tracks).

**Theme:** dark only (ADR-006). There is no light theme; do not add `dark:` variants.

### B.2 Color tokens
Defined as CSS variables in `src/app/globals.css` and exposed to Tailwind through `@theme inline`.
**Never use raw hex values in components.** Use the Tailwind token classes in the right-hand column.

| Token (CSS var)             | Value                    | Tailwind class suffix  | Use |
|-----------------------------|--------------------------|------------------------|-----|
| `--fs-app`                  | `#000000`                | `surface-app`          | Page/app background, toolbar |
| `--fs-canvas`               | `#000000`                | `surface-canvas`       | Editor canvas area |
| `--fs-panel`                | `#000000`                | `surface-panel`        | Side panels, cards |
| `--fs-elevated`             | `#000000`                | `surface-elevated`     | Inputs, popovers, raised controls |
| `--fs-hover`                | `#0C0C0C`                | `surface-hover`        | Hover fill on panel items |
| `--fs-pressed`              | `#161616`                | `surface-pressed`      | Pressed/active fill |
| `--fs-border`               | `#404040`                | `line`                 | Default borders and dividers |
| `--fs-border-subtle`        | `#242424`                | `line-subtle`          | Low-emphasis dividers |
| `--fs-border-strong`        | `#808080`                | `line-strong`          | Hover borders, input borders on focus-within |
| `--fs-text`                 | `#F5F5F5`                | `fg`                   | Primary text |
| `--fs-text-secondary`       | `#B0B0B0`                | `fg-secondary`         | Secondary text, labels |
| `--fs-text-muted`           | `#949494`                | `fg-muted`             | Tertiary text and hints (≥4.5:1 on panel and elevated) |
| `--fs-text-disabled`        | `#606060`                | `fg-disabled`          | Disabled text only (exempt from contrast) |
| `--fs-accent`               | `#4B91F1`                | `brand`                | Focus rings, selection outlines, links/text on app, canvas, and panel surfaces |
| `--fs-accent-hover`         | `#6EA6F5`                | `brand-hover`          | Hovered links |
| `--fs-accent-solid`         | `#2B6FD2`                | `brand-solid`          | Filled primary buttons (white text 4.9:1) |
| `--fs-accent-solid-hover`   | `#2563C2`                | `brand-solid-hover`    | Hovered primary buttons (white text 5.8:1) |
| `--fs-success`              | `#39A780`                | `success`              | Completed states |
| `--fs-warning`              | `#E5AE52`                | `warning`              | Warnings, "needs attention" |
| `--fs-error`                | `#E06666`                | `danger`               | Errors, destructive actions |
| `--fs-face`                 | `#F0C35A`                | `face`                 | Detected-face boxes (unselected) |
| `--fs-face-selected`        | `#4B91F1`                | `face-selected`        | Selected face box |
| `--fs-crop`                 | `#FFFFFF`                | `crop`                 | Crop frame lines and handles |
| `--fs-scrim`                | `rgb(0 0 0 / 0.55)`      | `scrim`                | Outside-crop dimming, modal backdrop |
| `--fs-temp-cool` / `--fs-temp-warm` | `#5B8FD6` / `#E5AE52` | `temp-cool` / `temp-warm` | Temperature slider track gradient (meaningful color) |
| `--fs-tint-green` / `--fs-tint-magenta` | `#5FAE6B` / `#C46FC0` | `tint-green` / `tint-magenta` | Tint slider track gradient (meaningful color) |

**Illustration exception:** the landing-page artwork depicts photographs, not UI chrome. Its palettes are literal colors
defined in exactly one place, `src/features/landing/illustrations/portrait.tsx` (`PORTRAIT_PALETTES`). No other component
may contain literal colors.
The landing page may also use locally hosted photographic sample assets (`public/images/studio/`), documented in `SOURCES.md`, clearly presented as illustrations, never user data (ADR-016).

**Contrast rules (WCAG 2.2 AA):** body text ≥ 4.5:1, large text and UI glyphs ≥ 3:1.
Accent text (`brand`) is 6.62:1 on the black surfaces. Neutral muted text is 6.92:1 on black and 5.97:1 on the pressed surface. Numeric/select control borders use `--fs-control-border` (#606060), 3.34:1 against black; structural dividers are decorative. Edge lighting uses centralized `--fs-edge-soft` (8% white) and `--fs-edge-active` (18% white), with 120/180ms interaction transitions and the existing reduced-motion override.
White text sits only on `brand-solid` and `brand-solid-hover`, never on `brand`.

**shadcn/ui semantic aliases.** shadcn components use their own token names, which alias FaceStudio tokens:
`--background → --fs-app`, `--foreground → --fs-text`, `--card → --fs-panel`, `--popover → --fs-elevated`,
`--primary → --fs-accent-solid` (`--primary-foreground: #fff`), `--secondary → --fs-elevated`,
`--muted → --fs-elevated`, `--muted-foreground → --fs-text-muted`, `--accent → --fs-hover` (**note:** shadcn's
"accent" means the subtle hover surface, *not* the brand blue), `--destructive → --fs-error`,
`--border`/`--input → --fs-border`, `--ring → --fs-accent`.
App code uses FaceStudio classes (`bg-surface-panel`, `text-fg-muted`, `text-brand`). Generated shadcn
components may keep shadcn classes.

### B.3 Typography
- Family: **Inter** (variable, via `next/font/google`, self-hosted at build; no runtime third-party requests).
  Exposed as `--font-sans`. Monospace fallback stack `ui-monospace, SFMono-Regular, Menlo, monospace` for code only.
- Display: locally hosted variable **Manrope** (`next/font/local`, `--font-display`) for landing headings and the editor import heading (ADR-016). Landing display type is responsive, with a 78px desktop maximum and 36px mobile minimum.
- Numeric values (slider readouts, coordinates, dimensions, counts) **always** use `tabular-nums`.
- Editor scale (compact, desktop):

  | Class        | Size / line-height | Use |
  |--------------|--------------------|-----|
  | `text-ui-xs` | 11px / 14px        | Section eyebrows (uppercase, `tracking-wider`, `font-medium`), badges |
  | `text-ui-sm` | 12px / 16px        | Control labels, numeric readouts, status bar |
  | `text-ui`    | 13px / 18px        | Default editor body text, menu items |
  | `text-ui-lg` | 14px / 20px        | Panel titles, dialog body |

- Landing scale: Tailwind defaults (`text-sm` 14px up to `text-xl`) plus display sizes
  `text-display-sm` 40px/44px, `text-display` 56px/60px, `text-display-lg` 72px/76px, with tracking `-0.025em`
  and `font-semibold`. Body copy is 16–18px with relaxed leading, max width ~65ch.
- Weights: 400 body, 500 labels and buttons, 600 headings. Avoid 700+ except the wordmark.

### B.4 Spacing
Tailwind's default 4px scale (`--spacing: 0.25rem`). Allowed rhythm: 1 (4px), 1.5 (6px), 2 (8px),
3 (12px), 4 (16px), 5 (20px), 6 (24px), 8 (32px), 10 (40px), 12 (48px), 16 (64px), 20 (80px), 24 (96px), 32 (128px).
Editor panels use 12px internal padding (`p-3`) and 8px gaps between controls. Landing sections use
96–128px vertical padding on desktop and 64px on mobile. Arbitrary pixel values are allowed only for
hairlines and canvas-overlay geometry. The authored landing composition may use fluid type and measured CSS layout dimensions in its scoped studio selectors (ADR-016).

### B.5 Border radii
`--radius: 0.5rem` → `rounded-sm` 4px (inputs, small buttons, thumbnails, badges), `rounded-md` 6px (buttons,
menus, tooltips), `rounded-lg` 8px (panels, cards, dialogs), `rounded-xl` 12px (landing cards and previews).
The editor favors 4–6px. Avoid pills except for status badges and toggles.

### B.6 Shadows and elevation
Pure-black layers separate with **1px neutral borders and subtle inset edge light** first and shadow second (ADR-025). Hover/focus increases edge contrast; no ambient border animation is used.
- `shadow-elev-1`: `0 1px 2px rgb(0 0 0 / .40)`. Raised controls.
- `shadow-elev-2`: `0 8px 24px rgb(0 0 0 / .45)`. Popovers, menus, tooltips (with a `line` border).
- `shadow-elev-3`: `0 24px 64px rgb(0 0 0 / .55)`. Dialogs and the landing app preview.

### B.7 Motion
Durations 120ms (hover/press), 180ms (panels, popovers), 320ms (crop camera settling after a committed edit, ADR-023), 400–600ms (landing entrance only).
Easing `cubic-bezier(0.2, 0, 0, 1)`. All non-essential motion is disabled under
`prefers-reduced-motion: reduce`. Never animate canvas geometry during user drags. Automatic crop-camera motion starts only after release/commit, uses cubic ease-out, and is immediately interruptible by another gesture or manual zoom/Fit. Reduced motion applies the final framing immediately.

### B.8 Iconography
Lucide icons only. Editor icons are 16px with stroke width 1.75; landing icons are 20–24px.
An icon-only button **must** have an `aria-label` and a tooltip. Icons inherit `currentColor`.

### B.9 Buttons and interactive states
Built on `src/components/ui/button.tsx` (shadcn + cva).
- Variants: `default` (brand-solid, white text, the single primary action per region), `secondary`
  (elevated + border), `outline`, `ghost` (transparent; hover `surface-hover`), `destructive`, `link`.
- Sizes: `xs` 24px (dense toolbars), `sm` 28px (editor default), `default` 32px, `lg` 40px (landing), `xl` 48px (hero CTA),
  plus `icon` 32px, `icon-sm` 28px, `icon-xs` 24px squares.
- `asChild` renders the child (for example, a Next.js `Link`) with button styling. `loading` shows a `LoaderCircle`
  spinner, sets `aria-busy`, and disables the button (it is ignored with `asChild`).
- Every interactive element defines **hover, active, focus-visible, disabled, and loading** states:
  - focus-visible: 2px `ring` (brand) with 2px offset matching the underlying surface. Never remove outlines without a replacement.
  - disabled: `opacity-50`, `pointer-events-none`, and a tooltip or adjacent text explaining *why* when the reason is not obvious.
  - loading: spinner icon replaces the leading icon, label stays, `aria-busy="true"`, and the element is non-interactive.
- **No dead controls.** A control is rendered only when it works. A disabled control must become enabled
  through an action the user can actually take in the current build.

### B.10 Form controls and sliders
- Inputs: 28px tall in the editor, `surface-elevated` fill, `line` border, `line-strong` on hover, brand ring on focus.
- Numeric inputs: right-aligned `tabular-nums`. Arrow keys step, Shift+arrow steps ×10, Enter commits,
  Escape reverts, blur commits. Values are clamped to the documented range.
- Sliders (Radix): 4px track, 12px thumb. Center-zero sliders (exposure, temperature, tint, saturation,
  brightness) fill from the center. The temperature track shows a blue→amber gradient and tint shows
  green→magenta, because those gradients carry meaning. **Double-click the label or thumb to reset** to default.
  Each slider pairs with a numeric input and a reset button that appears only when the value is non-default (the row keeps its
  space, so nothing shifts). Implemented in `features/adjustments`: the live preview updates on every drag tick, and **one** history
  entry is committed on release (pointer or key). Keyboard: arrows step by the spec step, Home/End jump to the ends. The thumb has
  `aria-valuetext` with sign and unit ("+0.05 EV"). The numeric field uses a true minus sign, accepts `−`, `-`, `.` and `,`, ignores
  unparseable text, and clamps to the range. **Escape reverts without committing** (a regression-tested trap: blur fires before React
  re-renders, so the field tracks an explicit "reverting" flag).

### B.11 Panels and navigation
- Editor layout: 8px inset workspace; top toolbar (46px), resizable three-panel body, bottom status bar (22px). The panel group has an 8px radius and a 1px border (ADR-016).
- Left (Library) default 280px (min 220, max 420). Right (Controls) default 300px (min 260, max 400).
  The center canvas takes the rest (min 400px). Geometry lives in `src/features/editor-shell/panel-sizes.ts`.
- Panel persistence (ADR-011): the side-panel widths are saved **in pixels** to `localStorage`
  (`facestudio:editor-panels:v1`, best effort, user-initiated resizes only), validated and clamped on read, and restored
  imperatively in a layout effect before first paint. The server and client render the identical tree, and storage is never
  read during render or hydration.
- Separators: 1px `line`, a 9px invisible hit area, `line-strong` on hover, brand while active or focused. They are keyboard
  operable (arrow keys step 5% of the group). Double-click resets the default size.
- Panel header: 36px, `text-ui-lg font-medium`, optional right-aligned count or actions.
- Panel sections: collapsible groups with `text-ui-xs` uppercase eyebrow headers, separated by `line-subtle` dividers.
- Landing navigation: 80px sticky bar (66px under 768px) on `surface-app`, with a bottom border and anchor links to sections (ADR-016).

### B.12 Image grids and thumbnails
- Virtualized grid (`@tanstack/react-virtual`, row virtualization). Columns derive from panel width
  (target cell 112px, min 2 columns). Cells are square with `object-fit: contain` on a `surface-canvas` tile.
- Thumbnail states (implemented): default; hover (`line-strong` outline, and the checkbox badge appears); **active** (the image open on
  the canvas: 2px brand ring); **selected** (checked badge top-left and a 1px brand ring; no photo tint, ADR-025); **keyboard focus** (2px
  `fg` inset outline while the grid has focus); **duplicate** (warning copy-icon badge bottom-left); **broken** (muted "image off" icon).
  Planned with their features: processing (spinner), done (success dot), no-face (warning badge). Upload failures are not tiles: they are
  listed in a collapsible panel above the grid (§E-3).
- Thumbnails come from the server `thumb` rendition (≤384px long edge). Full-resolution images never render in the grid.
- **Geometry rule (regression-tested):** every row has an **explicit** height (`gridAutoRows` = cell size) and the `<img>` is absolutely
  positioned. Without this, a tall image's intrinsic height inflates its grid track and the row overlaps the next one.

### B.13 Crop overlays and handles
- Outside the actual crop shape: `scrim` dimming (ADR-026). Circle/hexagon use a subtle dashed bounding frame for the eight resize handles. Crop frame: 1px `crop` (white) line with a 1px dark outer stroke for contrast on bright images.
- Rule-of-thirds guides at 35% white, visible while dragging or resizing, or when explicitly toggled with the toolbar / G (ADR-022).
- 8 handles (4 corners + 4 edges): 10px white squares with a 1px `surface-app` border, and a 20px invisible hit area. Hovered handles and the active drag frame use the brand accent (ADR-022).
- Face boxes: 1.5px dashed `face` (unselected) and 2px solid `face-selected` (selected), labeled with an index chip.
- When several crops exist on one image, the active crop uses the brand color and inactive crops use 50% white.
- The cursor reflects the action (move, `nwse-resize`, and so on). Overlays scale with zoom so line widths stay constant on screen.

### B.14 Dialogs, notifications, and progress
- Dialogs (Radix/shadcn): `surface-panel`, `rounded-lg`, `shadow-elev-3`, max width 480px (confirmations) or 640px (export).
  Use them **only** for destructive confirmations (Reset all, Delete) and for export configuration. No interruptions otherwise.
- Toasts: bottom-right, used for completion and failures of background work. They never hold primary information that disappears.
- Progress: determinate bars whenever a total is known (upload, detection, export), labeled `done / total`, with
  failed counts in `danger`. Indeterminate spinners are used only for <2s unknown-duration waits.
- The status bar always shows the selected count and any active background task.

### B.15 Accessibility
- WCAG 2.2 AA target. All functionality is keyboard reachable. Visible focus everywhere.
- Semantic landmarks: `header`, `nav`, `main`, `aside` (panels), `footer`. One `h1` per page.
- Icon buttons carry `aria-label`. Sliders carry `aria-valuetext` with units (for example, "+0.50 EV").
- Live regions (`aria-live="polite"`) announce progress milestones and completion; errors use `assertive` sparingly.
- Canvas: crop frames and shapes are fully editable through numeric X/Y/W/H inputs, so the canvas is never the only path.
- Grid (`role="listbox"`, `aria-multiselectable`): the container holds focus and exposes the current tile through `aria-activedescendant`
  (the focused tile may not be mounted in a virtualized list). Arrows move focus (Up/Down jump one row), Home/End, PageUp/PageDown;
  **Space** toggles selection; **Enter** opens the image; **Shift+arrows** extend the selection from the anchor; **Ctrl/Cmd+A** selects all
  visible; **Escape** clears. Each tile is an `option` with `aria-selected` and an `aria-label` (file name, plus ", duplicate" when flagged).
- Respect `prefers-reduced-motion`. Never convey state by color alone; pair it with an icon or text.

### B.16 Responsive behavior
- Landing: fully responsive from 360px up (single column under 768px, nav collapses to logo + CTA).
- Editor: designed for ≥1280px. 1024–1279px uses minimum panel widths. Under 1024px the editor shows a clear
  "larger screen required" message with a link home instead of a broken layout.

---

## C. Application Architecture

### C.1 Technology stack (pinned, verified 2026-11-04 on Node 26.11.1 / npm 12.2.0)
| Area | Choice | Version | Notes |
|---|---|---|---|
| Runtime | Node.js | 26.11.1 | Provides built-in `node:sqlite` (stable, no flag) |
| Framework | Next.js App Router | 16.4.5 | Turbopack (default). Route handlers use `runtime = 'nodejs'` |
| UI | React / React DOM | 19.3.1 | |
| Language | TypeScript (strict) | 6.0.3 | TS 7.x rejected: `typescript-eslint` requires `<6.1.0` (ADR-008) |
| Styling | Tailwind CSS v4 (`@tailwindcss/postcss`) | 4.3.4 | CSS-first tokens via `@theme` |
| Components | shadcn/ui sources on `radix-ui` | radix-ui 1.8.x | Copied into `src/components/ui` and token-aligned (ADR-010) |
| Animation utilities | tw-animate-css | 1.x | Enter/exit utilities used by shadcn primitives |
| Panels | react-resizable-panels | 4.18.x | v4 API: `Group` / `Panel` / `Separator`; numeric sizes are px |
| Icons | lucide-react | 1.x | 1.x renamed some icons (for example, `Loader2` → `LoaderCircle`) |
| Formatting | Prettier | 3.x | `singleQuote`, `printWidth: 120`, `trailingComma: all` |
| Canvas | konva + react-konva | 10.9.1 / 19.3.2 | Phase 3 |
| Face detection | @mediapipe/tasks-vision (BlazeFace short-range) | 1.2.2 | WASM and model self-hosted under `public/` (Phase 3) |
| Server imaging | sharp (libvips 8.18) | 0.35.5 | Prebuilt binaries, verified on Node 26 |
| State | zustand | 5.x | Phase 2+ |
| Validation | zod | 4.x | API input validation (Phase 2+) |
| Virtualization | @tanstack/react-virtual | 3.x | Phase 2 |
| ZIP | yazl (streaming, ZIP64) | 3.3.1 | Export archive writer |
| Worker runtime | tsx + Node worker_threads | 4.23.15 | Dedicated process and persistent render threads |
| Environment loader | @next/env | 16.4.5 | Worker reads the same environment files as Next.js |
| Jobs DB | `node:sqlite` (WAL) | built-in | ADR-003 |
| Lint | ESLint 9 flat config + eslint-config-next 16 | 9.39.5 | ESLint 10 rejected: eslint-plugin-react peers `^9.7` max. 9.x is on npm's `maintenance` tag (ADR-008) |
| Unit/Component tests | Vitest 5 + jsdom + Testing Library | 5.1.0 | |
| E2E | Playwright | 1.64.x | |

### C.2 Directory structure

```text
facestudio/
├── SKILLS.md · CLAUDE.md · README.md · AGENTS.md
├── src/app/                         # Landing/editor; thin API adapters
│   └── api/                         # health, session, images, edits, detections, jobs, artifacts
├── src/components/{ui,brand}/       # Shared primitives and logo
├── src/features/
│   ├── landing/ · editor-shell/ · upload/ · image-library/
│   ├── canvas/ · adjustments/ · cropping/ · face-detection/
│   └── export/                      # Options, progress, polling/recovery, cancel/retry/download
├── src/stores/                      # library, upload, edit, detection, export
├── src/lib/                         # Pure geometry, cropping/output, adjustment kernel, schemas/API clients
│   └── export/                      # Archive naming/collisions and HTTP byte-range parsing
├── src/workers/                     # Browser adjustment worker and protocol
├── server/
│   ├── config.ts · context.ts · http.ts · errors.ts · health.ts
│   ├── db/ · session/ · storage/ · images/ · edits/ · detections/
│   ├── jobs/                        # Snapshot repository, leases/queue, ZIP, cleanup, download
│   ├── processing/render.ts         # Original → oriented crop → resize → adjust → pad → encode
│   └── worker/                      # Dedicated scheduler and persistent renderer thread pool
├── public/                         # Local sample images/fonts, MediaPipe runtime/model, classic detection worker
├── scripts/                        # Setup, supervised web/worker launch, visual review
├── tests/{unit,integration,e2e}/    # Pure logic, real storage/render/ZIP, browser workflows
└── .data/                          # Ignored: SQLite, originals, previews, outputs, archives
```

`npm run dev` and `npm start` run both the web process and export worker through `scripts/run.mjs`.
The worker can also be run separately with `npm run worker` when the web process is managed independently.

### C.3 Client/server responsibilities
| Concern | Client (browser) | Next.js server (route handlers) | Batch worker process |
|---|---|---|---|
| File selection, quick signature sniff | ✔ | | |
| Upload (bounded concurrency, retry) | ✔ | Receives a stream, enforces limits, validates, stores | |
| Authoritative validation and decode limits | | ✔ (sharp `limitInputPixels`, magic bytes) | ✔ (re-checks at decode) |
| Thumbnail and preview renditions | | ✔ (sharp, at upload) | |
| Face detection (MediaPipe) | ✔ (Web Worker, on `thumb` rendition) | Persists results | |
| Crop framing math (portrait/face) | ✔ (pure functions in `src/lib`) | Validates rects | Executes rects |
| Edit state (source of truth) | Mirror + optimistic edits + history | ✔ Persisted in SQLite | Reads snapshot at job creation |
| Live adjustment preview | ✔ (shared kernel in a Web Worker) | | |
| Full-resolution export | | Creates the job (snapshot) | ✔ sharp + shared kernel + ZIP |
| Progress | Polls job status | ✔ Reads job rows | Writes job/item rows |
| Download | Browser download | ✔ Streams the artifact with Range support | |
| Cleanup | | ✔ Expired-session sweeper (on request + timer) | ✔ Temp files per item |

### C.4 Component boundaries
- `src/app/**`: routing, metadata, and composition only. No business logic.
- `src/features/<feature>/`: UI components and feature hooks. A feature may import from `components/`, `lib/`,
  `stores/`, and `types/`. A feature **must not** import another feature's internals; it goes through the target
  feature's `index.ts` public exports, or the shared logic moves to `lib/`.
- `src/components/ui`: presentation primitives only, with no app state.
- `src/lib/**`: pure TypeScript with no React, DOM, or Node APIs (except where a file is suffixed `.browser.ts` / `.node.ts`).
  This code is imported by the client **and** the server/worker. Correctness-critical math lives here.
- `server/**`: Node-only (fs, sharp, sqlite). Imported by route handlers and the worker. Never imported by client code.
  Server modules start with `import 'server-only'` when they are reachable from Next.js.

### C.5 State management (Zustand, Phase 2+)
- `useLibraryStore` (`src/stores/library-store.ts`, implemented): `images` by id, `order` (natural-sorted ids), `sortKeys`, `selection`
  (`ReadonlySet<ImageId>`), `anchorId`, `activeId`, `query`, `duplicatesOnly`, `loadState`, and the server-provided `limits`. Selection rules
  are pure functions in `src/lib/library/selection.ts`; ordering in `src/lib/library/sort.ts`.
- `useUploadStore` (`src/stores/upload-store.ts`, implemented): run counters (`total/done/failed/cancelled/skipped`) and a capped failure list.
  The queue itself lives in `features/upload/upload-manager.ts` (module state), not in React state.
- `useEditStore` (`src/stores/edit-store.ts`): sparse `edits` by image id (`{ adjustments, crop, output }`), `undoStack` / `redoStack` of logical before/after edit patches (200 operations maximum), the open gesture, dirty IDs, sync state, and transient comparing flag. Slider/crop gestures commit one history step; apply-to-selected/all is one step; removal prunes history. Only small instructions are retained, never pixels or object URLs.
- `useExportStore`: the latest server-owned export job; restores through `GET /api/jobs` on mount and polls active jobs. No pixels or durable job state in browser storage.
- `useUiStore` (planned; current view state is component-local): transient UI (zoom, pan, tool, before/after, panel toggles). Never persisted to the server.
- Components subscribe with **narrow selectors** (`useStore(s => s.byId[id]?.status)`) and use `useShallow` for multi-field picks.
- Persistent edit state syncs through a debounced validated batch `PATCH`. Per-image optimistic-concurrency versions remain deferred (ADR-014). Export snapshots current instructions independently of that debounce.
- Transient state (drag in progress, hover, zoom) never enters history or the server.

### C.6 Image-processing architecture
**Coordinate space (ADR-007):** All crop and face geometry is stored in **oriented original pixel space**, the
original image after EXIF orientation is applied (sharp `.rotate()` with no arguments). `SourceImage.width/height` are oriented
dimensions. Renditions (`thumb`, `preview`) are uniform downscales of that oriented image, so mapping is a single scale factor
`s = rendition.width / source.width` (equal for x and y within rounding; mapping uses per-axis factors to be exact).

**Renditions (generated at upload by sharp):**
| Name | Long edge | Format | Purpose |
|---|---|---|---|
| `thumb` | ≤384px | WebP q78 | Library grid **and** face-detection input (ADR-009) |
| `preview` | ≤2048px | WebP q88 | Editor canvas and live adjustment preview |
| `original` | as uploaded | as uploaded | Export only. Never sent back to the browser |

**Adjustment kernel (shared, ADR-004).** One pure function in `src/lib/image-processing/` processes RGBA/RGB 8-bit buffers.
The client runs it on preview pixels in a Web Worker. The server runs it on full-resolution raw pixels from sharp.
CSS filters are **not** used for adjustments.

Specification (`src/lib/image-processing/adjustment-spec.ts` holds ranges and defaults):

| Control | Range | Step | Default | Definition |
|---|---|---|---|---|
| Exposure | −3.00…+3.00 EV | 0.01 | 0 | Linear-light gain `g = 2^EV` |
| Temperature | −100…+100 | 1 | 0 | Linear-light white balance: `r = 2^(+0.35·t)`, `b = 2^(−0.35·t)`, `t = T/100` (+ = warmer) |
| Tint | −100…+100 | 1 | 0 | Linear-light: `g = 2^(−0.30·u)`, `u = Tint/100` (+ = magenta, − = green) |
| Saturation | −100…+100 | 1 | 0 | Linear-light: `c' = Y + k·(c − Y)`, `k = 1 + S/100`, `Y = 0.2126R + 0.7152G + 0.0722B` |
| Brightness | −100…+100 | 1 | 0 | sRGB-encoded tone curve `y = x^(2^(−0.8·b))`, `b = B/100`; black and white points fixed |

White-balance gains (temperature × tint) are **normalized** so `0.2126·gR + 0.7152·gG + 0.0722·gB = 1`, which means neutral
luminance is preserved and WB changes hue, not exposure.

**Operation order (fixed):**
1. Decode sRGB 8-bit → linear float (256-entry LUT, IEC 61966-2-1 transfer function).
2. Per-channel gain = exposure gain × normalized WB gain.
3. Saturation around Rec.709 luminance (linear).
4. Clamp each channel to [0, 1] (hard clip; no highlight roll-off in MVP).
5. Encode linear → sRGB (65,536-entry LUT on the clamped linear value).
6. Brightness tone curve on the encoded value, folded into the same encode LUT.
7. Round to 8-bit. Alpha passes through untouched.

**Fast paths:** all defaults → no pixel pass at all (pure crop/resize). Saturation = 0 → fully separable per-channel 256-entry LUT.

**Color-space assumptions:** processing assumes sRGB. sharp converts inputs with embedded ICC profiles (and CMYK) to sRGB on decode.
Outputs are sRGB and carry no ICC profile. 16-bit PNGs are processed at 8 bits per channel. Grayscale inputs are expanded to RGB when
any adjustment is non-default.

**Precision:** LUTs use `Float32Array` (decode) and `Uint8Array` (encode, 65,536 entries ≈ 1.5×10⁻⁵ linear step, finer than one
8-bit sRGB code value at the darkest level). Output is deterministic for identical inputs across client and server because the same code runs.

**Implemented (Iteration 3):** `src/lib/image-processing/adjust-kernel.ts` is exactly the pipeline above (LUT-based; saturation = 0 uses a per-channel 256-entry
table; all-default is a no-op; alpha is never touched; the encode LUT is cached per brightness value, 8 entries). It has no DOM or Node dependency, so the
the export renderer imports the same file (Iteration 6). **Live preview:** `src/workers/adjust.worker.ts` keeps ONE pristine source (the open image's `preview` rendition,
downscaled to a 1600 px long edge), renders each request from a fresh copy (adjustments never accumulate), and returns an `ImageBitmap`. `preview-client.ts`
sends one render at a time and keeps only the newest waiting request ("latest wins"), so dragging never builds a backlog. Loads are correlated by id
(see Iteration 3, bug 2). Limitation: the worker reads pixels with `getImageData`, which un-premultiplies alpha, so previews of semi-transparent images are
approximate; opaque images are exact.
**Measured kernel cost** (Node 26, 1600×1067 = 1.71 MP, 25 runs): separable fast path median 3.7 ms (p95 7.3 ms); all five adjustments with saturation median
37.4 ms (p95 43.9 ms). This is the pixel math only; the full in-browser slider-to-frame latency (copy, `putImageData`, bitmap transfer, draw) is **not** measured yet.

**Preview/export consistency:** export order is *orient → extract crop → resize → adjust → pad → encode*. The preview is
*preview rendition → (crop shown as overlay) → adjust*. Adjustments are per-pixel, so the only expected difference is resampling.
Tests assert per-channel mean absolute difference ≤ 2/255 between "adjust then downscale" and "downscale then adjust" on fixtures.

### C.7 Face-detection architecture — **Implemented** (Iteration 5)
- MediaPipe `FaceDetector` (BlazeFace short-range, float16, model id `FACE_MODEL_ID`) runs in a **classic Web Worker**, `public/workers/face-detection.worker.js`,
  not a module worker (ADR-017). The WASM runtime and model are self-hosted under `public/mediapipe/` (copied or downloaded by `scripts/setup-mediapipe.mjs`, run by
  `predev` and `prebuild`; the directory is git-ignored). There are no third-party requests at runtime. CSP allows `worker-src 'self' blob:` and `wasm-unsafe-eval`.
- Input: the `thumb` rendition (≤384 px). The model letterboxes to 128×128, so larger inputs add cost but no accuracy (ADR-009).
- Output per face: box, score, and keypoints, converted to **oriented original px** (`src/lib/face-detection/convert.ts`). Score threshold `FACE_MIN_CONFIDENCE` = 0.5.
  Zero faces → status `no_face`; a crop is never forced. Detection only: there is no recognition or identification anywhere.
- `DetectionManager` (`features/face-detection/detection-manager.ts`) is a sequential queue with `Set` dedupe, an in-flight guard, priority for the open image,
  and progress. `useBackgroundDetection` runs it for every library image that has no result for the current model id, and the status bar shows progress.
- Results persist per image **and model id** in the `detections` table (migration 3) through `GET`/`PUT /api/detections`; a stored result for the current model is
  never recomputed. A different model id invalidates old results. Face boxes are clamped to the real image size on the server.
- Failure modes handled: model files missing → status "unavailable" (Custom crops still work); a worker error fails that image only.
- Limitations: the short-range model targets faces that fill a meaningful part of the frame. Small faces in wide or group shots may be missed. It does not detect hair
  or shoulders. **Detection quality on real photographs is unverified**: the only real-model checks use one illustrated (synthetic) face. Setup needs network access once
  to fetch the model if it is not already in `public/mediapipe/`.

### C.8 Batch-processing architecture — **Implemented** (Iteration 6)
- SQLite/WAL tables `jobs`, `job_items`, `artifacts` (migration 4) share the configured `FS_STORAGE_DIR/facestudio.db` with sessions/images/edits/detections.
- `POST /api/jobs` accepts the chosen images and their current edit instructions, including changes still awaiting autosave. It validates ownership, clamps instructions, and snapshots metadata/edits/filenames transactionally. Later edits never change queued exports. One active export per session; one crop per image (ADR-020).
- A **dedicated Node process** (`server/worker/main.ts`, `node --conditions=react-server --import tsx`) polls at 250 ms. It uses persistent `worker_threads` for full-resolution decoding, pixel math, and encoding; the web process never renders exports. Concurrency is capped by configuration, CPU count, and a conservative pixel-memory estimate (20% of total RAM, 12 bytes per configured maximum pixel; at least one slot).
- Items are claimed atomically with a random attempt token, a 60-second lease, and attempt count. Leases renew every 20 seconds. Stale attempts cannot commit over newer attempts, and each attempt uses a unique output key. Abandoned leases requeue up to `FS_MAX_ATTEMPTS`; failed render attempts retry automatically to that cap.
- Cancellation stops claiming queued work, cancels queued items, lets active items finish, then marks the job cancelled. Cancellation during packaging prevents artifact publication. A failed image does not discard successful exports.
- Completed items are streamed lazily into a STORE ZIP with yazl; ZIP64 is automatic. Packaging has its own leased token/heartbeat to prevent duplicate or stale publication. The artifact records byte count, file count, hash, and expiry.
- `POST /api/jobs/:id/retry` resets failed items and keeps successes. A packaging-only failure can re-render/repackage the job. The prior archive is invalidated before retry; final ZIP includes all successes.
- `GET /api/jobs` restores the latest job for the session; `GET /api/jobs/:id` returns status/counts/phase/artifact and up to 100 failed filenames/messages. The UI polls active jobs once per second, retries polling on connection failure, and permits closing the dialog or reloading without stopping work.
- `scripts/run.mjs` starts web and worker together, restarts an interrupted worker, and handles shutdown by explicit child process handles. `@next/env` makes worker `.env*` settings match the web app. Migration version checks run under an IMMEDIATE transaction so simultaneous web/worker startup cannot race a stale schema version.

### C.9 Storage strategy
- `StorageDriver` (`server/storage/local-driver.ts`, implemented): `writeFile(key, buffer)`, `adopt(localPath, key)` (move a finished temp file in),
  `read(key, optionalRange)`, `stat(key)`, `delete(key)`, `deletePrefix(prefix)`, `createTempPath()`, `sweepTemp(maxAgeMs)`.
- MVP driver: local disk under `FS_STORAGE_DIR` (default `./.data/storage`): `facestudio.db` (SQLite), `files/` (stored objects), `tmp/` (uploads in
  progress). Keys are **server-generated** (`sessions/<sid>/originals/<imageId>`, `sessions/<sid>/renditions/<imageId>.{thumb|preview}.webp`;
  `…/jobs/<jobId>/out/<itemId>-<attemptToken>` and `…/artifacts/<artifactId>.zip`). User filenames never become paths. Keys are also validated
  (`/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/` per segment, resolved path must stay under the root) as defense in depth.
- Production with multiple hosts requires an object-storage driver (S3-compatible). It is not implemented in the MVP; the interface keeps the call sites stable.
- Retention (implemented for sessions): a session idle for more than `FS_SESSION_TTL_HOURS` (24h) is deleted with all its files. The sweep is started when a
  session is created and by the worker’s maintenance loop, throttled to once per 10 minutes. The worker therefore also cleans up idle sessions without a new visitor.
  Interrupted uploads leave temp files that are removed when older than 1 hour, at server start. `DELETE /api/session` removes all of the caller's data
  immediately (the editor UI for it is not built yet). The export worker sweeps expired artifacts and completed job outputs at a bounded cadence (once per minute, 50 rows per pass), and also triggers throttled idle-session cleanup. Download expiry is checked on every request even before a sweep.

### C.10 Export pipeline — **Implemented** (Iteration 6)
Per output item: `sharp(original, { limitInputPixels, failOn: 'error', sequentialRead: true })` → `.rotate()` (EXIF orient) →
`.extract(cropRect)` → resize per `OutputSettings` → raw pixels → shared kernel (skipped when neutral) → antialiased circle/hexagon alpha mask (ADR-026) → pad (`.extend`) if `fit = pad` →
encode (`jpeg` mozjpeg, `png`, `webp`) → write under the session’s `jobs/<jobId>/out/`, with an attempt-specific storage key. Output pixel area is bounded by `FS_MAX_IMAGE_PIXELS` as well as `FS_MAX_OUTPUT_SIDE`.
PNG/WebP retain shape transparency; JPEG output flattens alpha onto `padColor` (default white). Shape masking preserves source alpha. Cover trims the original mask with its pixels; Stretch distorts both. Padding is added after masking and is not adjusted. The ZIP is built by streaming completed outputs with **yazl** (STORE, no recompression,
ZIP64 automatic) into a durable artifact file. Download: `GET /api/artifacts/:id/download` with `Content-Length`, `Content-Disposition`,
`Accept-Ranges: bytes`, and `Range` support for resumable transfers.
Filenames: template tokens `{name}` (sanitized original basename), `{n}` (crop index, 1-based), `{w}`, `{h}`, `{mode}`. Default `{name}` for one crop and
`{name}_{n}` for several. Collisions inside an archive get `_2`, `_3`, and so on. Folder structure is preserved optionally (sanitized relative paths).

### C.11 Error handling
- Server: typed `AppError { code, message }` with an `httpStatus` derived from the code (`server/errors.ts`, implemented). `withErrors()` in
  `server/http.ts` maps errors to `{ error: { code, message } }` JSON. Unknown errors become `500 internal_error`; only the error class and message are
  logged (never bodies, file names, or paths).
- Error codes (stable): `unsupported_type`, `file_too_large`, `dimensions_exceeded`, `pixel_limit_exceeded`, `batch_limit_reached`,
  `batch_bytes_exceeded`, `animated_not_supported`, `decode_failed`, `not_found`, `forbidden`, `invalid_request`, `conflict`, `job_not_cancellable`, `internal_error`.
- Per-image failures are stored on the image or job item (`errorCode`, `errorMessage`) and surfaced in the library (badge) and the export error list.
- Client: API calls go through `apiRequest` (`src/lib/api/client.ts`, implemented), which validates responses with zod and returns `Result<T, ApiError>`
  (client-side codes: `network_error`, `aborted`, `invalid_response`, `http_error`). Background failures become toasts plus persistent indicators
  (toasts are not built yet: upload failures use the failure panel and status bar).
  React error boundaries wrap the canvas and panels so a canvas crash does not take down the library.

---

## D. Engineering Rules

### D.1 TypeScript
- `strict: true`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax`, `erasableSyntaxOnly`.
- No `enum` or `namespace`. Use `as const` objects and string-literal unions.
- No `any`. Use `unknown` plus narrowing. A justified exception needs `// eslint-disable-next-line … -- reason`.
- Validate all external input (HTTP bodies, query params, headers, `localStorage`, worker messages) with zod or explicit guards.
- Domain types live in `src/types/`. API request and response types are inferred from zod schemas co-located with the route's server module.
- Prefer `type` aliases. Use `interface` only for declaration merging.

### D.2 Naming
- Files: `kebab-case.ts(x)`. Components: `PascalCase`. Hooks: `useCamelCase`. Stores: `useXStore`. Constants: `SCREAMING_SNAKE_CASE` for true constants.
- IDs: prefixed random IDs: `img_`, `job_`, `itm_`, `art_`, `ses_`, `crp_`, followed by 22 base64url chars from `crypto.randomBytes(16)` (no `nanoid` dependency; see `newId` in `server/session`).
- Booleans: `is/has/can/should` prefixes. Event handlers: `onX` props, `handleX` internals.
- Units in names when ambiguous: `widthPx`, `durationMs`, `exposureEv`, `maxBytes`.

### D.3 Components
- One exported component per file (small private subcomponents allowed). Keep components under about 200 lines; extract hooks for logic.
- Server Components by default. Add `'use client'` only at interactive leaves.
- No data fetching in deeply nested components. Feature-level hooks own fetching and side effects.
- Every interactive component handles hover, focus-visible, disabled, loading, and error states (§B.9).

### D.4 Reusable hooks and utilities
- Shared hooks live in `src/hooks/` only when used by two or more features. Otherwise keep them inside the feature.
- `cn()` (`src/lib/utils.ts`) merges classes. Its `tailwind-merge` configuration registers the custom `ui-*` and `display-*` scales as font sizes so text color utilities never remove them. Do not hand-concatenate conditional class strings.
- Geometry (rects, clamping, aspect fitting, coordinate mapping) is centralized in `src/lib/coordinates/` and must be unit tested.

### D.5 State mutation rules
- Zustand updates are immutable (spread, or `structuredClone` for deep edits). Never mutate state objects in place.
- Every persistent edit goes through an **operation** (`applyOperation(op)`) that records a history patch
  `{ imageId, before, after }[]` and marks images dirty. Components never write persistent edit state directly.
- Continuous gestures (slider drags, crop drags) update a transient draft and commit a single operation on release.
- History stores small edit-state patches only. **Never** store pixels, blobs, or object URLs in history. Cap: 200 operations.

### D.6 API conventions
- REST under `/api`. JSON bodies, except image upload (raw `application/octet-stream` body, metadata in headers).
- Every handler exports `runtime = 'nodejs'`. Handlers are thin adapters: parse → authorize (session) → call `server/` → serialize.
- Mutating requests (`POST/PUT/PATCH/DELETE`) must pass a same-origin check (`Origin` host must match `Host`), plus the session cookie.
- Every resource lookup is scoped `WHERE session_id = ?`. A missing or foreign resource returns **404** (no existence oracle).
- Lists paginate with an opaque cursor (pages of 500).
- **Implemented:** `GET /api/health`; `POST /api/session` (create-or-get, idempotent); `DELETE /api/session` (delete all of the caller's data);
  `GET /api/images?cursor=` (list + the server's effective `limits`; never creates a session); `POST /api/images` (raw body, headers
  `x-fs-filename` and optional `x-fs-relative-path`, both percent-encoded); `DELETE /api/images` (`{ ids }`; foreign ids are ignored);
  `GET /api/images/:id/{thumb|preview}` (private, immutable, WebP; originals are never served); `GET /api/edits` (the caller's non-default
  adjustments by image id); `PATCH /api/edits` (`{ items: [{ id, adjustments }] }`, up to the batch limit, ranges validated from the shared spec;
  neutral values clear the image's edit; foreign or unknown ids are ignored).
- **Detections (Iteration 5):** `GET /api/detections` (the caller's cached results by image id) and `PUT /api/detections` (`{ items: [{ id, result }] }`; face boxes clamped to the real image; foreign ids ignored).
- **Export (Iteration 6):** `POST /api/jobs`, `GET /api/jobs` (latest), `GET /api/jobs/:id`, `POST /api/jobs/:id/{cancel|retry}`, and `GET`/`HEAD /api/artifacts/:id/download` (private, expiring, resumable).
- Contracts live in `src/lib/api/schemas.ts` (zod) and are shared by route handlers and the browser client.

### D.7 Image memory management (browser)
- Never decode originals in the browser. The grid uses `thumb`; the canvas uses `preview`.
- `<img loading="lazy" decoding="async">` in the grid. Only virtualized rows (visible + overscan) are in the DOM.
- `ImageBitmap`s are `.close()`d when replaced. Object URLs are `URL.revokeObjectURL`'d on unmount or replace.
- Konva nodes and layers are destroyed on unmount. The canvas keeps at most the active preview plus one prefetched neighbor (LRU, 2 entries).
- Preview pixel buffers for the adjustment worker are transferred (`postMessage(…, [buffer])`), not copied.
- `File` objects are released from the upload queue as soon as their upload completes or fails permanently.

### D.8 Performance requirements (targets, verified in Phase 7)
- Main thread: no long task over 100ms during import of 3,000 files; slider-to-frame latency ≤ 50ms at preview resolution (p95).
- Grid: DOM thumbnail count bounded by visible rows + overscan (≤ ~60 cells), regardless of batch size.
- Browser JS heap growth bounded (target < 400MB at 3,000 images).
- Next.js server: event-loop lag p99 < 100ms during concurrent uploads. All sharp work is async (libuv pool).
- Worker: memory bounded by concurrency, with throughput recorded per dataset in §E-13.
- Benchmarks are recorded with hardware, dataset, settings, runtime, memory, failure rate, and throughput. **Never invented.**

### D.9 Testing requirements
- `npm test` (Vitest): unit tests for **all** `src/lib/**` logic (geometry, framing, adjustments, validation, filenames) and component tests
  (Testing Library) for interactive controls (sliders, numeric inputs, selection).
- `npm run test:e2e` (Playwright, system Chrome): route smoke tests, plus upload → edit → export flows as they land.
- `tests/performance/`: scripted benchmarks over generated fixtures (1 / 100 / 1,000 / 3,000 images).
- Deterministic fixtures are generated by scripts (sharp-synthesized gradients, color patches, EXIF-rotated samples), not downloaded photos of real people.
- A feature is not complete without tests for its correctness-critical logic.
- Test environment notes:
  - Vitest uses jsdom by default. Server modules opt into Node with a `// @vitest-environment node` docblock.
  - `server-only` is aliased to `tests/stubs/server-only.ts` in Vitest (the real package throws outside React Server Components).
  - `tests/setup.ts` stubs `ResizeObserver` (missing in jsdom, required by react-resizable-panels). Stub only what jsdom lacks; never stub app behavior.
  - Playwright `webServer` reuses a server already on :3100 outside CI. To test the production build, run `npm run build && npm start`
    first, then `npm run test:e2e`. Phase 1 verified both modes.
  - E2E specs assert a clean browser console (no errors, no hydration warnings).
  - Each Playwright run uses its own storage directory (`FS_E2E_STORAGE`, default `.data/e2e/<timestamp>`) passed to the dev server; `global-setup.ts`
    removes earlier runs' directories. To test the production build, start `next start` with the same `FS_STORAGE_DIR` and run Playwright with
    `FS_E2E_STORAGE` set to it (otherwise setup would delete the server's directory).
  - `tests/integration/` runs the real ingest pipeline (sqlite, sharp, disk) in a temp directory with an injected `ServerContext`; no mocks.
  - Fixtures are synthesized by `tests/fixtures/images.ts`. A fixture must be verified to be what it claims: the animated-WebP fixture once silently produced
    a still image (`pageHeight` must be inside `raw`, and frames must differ), so a guard test asserts `pages === 2`.
  - Playwright `setInputFiles` rejects in-memory buffers over 50 MB total; write large fixtures to disk and pass paths.
  - E2E helpers must wait for **decoded** images (`naturalWidth > 0`) before reading dimensions; reading them on `visible` is a race.
  - Identical fixture bytes are (correctly) flagged as duplicates. Give each fixture distinct content unless a duplicate is the point.
  - **Pixel assertions** use flat-color fixtures and an independent reference written from the §C.6 formulas inside the test (not the kernel's own tables),
    read back from the rendered canvas with a ±3 tolerance for JPEG/WebP rounding. Wait with `expect.poll`: the worker renders asynchronously.
  - A worker can be unit-tested with a fake `Worker` whose replies the test releases by hand (`preview-client.test.ts`), which reproduces ordering that only
    shows up under load. **Mutation-check new regression tests**: break the fix on purpose and confirm the test fails.
  - Browser parallelism is capped at 4 locally / 2 in CI: every Chrome context loads a WASM detector, and 10 parallel contexts exhausted the 16 GiB host and swap in Iteration 6.
  - Next 16 allows ONE `next dev` per project directory, and Playwright reuses whatever is on :3100. If a dev server is already running, e2e data lands in
    that server's storage (isolated sessions, swept after 24 h). To test the **production** build without disturbing a running dev server, build and serve a
    throwaway hard-linked copy (`cp -al node_modules`) on another port with `FS_E2E_PORT` and `FS_E2E_STORAGE` set, then delete it. Never run `next build` in the
    directory of a running dev server.
  - A long-running dev server caches its database connection across hot reloads; `getContext()` re-runs migrations when the schema version changed, and
    `db-migrations.test.ts` covers the upgrade path.

### D.10 Security requirements
- Detection only, with no recognition, embeddings, or identity matching. No face crops are logged or retained beyond the session.
- Never log image bytes, filenames, or relative paths (they may contain personal names). Log IDs and error codes only.
- Upload validation: magic bytes (JPEG `FF D8 FF`, PNG `89 50 4E 47 0D 0A 1A 0A`, WebP `RIFF????WEBP`) plus a sharp metadata probe. Size is enforced while streaming.
- Decompression-bomb protection: `limitInputPixels = FS_MAX_IMAGE_PIXELS`, per-side dimension cap, and animated/multi-page inputs rejected.
- Storage keys are server-generated, so user input is never part of a path (path traversal is impossible by construction). Display names are sanitized.
- Files are served only through session-checked route handlers with `Cache-Control: private`. Nothing user-uploaded lives under `public/`.
- Session: random 256-bit token in an `HttpOnly`, `SameSite=Lax`, `Secure` (production) cookie. The DB stores only `sha256(token)`.
- Response headers (next.config): `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `X-Frame-Options: DENY`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, and a CSP restricting sources to `'self'`
  (plus `blob:`/`data:` images, `'wasm-unsafe-eval'` for MediaPipe; `'unsafe-eval'` only in development).
- The landing page makes **no** privacy or security claims beyond what is implemented and verified.

### D.11 Dependency management
- npm with a committed `package-lock.json`. Exact versions (`save-exact`) for runtime-critical packages: next, react, react-dom, sharp,
  konva, react-konva, @mediapipe/tasks-vision, typescript.
- Before adding a dependency, check whether the platform or an existing dependency covers the need. Record notable additions in §F.
- Verify peer ranges (`npm view <pkg> peerDependencies`) before upgrades. Never use `--force` or `--legacy-peer-deps` to hide conflicts.
- Next.js 16 changed APIs and conventions (for example, `middleware` → `proxy`, `next lint` removed, Turbopack by default). Before using a Next.js API,
  check the version-matched docs bundled at `node_modules/next/dist/docs/` rather than relying on memory.

### D.12 Configuration and limits
All limits live in `src/lib/config/limits.ts` (defaults) and can be overridden server-side via environment variables (see `.env.example`).

| Limit | Env var | Default |
|---|---|---|
| Max images per batch | `FS_MAX_BATCH_IMAGES` | 3,000 |
| Max bytes per file | `FS_MAX_FILE_BYTES` | 50 MiB |
| Max total batch bytes | `FS_MAX_BATCH_BYTES` | 15 GiB |
| Max pixels per image (decode) | `FS_MAX_IMAGE_PIXELS` | 100,000,000 |
| Max side length | `FS_MAX_IMAGE_SIDE` | 20,000 px |
| Max output side | `FS_MAX_OUTPUT_SIDE` | 16,383 px (WebP limit) |
| Min crop side | — | 16 px (or the image side, if smaller) |
| Client upload concurrency | — | 4 |
| Worker concurrency cap | `FS_WORKER_CONCURRENCY` | 4 |
| Item max attempts | `FS_MAX_ATTEMPTS` | 3 |
| Session idle TTL | `FS_SESSION_TTL_HOURS` | 24 |
| Artifact TTL | `FS_ARTIFACT_TTL_HOURS` | 24 |
| Storage root (DB, files, temp) | `FS_STORAGE_DIR` | `./.data/storage` |

Limits are enforced **twice**: the server is authoritative (`server/images/ingest.ts`); the browser pre-checks size, signature, and batch capacity to
avoid pointless requests. The browser learns the effective limits from `GET /api/images` (`limits`), so an operator's overrides are honored in the UI.
Malformed limit env vars fail startup of the first request instead of silently weakening a safety limit.

### D.13 Commands
| Command | Purpose |
|---|---|
| `npm run dev` | Supervised Next.js dev server on **port 3100**, plus export worker |
| `npm run build` / `npm start` | Production build / supervised web and export worker on 3100 |
| `npm run worker` | Standalone export worker (for independently managed web processes) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (flat config) |
| `npm run format` / `npm run format:check` | Prettier write / check |
| `npm test` | Vitest (unit + component) |
| `npm run test:e2e` | Playwright (starts the dev server automatically, or reuses one on :3100) |

Process hygiene: stop servers by **explicit PID** only. Never use `pkill`/`killall` patterns.
Other local projects (and open browser tabs from earlier runs) may be using port 3100: check `ss -ltnp` before starting a server, and use another port
for ad-hoc runs. Observed dev-server gotcha: `next dev` reload-looped endlessly when its stdout was redirected into a file inside the same directory tree
as an out-of-project `FS_STORAGE_DIR`; moving the log elsewhere fixed it (uploads into that storage dir caused no reloads). The default `.data/` inside the
project has never shown this. Why that tree was watched was not investigated.

---

## E. Feature Specifications

Status legend: **Planned**, **In progress**, **Implemented** (verified), **Blocked**.

### E-1 Landing page (`/`) — **Implemented** (UI refreshed, Iteration 4)
- Sticky brand/navigation bar, anchor links to Features and How It Works, and Get Started (`/editor`). Mobile shows the logo and action.
- Centered, two-line prescribed headline and supporting copy, one primary CTA, a text Explore Features link, and a photographic sample workspace.
- `AppPreview`: noninteractive `role="img"`, labelled as an illustration/sample project; contact sheet, framed portrait, and adjustment controls. Side panels hide on mobile.
- `CropExplorer`: three real toggle buttons (Portrait / Headshot, Face-only, Custom bounding box), mutually exclusive `aria-pressed`, distinct illustrative frames and aspect labels, and a polite live description. It demonstrates framing without running detection or editing user data.
- Features: crop explorer and explanation; face-detection photo and adjustment-control pair; horizontal batch contact sheet.
- Workflow: Upload, Detect, Crop, Adjust, Export; Export describes the real full-resolution ZIP flow (Iteration 6).
- Final crop-corner CTA, functional footer navigation, and product note. No invented testimonials or scale metrics.
- Locally hosted WebP sample photos and Manrope display font. Asset sources and font license are included. `next/image` handles image sizing/lazy loading; hero portrait is preloaded.
- Motion: one preview entrance and framing transitions, disabled under reduced motion. No scroll-jacking, video intro, or generator/hosting dependency.
- **Claims rule:** copy describes product capabilities. It must not state performance numbers (for example, "3,000 images") or privacy guarantees
  until §H marks them verified. A unit test asserts that the page contains no "3,000"/"3000".
- **Claims register.** Every factual claim on the landing page must be true before release (verify in Phase 8):

  | Claim (paraphrased) | Section | Depends on | Status |
  |---|---|---|---|
  | Faces are detected automatically; multiple faces are selectable; each face can get its own crop | Detection | E-6 | Partly true: automatic detection and face selection verified (synthetic face, real model); "each face its own crop" (several crops per image) is **not built** |
  | Detection only; never identifies who people are | Detection, footer | Design (A.4, D.10) | True by design |
  | Images with no detectable face are flagged, not cropped blindly | Detection, workflow | E-6 | **True** (e2e, Iteration 5); real-photo detection rate unmeasured |
  | Crops are stored in original-image pixel coordinates | Cropping | ADR-007 | **True** (e2e: saved rect, clamped to the real image) |
  | Portrait framing keeps consistent headroom at a chosen aspect; manual adjustment | Cropping | E-6 | **True** (unit + e2e) |
  | Face-only crop with adjustable padding and face choice | Cropping | E-6 | **True** (unit + e2e) |
  | Custom box: draw, move, resize, exact X/Y/W/H, aspect lock | Cropping | E-6 | **True** (e2e, Iteration 5) |
  | Five controls, each with slider, numeric value, reset; exposure in stops in linear light; brightness keeps black/white points | Adjustments | E-7, §C.6 | **True** (unit + browser pixel tests, Iteration 3) |
  | Adjustments stored as instructions; preview and export run the same code | Adjustments / export | ADR-004 | **True** (shared kernel and decoded export-pixel tests, Iteration 6) |
  | Apply to one/selection/all; scope visible; face-aware crops recalculated per image | Bulk | E-8 | **True** for adjustments, crops, and output (e2e, Iteration 5) |
  | Every batch change undoable as a single step | Bulk | E-8 | **True** for adjustments, crops, and output (e2e) |
  | Full-resolution export with cropping, adjustments, output sizing, and ZIP | Workflow / editor | E-10 | **True** (render/ZIP and browser tests, Iteration 6); 3,000-image throughput unverified |
  | Cropping, resizing, padding, stretching are separate, explicit choices | Editor specification | E-9 | **True** (controls: Iteration 5; decoded export sizes/pad pixels: Iteration 6) |
  | Upload single images, multiple files, or a folder; JPEG/PNG/WebP | Workflow | E-3 | **True** (e2e-verified, Iteration 2) |
  | No account required | Final CTA | ADR-005 | True (no accounts exist) |
  | "Process thousands of photos" (prescribed hero copy) | Hero | E-13 | Pending: importing 3,000 small files is smoke-tested; detect/crop/export at that scale is not |

### E-2 Editor shell (`/editor`) — **Implemented** (Iterations 1, 4, and 6)
Toolbar: home/brand, static batch name, working undo/redo, and Export photos/progress. Three resizable, pixel-persisted panels (Library, Canvas, Edit) and the status bar show image/selection counts and actual upload/detection/export progress. Empty regions explain the next action and provide import controls. Under 1024px a larger-screen notice with a home link replaces the editor. A visually hidden `h1` names the page.

### E-3 Upload and ingestion — **Implemented** (Iteration 2)
**Entry points** (all feed one queue): *Add images* (multi-file picker, `accept` limited to JPEG/PNG/WebP), *Add folder* (`webkitdirectory`, keeps relative
paths), and drag-and-drop anywhere on the window (files and folders; folder entries are read recursively through `webkitGetAsEntry`). A drop overlay appears
only for drags that carry files. The primary actions appear in the library header **and** in the empty canvas, so a first-time user always finds them.

**Client queue** (`features/upload/upload-manager.ts`): files with unsupported extensions are skipped quietly (counted, not failures: folders contain junk). Each
remaining file is pre-checked (non-empty, ≤ the server's `maxFileBytes`, magic bytes), then uploaded as a raw `application/octet-stream` body (streamed by the
browser, never read into JS memory), **4 at a time**. The session is established **once** before the first parallel upload (ADR-012). Network errors, 5xx, and 429
retry up to 3 attempts with exponential backoff and jitter; validation errors (4xx) do not retry. Finished images are batched into the library every ~100 ms.
Files over the batch capacity are reported as one aggregated failure. The `File` handle is released when its job ends. **Cancel** (status bar) aborts in-flight
requests and drops queued files.

**Server pipeline** (`server/images/ingest.ts`): same-origin check → batch limits (count and bytes, re-checked inside the insert transaction so concurrent
uploads cannot overshoot) → stream to a temp file while counting bytes, hashing (SHA-256), and checking the magic bytes of the **first 12 bytes** → sharp header
probe (format must match the signature; pages > 1 rejected; side and pixel limits checked explicitly for accurate errors) → **one** decode (auto-oriented,
sRGB, ≤ 2048 px) → thumb (≤ 384 px, WebP q78) and preview (≤ 2048 px, WebP q88) encoded from that same raw buffer → original and renditions stored → row
inserted. Any failure removes the temp file and everything already written. Display names and relative paths are sanitized; identical content is flagged
(`duplicateOfId`), never rejected.

**Limitations (documented, not bugs):** progress is per file, not per byte. The queue is in memory, so a page reload abandons queued (not yet uploaded) files, while
images already stored persist. Cancelling can race a request the server already committed; that image appears after the next reload. APNG is not detected as animated
(sharp reads its first frame). 16-bit PNGs are rendered at 8 bits; embedded ICC profiles are converted to sRGB in the renditions only (originals are untouched).
A failed file cannot be retried from the failure list because its handle is released (§D.7); add it again.

### E-4 Image library — **Implemented** (Iteration 2)
Left panel (`features/image-library`): header count; *Add images* / *Add folder*; **search** by file name or relative path (deferred query, so typing stays
responsive); a **Duplicates** filter button that appears only when duplicates exist; **Select all / Select none** (visible images only); a live selected count;
**Remove** (destructive confirmation dialog, then `DELETE /api/images`, which also deletes the stored files); the upload-failure panel; and the **virtualized grid**
(§B.12). States: loading, load error with *Try again*, empty, and *No matching images*. Order is natural by relative path or name (`IMG_2` before `IMG_10`).
Selection: click selects one and opens it; Ctrl/Cmd+click toggles; Shift+click selects the range from the anchor within the visible order (Ctrl+Shift adds the
range); the hover checkbox toggles without changing the open image. Keyboard model in §B.15. The library is reloaded from the server on page load, so it survives
refreshes. The right panel shows the open image's **details**: name, folder, EXIF-oriented dimensions, format, size, applied rotation, transparency, duplicate flag.
*Not yet:* filters for failed/no-face/edited and per-image processing badges (they arrive with detection, cropping, and export).

### E-5 Canvas — **Implemented** (Iterations 5, 7, 8, 9, and 11)
A Konva stage (`features/cropping/crop-stage.tsx`) draws the open image's adjusted preview (§E-7, drawn from the worker's canvas, ≤ 1600 px long edge) with the crop overlay
(§B.13), face boxes, and the zoom bar. Konva is a **renderer only**: all hit-testing is pure functions in image coordinates (`src/lib/cropping/hit-test.ts`) driven by
DOM pointer events (ADR-018).
- **Zoom/pan:** wheel zooms at the cursor (the image point under the cursor stays put), `+`/`-` and the buttons zoom ×1.25, **Fit** (`F`), **1:1** (`1`, relative to
  original pixels), Space+drag pans. Scale is clamped to 2%–1600%. Whole-image Fit is the initial view; Auto zoom subsequently frames an existing crop. A manual zoom belongs to the image it was made on and remains until another crop change (ADR-023).
- **Crop gestures:** drag on the image draws a box (a plain click does not); drag inside moves it (never leaves the image, never resizes); the eight handles resize
  (the opposite edge or corner stays fixed; with a locked ratio the ratio is kept); each gesture is ONE undo step. Arrow keys nudge 1 px (Shift: 10); a held key is one step.
- **Escape (ADR-024):** while editing, Esc removes the active crop through the existing undoable removal action and ends any pointer drag. In Crop Preview, the first Esc returns to editing and preserves the crop; held-key repeats do not then remove it. Inputs, dialogs, library selection, and compare retain their own Escape behavior. Undo restores the removed crop.
- **Hold to compare** (button, or `\`) hides the overlay and shows the original; the button exists only for edited images (a crop counts as an edit).
- **Composition feedback (ADR-022):** highlighted handles, live crop dimensions, action hints, center magnets while moving (6 screen px, Alt bypass), and an undoable Center crop toolbar action. Rule-of-thirds guides can be kept visible with the toolbar or G. Mode icons and proportional ratio thumbnails make the controls easier to scan.
- **Auto zoom (ADR-023):** enabled when an image opens. After drawing, resizing, moving, or committing a crop-panel change, the camera fits and centers the crop in the editing area over 320ms. Handles and outside-crop context remain visible; small crops may enlarge past 100% up to the existing 1600% limit. The camera stays fixed throughout pointer/slider/held-key gestures. Starting a gesture or using manual zoom/Fit interrupts motion. Manual framing remains until the next crop change; the Auto zoom toolbar toggle disables automatic reframing. Crop removal/undo returns to the whole-image fit. Saved crops and viewport changes also reframe; reduced motion applies the destination immediately. All camera state is transient and adds no edit/history operations.
- **Crop Preview (P):** isolates and fits the current crop with its overlays hidden, reserving space for the toolbar. Escape / F returns to editing. Preview keeps crop geometry/history intact and restores the preceding editing camera. Arrow edits, zoom/pan, guides, and face toggles are disabled in preview; crop controls in the side panel remain usable. Preview shows the composition, not output padding/resampling. The compare button sits in the filename footer.
- The stage publishes its state as `data-*` attributes (`data-phase`, `data-image-width/height`, `data-view-scale/x/y`, `data-crop`) so tests read exact geometry.
**Limitations:** the stage shows the ≤ 1600 px preview, so deep zoom magnifies that preview rather than the original pixels; no rotate/straighten; the adjusted preview is
approximate for semi-transparent images (§C.6).

### E-6 Cropping engine — **Implemented** (Iteration 5; one crop per image)
Pure geometry in `src/lib/cropping/` in oriented original px (ADR-007), integers at commit, minimum side `MIN_CROP_SIDE` = 16 px, always inside the image.
- **Aspect presets:** 1:1, 4:5, 3:4, 2:3, 9:16, 16:9, Original, Free, and Custom W:H (ratio limited to 0.1–10). A preset locks the shape; Free releases it; typing a width
  or height with a lock set the other side. Choosing a ratio on an image with no crop starts a custom box.
- **Portrait/Headshot:** crop height `H = faceH / faceFill` (default `faceFill` 0.42), width `H·aspect` (default 4:5); the face box top sits at `headroom·H` from the
  crop top (default 0.18); horizontally centered on the face. If it would leave the image it is shifted inside, then shrunk around the face; `constrained` is set and the
  panel says "Framing was adjusted to stay inside the image."
- **Face-only:** the face box expanded by `padding` per side (default 0.25), grown to the aspect, centered, fitted to bounds.
- **Custom:** starts as a centered box covering 80% of the image; drag/move/resize on the canvas or exact X/Y/W/H fields (out-of-range values clamp, below-minimum values
  become the minimum, garbage reverts, Escape reverts).
- **Shapes (ADR-026):** Rectangle, Square, Circle, and Hexagon controls create or reshape the crop in any mode. Square/Circle lock 1:1 through numeric entries, drag/resize, mode changes, API saves, and job snapshots. Rectangle/Hexagon accept the existing ratio controls, including Free. A new standalone Hexagon starts at 2/√3 for a regular silhouette; existing crop proportions are retained. Leaving an equal-sided shape releases the ratio lock (Portrait still requires a fixed ratio).
- **Shape editing/export:** the bounding frame supports the same move/resize, exact X/Y/W/H, snapping, auto zoom, history, and batch mapping. Curved/polygon interiors determine move targets; the eight bounding handles retain priority. The shared vector path drives the outline, outside-shape dimming, clipped thirds, actual preview clipping, and antialiased export alpha. PNG/WebP retain transparent corners; JPEG fills with the output background. A one-click PNG shortcut is shown when the current resolved format is JPEG. Output cover/pad/stretch retain their explicit meanings; Preview is the crop composition, not a resized/padded-output simulation.
- **Multiple faces:** all boxes are drawn; the crop starts on the largest face; a face picker (Previous/Next face) re-frames on the chosen face. Faces are numbered by confidence.
- **No face:** status "No face detected"; Portrait and Face-only are disabled with an explanation; nothing is cropped automatically; Custom still works.
- **Persistence/undo:** the crop is part of the sparse per-image edit (§E-7): saved, restored after reload, "Remove crop" clears it (a fully default edit row is deleted).
  Every crop operation is undoable and redoable with a named step.
**Not built:** more than one crop per image ("crop each face" as separate outputs), rotation, saved presets.

### E-7 Adjustments — **Implemented** (Iteration 3; shared full-resolution export: Iteration 6)
Five controls (exposure ±3 EV, temperature, tint, saturation, brightness ±100; ranges, steps, and defaults from `adjustment-spec.ts`, shared by the UI, the API
validation, and the kernel). Each has a center-zero slider, a numeric field, a reset button, and double-click-to-reset (§B.10). The pixel math is §C.6 and is verified
three ways: unit tests of the kernel against an independent reference (exposure doubles linear light, white-balance gains preserve luminance, saturation −100 is exact
Rec.709 luminance, brightness keeps black and white fixed, hard clipping, alpha untouched, determinism, fast path equals general path, and "adjust then downscale"
matches "downscale then adjust" within 2/255); the worker protocol tests; and browser tests that read pixels back from the rendered canvas and compare them with the
spec formulas.
Edits are **non-destructive instructions**: stored per image on the server as sparse JSON (only non-default values), saved by a debounced batch `PATCH /api/edits`
(600 ms) with exponential backoff, saved immediately when the tab is hidden, and shown in the panel as *Saved* / *Saving…* / *Could not save, retrying…*. They are loaded
with the library, so they survive a reload, and removing an image removes its edit.
**Undo/redo** (toolbar buttons with named tooltips, Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl+Y; they defer to the browser inside text fields). Per page session; not persisted.
**Limitations:** the panel edits the open image only (use *Apply to…* for others); history is per page session; semi-transparent previews are approximate (§C.6);
the in-browser slider-to-frame latency is not yet measured.

### E-8 Batch editing — **Partially implemented** (adjustments, crops, and output; Iteration 3 and 5)
Implemented: **Apply to selected (n)** and **Apply to all (N)** copy the open image's adjustments to those images as ONE undoable operation; the scope and its count are in
the button label. The thumbnail checkbox adds images to the selection WITHOUT changing the open image. **Reset adjustments** clears the open image only (undoable).
**Crops:** *Apply crop to selected / all* carry the shape and re-derive the crop **per image**: Portrait and Face-only use each image's OWN detected face and the same framing settings;
images with no detected face are **skipped, never given a crop they cannot have**, and the note reports it ("Applied to 1 image · 1 skipped (no face found)"). A Custom box
is mapped by normalized position and size, so the same centered 80% lands correctly on images of different sizes. One undo reverts the whole batch; the source image keeps its
own crop. **Output settings** (§E-9) have the same Apply to selected / all.
*Pending:* reset selected / reset all with confirmation, and a Current/Selected/All scope selector shared by all edit operations. Export has its own scope selection and failed-item retry (Iteration 6).

### E-9 Output settings — **Implemented** (settings: Iteration 5; rendering/export: Iteration 6)
The Output panel stores per-image output instructions (sparse, undoable, saved with the edit) and shows the **exact resulting pixel size** for the current crop.
The renderer uses the same `computeOutputSize` function as the readout. Crop, exact dimensions, fit, padding, quality, and alpha handling are verified against decoded exports.
- Format: Same as source / JPEG / PNG / WebP. Quality 1–100 for JPEG and WebP only (a PNG has no quality control).
- Size mode: Crop size (no resizing) / Exact W × H / Long edge / Width / Height. Exact sizes add **Fit**: `inside` (default, no distortion, may be smaller than the box),
  `cover` (fills the box, trims the crop), `pad` (exact size, with a pad color), `stretch` (exact size, DISTORTS; a warning is shown). Upscaling is off by default
  ("Enlarges pixels" is stated when on and the output is larger than the crop).
- Apply to selected / all (one undo step) and Reset output.
The export dialog optionally overrides file format and filename template for the chosen scope. Empty filename override preserves per-image settings. The one-crop model uses `{n}=1`.

### E-10 Processing and export — **Implemented** (Iteration 6)
- Toolbar **Export photos** opens a real configuration dialog. Scope: Current image / Selected / All images, with counts and unavailable scopes disabled. Format: individual settings, JPEG, PNG, WebP, or original format. Optional filename template and folder preservation.
- Creates a durable snapshot including current unsaved instructions; shows real done/total counts, packaging state, errors, and cancel/retry controls. Closing the dialog or reloading retains the export. Successful files can be downloaded even when other images failed; Retry failed retains those successes.
- Full-resolution rendering reads originals rather than previews (verified with a 4000×3000 source whose preview is smaller). Shared adjustment math, oriented crop coordinates, all fit strategies, unadjusted pad color, transparent PNG/WebP, and JPEG flattening are tested.
- Result is a streamed ZIP with predictable, sanitized, collision-safe filenames. Download authorization is session-scoped, expires by configured TTL, supports byte ranges and HEAD, and does not buffer the whole ZIP in the browser or web process.
- Default development/production launch starts both web and worker automatically; separate worker invocation is available for custom process management.
- **Limits:** one crop/output per image; a source deleted before its queued render finishes fails with a clear item error; first 100 failure details are shown (all failures are retried); the complete 3,000-image workflow remains unbenchmarked. No throughput claim is made.

### E-11 Sessions and privacy — **Partially implemented** (sessions/images: Iteration 2; jobs/artifacts: Iteration 6)
Implemented and tested against a real server: anonymous cookie sessions (`fs_session`: 256-bit random token, `HttpOnly`, `SameSite=Lax`, `Secure` in production, sliding
24 h max-age; the database stores only its SHA-256); `GET` never creates a session; `POST /api/session` creates or reuses one (idempotent); every image lookup is scoped to
the session, and a missing, foreign, or malformed id returns the same plain 404 (no existence oracle); another session's `DELETE` is a no-op; same-origin enforcement on
every mutating route (missing or foreign `Origin` → 403); renditions are `Cache-Control: private` and `nosniff`; originals are never served; idle-session sweep; temp-file sweep;
`DELETE /api/session` wipes the caller's data and cookie.
Job/artifact ownership, download expiry, and periodic cleanup are implemented and tested (Iteration 6).
*Pending:* a "Delete all my data" control in the editor (the endpoint exists); the retention behavior must be disclosed accurately on
the landing page before any privacy claim is made. Behind a reverse proxy, preserve the `Host` header or the same-origin check will reject legitimate requests.

### E-12 Health endpoint — **Implemented** (Iteration 1)
`GET /api/health` → `200 { ok: true, checks: { sqlite: true, sharp: true } }` (`503` if any check fails), with `Cache-Control: no-store`.
It opens an in-memory `node:sqlite` DB and round-trips a 2×2 PNG through sharp inside the Next.js runtime. It returns booleans only
(no versions or error details). Playwright uses it as the web-server readiness URL.

### E-14 Security headers — **Implemented** (Iteration 1, baseline)
`next.config.ts` sends a CSP (`default-src 'self'`; scripts `'self' 'unsafe-inline' 'wasm-unsafe-eval'`, plus `'unsafe-eval'` in development only;
images `'self' blob: data:`; workers `'self' blob:`; `frame-ancestors 'none'`; `object-src 'none'`), `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, and `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
`X-Powered-By` is disabled. The production build was verified to hydrate and run under this CSP. Hardening item (Phase 8): nonce-based
`script-src` to drop `'unsafe-inline'`.

### E-15 Shared foundations — **Implemented** (Iteration 1)
- `src/lib/config/limits.ts`: `DEFAULT_LIMITS` (§D.12) and `resolveLimits(env)`. Fails fast on malformed or over-ceiling env values instead of
  silently weakening a safety limit. Not yet wired to a server entry point (Phase 2).
- `src/lib/image-processing/adjustment-spec.ts`: ranges, steps, defaults, `normalizeAdjustment(s)` (clamp, snap to step, no `-0`),
  `isNeutralAdjustments` (export fast path), and `formatAdjustment` (sign, unit, true minus sign). The pixel kernel is Phase 4.
- `src/types/domain.ts`: serializable models (`SourceImage`, `FaceDetection`, `CropRegion`, `ImageAdjustments`, `OutputSettings`,
  `ImageEditState`, `BatchOperation`, `ProcessingJob`, `ExportArtifact`, and supporting types), with prefixed template-literal ID types.

### E-13 Benchmarks — Phase 7 (Planned); **preliminary Phase 2 smoke measurements recorded below**
The Phase 7 benchmark (1 / 100 / 1,000 / 3,000 images, with detection, cropping, and export) has **not** been run. What follows is a one-off smoke measurement of the
**import path only**, taken in Iteration 2, to find problems early. It is not a benchmark and proves nothing about detection, cropping, or export.

Setup: production build (`next start`), real Chrome driven by Playwright on the same machine as the server, one import per run into an empty session.
Host: x86_64, 20 logical CPUs, 15 GiB RAM, Arch Linux (kernel 7.2.9), Node 26.11.1. Server RSS is sampled every 250 ms (the idle baseline was not recorded).

| Run | Input | Import time | Rate | Failures | Browser heap (before → after) | Server peak RSS | Mounted thumbnails | Reload → full library | Select all |
|---|---|---|---|---|---|---|---|---|---|
| Realistic photos | 100 JPEGs, 4000×3000, noisy (avg 6.7 MiB, 673 MiB total) | 23.4 s | 4.3 images/s (28.7 MiB/s) | 0 | 6 → 7 MiB | 650 MiB | 18 | 100 ms | 55 ms |
| Many files | 3,000 JPEGs, 48×48 (avg ~1 KiB, 3.4 MiB total) | 13.0 s | 231 images/s | 0 | 6 → 19 MiB | 647 MiB | 18 | 145 ms | 78 ms |

Long tasks (browser, > 50 ms): none in the photo run. The 3,000-file run showed **one** long task (519 ms; 420 ms when repeated). Timing correlation puts it *before* the app's
own `change` handler runs (the handler took ≈ 21 ms): it falls in the window where Playwright builds the 3,000 `File` objects inside the page, so it is attributed to the test
harness. That is an inference from timestamps, not a profile; confirm with a profiler in Phase 7. No long task occurred during the 13-second import itself.

What these runs do **not** establish: 3,000 *realistic-size* photos were not imported (≈ 20 GiB of input). Extrapolating the photo rate gives roughly 11–12 minutes, which is an
extrapolation, not a measurement. The 3,000-file run verifies count handling (queue, requests, store, virtualization), not decode cost. Memory under 3,000 large photos, behavior
with a remote client, and the export path are unmeasured. **The 1–3,000 image requirement is therefore NOT yet verified end to end.**

Adjustment kernel timing (Iteration 3, Node, pixel math only; browser latency unmeasured): see §C.6.

---

## F. Architecture Decision Records

### ADR-001 — Upload originals at import; server generates renditions
- **Date:** 2026-11-04 · **Status:** Accepted · **Modules:** upload, server/storage, server/processing, image-library
- **Decision:** Each file is streamed to the server on import (one request per file, client concurrency 4). The server validates it, stores the
  original, and generates `thumb` and `preview` renditions with sharp.
- **Reason:** durable jobs need the originals server-side. Browser `File` handles do not survive a reload. sharp is the authoritative decoder for
  validation and bomb limits, and the same decoder producing preview and export keeps them consistent (EXIF orientation, ICC conversion).
- **Alternatives:** (a) Keep originals in the browser (File/OPFS) and upload at export. Rejected: refresh/recovery is fragile, browser quota limits apply,
  and the export would depend on the tab staying open. (b) Chunked resumable uploads (tus). Deferred: per-file requests are already small units of retry.
- **Tradeoffs:** upload time and bandwidth at import (fine locally, slower remotely), server disk use, and images leave the device (must be disclosed accurately).

### ADR-002 — Face detection runs in the browser (MediaPipe) and persists to the server
- **Date:** 2026-11-04 · **Status:** Accepted · **Modules:** face-detection, workers, cropping, api
- **Decision:** MediaPipe Tasks `FaceDetector` runs in a Web Worker (a classic worker, see ADR-017) on the `thumb` rendition. Results go to the server and are cached
  per image and model id. Crop framing runs client-side, so the server receives explicit, deterministic crop rectangles.
- **Reason:** the specified MediaPipe runtime targets browsers (WASM + Web APIs). A worker keeps the main thread free. Explicit rects make
  exports reproducible and keep the server free of ML dependencies.
- **Alternatives:** server-side detection with onnxruntime-node and a different model (contradicts the MediaPipe requirement; adds a heavy native dependency);
  MediaPipe in Node with polyfills (unsupported, fragile).
- **Tradeoffs:** detection speed depends on the user's device; the tab must stay open while detection runs (it resumes from cache after reload).

### ADR-003 — Durable jobs on SQLite (`node:sqlite`) with a dedicated worker process
- **Date:** 2026-11-04 · **Status:** Accepted · **Modules:** server/db, server/jobs, server/worker, api/jobs
- **Decision:** Job and item state live in SQLite (WAL). A separate worker process claims items with atomic `UPDATE … RETURNING` and time-limited
  leases. The web process only creates, reads, and cancels jobs.
- **Reason:** there is no Redis on the target machine. `node:sqlite` is built into Node 26 (no native addon or ABI risk). It is durable across restarts, transactional
  with app data (images, edits), easy to inspect, and zero-ops for local and single-host deployments.
- **Alternatives:** BullMQ + Redis (robust and multi-node, but needs a Redis service and splits state across stores); pg-boss + Postgres (good scale-out path,
  but heavier ops for an MVP); better-sqlite3 (native addon, Node 26 ABI risk); in-memory queue (not durable, rejected by requirement).
- **Tradeoffs:** single host only (web and worker share a disk and DB file); a single writer (WAL plus short transactions mitigate); polling latency
  of about 250–500ms. Migration path: put the queue behind `JobQueue`/repository interfaces so Postgres or Redis can replace it.

### ADR-004 — One shared pixel kernel for preview and export
- **Date:** 2026-11-04 · **Status:** Accepted · **Modules:** lib/image-processing, workers, server/processing
- **Decision:** Adjustments are implemented once as a pure TypeScript kernel (§C.6), used by the browser preview worker and the server export.
- **Reason:** guarantees that preview and export match (identical math and LUTs). CSS filters and sharp's `modulate` do not operate in linear light and cannot express this spec.
- **Alternatives:** CSS/WebGL preview plus sharp ops on export (two implementations that drift); WebGL on both (no GPU on server).
- **Tradeoffs:** JS per-pixel cost on full-resolution export (estimated 0.2–0.6s per 24MP image; to be measured). Mitigated by fast paths and a `worker_threads` pool.

### ADR-005 — Anonymous cookie sessions for ownership
- **Date:** 2026-11-04 · **Status:** Accepted · **Modules:** server/session, api
- **Decision:** A random 256-bit token in an HttpOnly cookie identifies the session. The DB stores its SHA-256. All resources are scoped by session id.
- **Reason:** isolates users without accounts (MVP non-goal). IDs alone are never authorization.
- **Alternatives:** signed JWT (no server-side revocation for deletion); URL capability tokens (leak via history and referrers).
- **Tradeoffs:** clearing cookies loses access to the session (data is then swept by TTL).

### ADR-006 — Dark-only theme
- **Date:** 2026-11-04 · **Status:** Accepted · **Modules:** design system
- **Decision:** FaceStudio ships a single dark theme.
- **Reason:** neutral dark chrome is standard for color-critical image work and reduces the design and test surface.
- **Alternatives:** light and dark themes (double the token and QA surface for little benefit in this tool).
- **Tradeoffs:** users who prefer light UI are not served.

### ADR-007 — Crop geometry in oriented original pixel space, integers at commit
- **Date:** 2026-11-04 · **Status:** Accepted · **Modules:** lib/coordinates, cropping, canvas, server/processing
- **Decision:** Crops and face boxes use the EXIF-oriented original's pixel grid. Crop rects are rounded to integers when committed.
- **Reason:** one canonical space makes export exact (`sharp.extract` takes integers) and independent of preview size or zoom.
- **Alternatives:** normalized 0–1 coordinates as the stored form (rounding ambiguity at export; numeric inputs become non-intuitive). Normalized form is still used for **batch mapping** between images.
- **Tradeoffs:** a conversion is needed at every display boundary (centralized in `lib/coordinates`).

### ADR-008 — Toolchain pins: TypeScript 6.0.x, ESLint 9.x
- **Date:** 2026-11-04 · **Status:** Accepted · **Modules:** tooling
- **Decision:** TypeScript 6.0.3 (not 7.0.2) and ESLint 9.39.x (not 10.x), with Next 16.4.5 and React 19.3.1.
- **Reason:** `typescript-eslint` (required by `eslint-config-next`) declares `typescript >=4.8.4 <6.1.0`, and `eslint-plugin-react` 7.37 supports ESLint ≤ 9.
- **Alternatives:** TS 7 with lint disabled (unacceptable); `--legacy-peer-deps` (hides real incompatibility).
- **Tradeoffs:** we miss TS 7's native-compiler speed until typescript-eslint supports it. Re-evaluate on each upgrade.
- **Update (2026-11-04, Iteration 1):** npm flags `eslint@9.39.5` as "no longer supported" (it is on the `maintenance` dist-tag). Rechecked:
  the stable releases of eslint-plugin-react (7.37.5), eslint-plugin-jsx-a11y (6.10.2), and eslint-plugin-import (2.32.0) still do not declare
  ESLint 10 support, so the pin stands. Upgrade trigger: when eslint-config-next's plugin set declares ESLint 10.

### ADR-009 — The `thumb` rendition doubles as face-detection input
- **Date:** 2026-11-04 · **Status:** Accepted · **Modules:** server/processing, face-detection
- **Decision:** Detection reads the ≤384px `thumb` rather than the preview or the original.
- **Reason:** BlazeFace short-range letterboxes input to 128×128, so higher-resolution input does not improve detections. The thumb is already cached
  for the grid, which cuts detection transfer for 3,000 images from about 600MB (previews) to about 60–90MB.
- **Alternatives:** a separate detection rendition (extra storage for no accuracy gain); detecting on the preview (5–10× the bytes).
- **Tradeoffs:** keypoint precision is limited to about 1/128 of the image extent, which is acceptable because framing adds margins. Small faces in large group photos are a model limitation either way.

### ADR-010 — shadcn/ui primitives copied by hand, then token-aligned
- **Date:** 2026-11-04 · **Status:** Accepted · **Modules:** components/ui
- **Decision:** shadcn components are taken from the shadcn CLI output (`npx shadcn@4.23.0 add <c> --view`) and written into
  `src/components/ui` manually, importing `cn` from `@/lib/utils` and restyled to FaceStudio tokens and sizes (§B.9).
- **Reason:** with this project's `components.json`, CLI 4.23.0 rewrote the utils import to `import { cn } from "cn"` and listed `cn` as an
  npm dependency, which would install an unrelated package. shadcn components are copy-in source by design, so manual copying loses nothing.
- **Alternatives:** run the CLI and patch the imports afterwards (risk of installing a bogus `cn` package); write primitives from scratch (loses upstream accessibility work).
- **Tradeoffs:** future components need the same manual step. Re-test the CLI on upgrades.

### ADR-011 — Editor panel sizes persisted in pixels and restored imperatively
- **Date:** 2026-11-04 · **Status:** Accepted · **Modules:** features/editor-shell
- **Decision:** persist the library and controls widths in px (`localStorage`, user-initiated changes only) and restore them with
  `panelRef.resize(px)` in a layout effect. Pixels are computed from the validated layout percentages × group width.
- **Reason:** `useDefaultLayout` reads storage inside `useSyncExternalStore`, including its server snapshot, which causes hydration mismatches.
  The first fix swapped a static SSR layout for the resizable group after mount, but that **remounted all panel content** (a race was caught by
  e2e, and it would double-run effects once panels hold real state). Pixels match desktop-editor expectations, since side panels keep their
  width when the window resizes. Reading `panel.getSize()` inside `onLayoutChanged` returns the pre-change size (caught by e2e), so the size is derived from the layout argument instead.
- **Alternatives:** `useDefaultLayout` with percentages (hydration mismatch); a client-only mount gate (remount, layout flash); cookie
  storage read on the server (more moving parts for a convenience feature).
- **Tradeoffs:** one imperative call after mount. The restore happens before paint, so there is no visible jump.

### ADR-012 — Establish the session once, before any parallel upload
- **Date:** 2026-11-04 · **Status:** Accepted · **Modules:** upload (client), api/session, server/http
- **Decision:** the upload queue calls `POST /api/session` (idempotent create-or-get) **once per run** and waits for it before sending any `POST /api/images`.
- **Reason:** a real-browser test exposed a data-splitting bug. The queue fires its first 4 uploads in parallel, before any response has set the session cookie, so each request
  created its **own** session and the browser kept only the last cookie. The UI looked correct (it mirrors responses) but a reload showed one image of three, duplicates were not
  detected across the split, and removals missed most images. The server-side integration tests could not catch it because they pass an explicit session.
- **Alternatives:** make `POST /api/images` idempotent per client with a client-generated token (more moving parts and a second identifier); serialize the first upload (slower, and
  it hides the problem rather than removing it); have the server create sessions lazily with a lock keyed by IP (unreliable behind proxies).
- **Tradeoffs:** one extra tiny request per run. The call is re-made at the start of every run so a cleared cookie is repaired. Regression tests: unit (exactly one session request,
  made before the first upload; retry when it fails) and e2e (reload shows all images; session endpoint is idempotent).

### ADR-013 — Render both renditions from one decode, and decode one upload at a time per request
- **Date:** 2026-11-04 · **Status:** Accepted · **Modules:** server/images/ingest
- **Decision:** decode the original once (`rotate → resize ≤ 2048 → sRGB → raw 8-bit`), then encode the preview and the thumb from that raw buffer in parallel.
- **Reason:** decoding a large image twice doubles CPU and peak memory per upload, and deriving the thumb from the already-lossy preview would stack two lossy encodes. The raw
  buffer is bounded (≤ 2048 × 2048 × 4 ≈ 16 MiB per in-flight upload, so ≤ 64 MiB at the client's concurrency of 4), independent of the original's size.
- **Alternatives:** two independent sharp pipelines (double decode); thumb from the preview WebP (double compression); decoding at full size (unbounded memory).
- **Tradeoffs:** a short-lived raw buffer per request. Measured in the Iteration 2 smoke run (E-13): 100 × 12 MP photos peaked at about 650 MiB server RSS.

### ADR-014 — Edits persist as sparse per-image JSON, saved by a debounced, batched PATCH
- **Date:** 2026-11-04 · **Status:** Accepted · **Modules:** server/edits, api/edits, stores/edit-store, features/adjustments
- **Decision:** the server stores one row per EDITED image (`image_edits`, adjustments as JSON, deleted when they return to defaults). The browser saves dirty images in one
  `PATCH /api/edits` after 600 ms of quiet, retries with exponential backoff, and saves immediately when the tab is hidden. Values are validated against the shared spec
  on the way in and re-normalized (clamped, snapped) before storing.
- **Reason:** export jobs (Phase 6) must read edit instructions from the server, and edits must survive a reload. Sparse storage keeps a 3,000-image batch with a few edits
  tiny and makes "unedited" unambiguous. A batch endpoint turns "apply to all" into one request instead of 3,000. The shared spec means the API cannot accept a value the
  kernel does not define.
- **Alternatives:** store only in the browser (lost on reload, invisible to export jobs); one request per image (3,000 requests for apply-to-all); store a full row for every
  image (wastes space, makes "edited" a comparison against defaults).
- **Tradeoffs:** a few hundred ms between an edit and its durability (mitigated by save-on-hide); last write wins for the same image (acceptable for a single anonymous
  session). Per-image `version` for optimistic concurrency, planned in §C.5, is deferred until multiple tabs matter.

### ADR-015 — Render previews in a worker from one pristine source, at most 1600 px, latest request wins
- **Date:** 2026-11-04 · **Status:** Accepted · **Modules:** workers/adjust, features/adjustments
- **Decision:** the open image's preview is decoded once and handed to a module Web Worker, which downscales it to a 1600 px long edge and keeps it as the only source. Each
  render copies the pristine pixels, runs the shared kernel, and returns an `ImageBitmap`. The client keeps one render in flight and replaces any waiting request with the newest.
- **Reason:** keeps the main thread free while dragging (the saturation path costs ≈ 37 ms per 1.7 MP frame), bounds memory to one image, and prevents a backlog when sliders
  move faster than frames render. Rendering from pristine pixels each time makes results independent of the path the slider took.
- **Alternatives:** CSS filters or WebGL (cannot express the linear-light spec or match the server); main-thread canvas (jank at preview size); queue every value (laggy
  convergence); render at full preview size (more pixels per frame for no visible gain at the canvas size).
- **Tradeoffs:** one extra downscale per image switch; previews are ≤ 1600 px even if the monitor could show more (the Konva stage in Phase 3 will render at the zoom level
  it needs); `getImageData` un-premultiplies alpha, so semi-transparent previews are approximate.

### ADR-016 — Photography-led UI with local sample assets and a separate display face
- **Date:** 2026-11-04 · **Status:** Accepted · **Modules:** landing, editor-shell, canvas, design tokens
- **Decision:** adopt a photographic contact-sheet direction for the landing page, with locally hosted WebP samples and variable Manrope headings. Retain Inter for body/control text, the neutral dark theme, blue action/selection tokens, and all existing editor behavior. Deepen neutral surfaces, use an inset editor frame, and improve import/control empty states.
- **Reason:** the user requested a substantial UI improvement informed by 10k-websites and general UI guidance, explicitly excluding the Higgsfield hero intro. A real application preview and an interactive framing example communicate the product better than repeated abstract illustrations.
- **Scope:** keeps the Next.js/React architecture. No video, new runtime dependency, external hosting, fake export control, or sample-library seeding. The preview is explicitly illustrative and export is marked Coming soon.
- **Rule changes:** §B.2 surface values and photographic-asset exception; §B.3 display font/scale; §B.4 measured landing CSS layout dimensions; §B.11 toolbar, inset frame, and nav dimensions. The class merger explicitly registers custom font sizes (§D.4). Existing geometry/state/processing rules stand.
- **Tradeoffs:** additional local image/font assets; sample projects must remain clearly distinguished from real data. Static mock controls are flattened inside a labelled image. Source/license records live beside the assets. Existing SVG illustration utilities remain available.

### ADR-017 — MediaPipe runs in a classic worker served from `public/`
- **Date:** 2026-11-04 · **Status:** Accepted · **Supersedes:** the "module Web Worker" plan in the original §C.7 · **Modules:** face-detection, CSP
- **Decision:** run the detector in `public/workers/face-detection.worker.js` as a classic (non-module) worker that loads the self-hosted vision bundle with `importScripts`.
- **Reason:** a spike showed the MediaPipe WASM loader fails inside a module worker (it needs `importScripts`, which module workers do not have) and works in a classic one.
  §C.7 had flagged this as a risk to verify first; it was verified, and the module-worker design is impossible with this library version.
- **Consequences:** the worker is plain JavaScript outside the TypeScript pipeline (ESLint overrides for its globals; `public/mediapipe/**` is ignored); CSP needs
  `worker-src 'self' blob:` and `wasm-unsafe-eval`; `scripts/setup-mediapipe.mjs` provisions the runtime and model (network needed once). The adjust worker stays a module worker.

### ADR-018 — Konva renders; pure functions decide
- **Date:** 2026-11-04 · **Status:** Accepted · **Modules:** cropping, canvas
- **Decision:** Konva/react-konva only draw (image, overlay, handles, face boxes). Pointer handling uses DOM events and the pure hit-testing in `lib/cropping/hit-test.ts`
  in image coordinates; the view transform lives in `lib/coordinates/view.ts`. Overlay colors are read from the CSS design tokens.
- **Reason:** geometry (what a drag means at an image edge, with a locked ratio, at minimum size) must be unit-testable without a canvas, and must stay identical when
  batch operations or export reuse it. Konva's own drag/transform widgets cannot express integer commits, clamping against image bounds, or single-step undo cleanly.
- **Consequences:** more hand-written interaction code, covered by 9 hit-test and 22+23 geometry unit tests and the e2e gestures. The canvas pixels are not an assertion
  surface for geometry: the stage publishes `data-*` attributes instead.

### ADR-019 — Crops and output persist inside the sparse edit; detections in their own table
- **Date:** 2026-11-04 · **Status:** Accepted · **Modules:** server/edits, server/detections, db migration 3
- **Decision:** `image_edits` gains `crop` and `output` JSON columns (extending ADR-014: only non-default values are stored; a fully default row is deleted). Detections are
  a separate `detections` table keyed by image, with the model id, status, and faces. Both clamp coordinates to the real image on the server.
- **Reason:** crops and output are user intent (undoable, copied by batch operations) while detections are a cache of a model's opinion that must be invalidated by model id
  and never mixed into undo history.
- **Consequences:** migration 3 (`PRAGMA user_version` 3; `getContext()` re-runs `migrate` when `SCHEMA_VERSION` changes so a long-running dev server picks it up);
  the API tests cover validation, clamping, and ownership.

### ADR-020 — One crop per image
- **Date:** 2026-11-04 · **Status:** Accepted (MVP) · **Modules:** cropping, export
- **Decision:** an image has at most one crop and one output setting. Several people in one image are handled by choosing which face to frame, not by producing several files.
- **Reason:** it keeps Phase 6 export one-in/one-out per image (predictable file names, counts, and progress) and keeps batch operations well defined.
- **Consequences:** "crop each face" is not offered and is not claimed. Revisit if export design allows several outputs per image.

### ADR-021 — Durable exports with an automatically supervised worker
- **Date:** 2026-11-04 · **Status:** Accepted · **Modules:** export UI, jobs API/DB, processing, worker, launch scripts
- **Decision:** implement ADR-003/004/007 as durable SQLite snapshot jobs, rendered by a separate process with persistent worker threads and lazily streamed yazl archives. The request includes current instructions so waiting autosaves cannot cause a stale export. One active export per session; existing one-crop model remains.
- **Dependencies:** yazl 3.3.1, tsx 4.23.15, @next/env 16.4.5; development-only ZIP reader/types verify the actual downloads. No image math is duplicated. Next.js’s version-matched environment loader is imported through its CommonJS default in the unbundled worker.
- **Operation:** `npm run dev`/`npm start` supervise both processes. The worker loads the same `.env*` files as Next.js; deployment needs the server/worker sources and runtime dependencies alongside the web build. Graceful shutdown uses known process handles; interrupted workers restart and abandoned item/package leases recover.
- **Safety/correctness:** ownership validation before snapshot creation, atomic schema checks on simultaneous startup, immutable attempt keys and fenced commits, no whole-batch pixel/ZIP buffers, output pixel guard, case-insensitive filename collisions, scoped/expiring/range-capable downloads, bounded cleanup.
- **Tradeoffs:** single host/shared disk; conservative concurrency may select one render slot on the development host; a deleted source can fail its unfinished export item; artifact expiry means an expired batch must be exported again. One crop per image and scale benchmarks remain separate work.

---

### ADR-022 — Direct crop feedback and a separate composition preview
- **Date:** 2026-11-05
- **Context:** exact crop tools need visible responses during composition without moving the image independently of the pointer.
- **Decision:** add hovered-handle highlighting, live dimensions, action hints, explicitly toggled thirds, six-screen-pixel center magnets during move (Alt bypass), and an undoable Center crop action. Crop Preview / P clips the image layer to the existing crop and fits that rectangle, reserving space for controls. Escape / F returns to editing. Compare temporarily shows the original camera/image. Preview never changes persisted geometry or history, and its camera is derived from the current crop/viewport; leaving it restores the editing camera.
- **Presentation:** mode icons and proportional aspect thumbnails; compare in a separate image footer. Only hint entrance and chrome colors animate, at the existing durations and with reduced-motion overrides. Canvas geometry never tweens during drags. Numeric fields remain the accessible alternative.
- **Consequences:** no schema, processing, export, or dependency changes. Preview displays the cropped composition; output padding/resampling remains an export setting. Magnets affect move gestures only and keep one history step per gesture. Broad face-detection accuracy and latency remain unmeasured.

### ADR-023 — Automatic, interruptible camera settling after crop edits
- **Date:** 2026-11-05 · **Status:** Accepted · **Modules:** crop stage, camera hook, view geometry
- **Context:** overlay feedback and an explicit Preview button did not provide the phone-editor behavior the user requested: working directly on an enlarged crop after editing it.
- **Decision:** fit the committed crop in the editing workspace, retaining handles and outside-crop context, using an interruptible 320ms cubic ease-out camera move. Observe committed crop geometry and defer while any edit gesture is open; do not interpolate stored crop rectangles. New pointer/key gestures, manual wheel/buttons/Fit, compare, and preview cancel camera motion. An Auto zoom toggle defaults on. Manual views persist until the next crop change; undo/removal and viewport changes reframe appropriately. Reduced motion skips interpolation, including when enabled mid-transition.
- **Implementation:** pure `focusCropView` / `interpolateView` math, and a local `useCropCamera` hook owning one animation-frame loop, cancellation, cleanup, and manual control. Pointer math uses the rendered camera transform. Scale is bounded at 2%–1600%; toolbar/handle space is reserved around the crop.
- **Supersedes:** ADR-022's restriction to hint/chrome motion for this user-requested camera movement. The prohibition on animated geometry during drags remains. Crop Preview stays separate and shows isolated composition; Compare shows the original at image fit.
- **Consequences:** no dependencies, processing-pipeline, stored crop/schema, export, or undo model changes. Magnified previews retain the existing ≤1600px preview fidelity; no latency benchmark is claimed.

### ADR-024 — Escape removes the active crop while editing
- **Date:** 2026-11-05 · **Status:** Accepted
- **Decision:** Esc while editing removes the active crop through `removeCrop`, retaining autosave and named Undo/Redo. End any active drag first so captured pointer movement cannot recreate the crop. Crop Preview consumes the first Esc to return to editing; repeats are ignored. Editable fields, dialogs, library listbox, prevented events, modifier shortcuts, and compare are excluded so their existing key behavior stays intact.
- **Reason:** explicit user request for a quick way to remove a crop. No new persistent state, schema, processing, or dependencies are needed.

### ADR-025 — Solid black surfaces and responsive neutral edges
- **Date:** 2026-11-05 · **Status:** Accepted
- **Context:** user rejected the grey/blue cast throughout the app and requested pure black with stronger, lively borders.
- **Decision:** app/canvas/panel/elevated surfaces are #000000; text and border tokens are achromatic. Only hover/press states lift to neutral #0C0C0C/#161616. Centralized edge tokens provide thin inset light on raised controls and a brighter hover/focus rim; inputs/selects use a 3.34:1 neutral outline. Blue remains on primary actions and small focus/selection indicators, with no selected-panel wash or thumbnail tint. Toolbars use opaque black, and browser theme metadata/canvas fallback tokens match.
- **Scope:** shared tokens cover editor, landing, empty states, dialogs, menus, controls, and sample UI. Existing crop camera motion and reduced-motion behavior remain. No new dependencies, geometry, image-processing, API, or persistence changes. Selection remains indicated by ring, checkmark, and semantic state.
- **Supersedes:** the surface/text palette from ADR-016 and selected-thumbnail tint from §B.12. Photos keep their actual colors.

### ADR-026 — Editable crop shapes with shared preview and export geometry
- **Date:** 2026-11-05 · **Status:** Accepted
- **Context:** aspect ratios alone cannot create circle or hexagonal silhouettes; the user requested editable circle, hexagon, square, and rectangle frames.
- **Decision:** add optional `CropRegion.shape` (`rectangle | square | circle | hexagon`), with missing values meaning Rectangle for existing saved edits and durable jobs. Shape stays in the sparse JSON edit and immutable job snapshot; no SQL migration or new dependency. All shape changes use named, undoable store actions and existing autosave/batch paths. Face modes retain/rederive each photo's own framing; shape selection still works while detection results load.
- **Geometry:** Circle/Square force 1:1 in pure builders, numeric/drag edits, and server edit/job boundaries. Rectangle/Hexagon permit arbitrary aspect ratios; a newly created Hexagon starts regular, with flat top/bottom and side vertices at mid-height. Canvas outline, scrim, guides, clean preview, hit-testing, and SVG export masks agree on the silhouette. A dashed bounding rectangle explains the unchanged eight resize handles.
- **Encoding:** mask after adjustment/resampling, before padding, preserving source alpha. For Cover, transform the original shape with the same centered cover mapping instead of drawing a new shape over the output. Stretch distorts the mask along with its pixels. Materialize masked raw pixels before Sharp extend (Sharp composites run after extend regardless of call order). PNG/WebP preserve alpha; JPEG flattens using existing output background; expose a PNG shortcut without silently changing format.
- **Scope:** one crop per image remains. Rotation, arbitrary polygon vertex editing, saved shape presets, original-resolution deep zoom, and padded/resized output simulation in Preview are not included. Shape masking adds an intermediate raw image in the export worker; existing memory-aware worker limits remain and no new throughput claim is made.

## G. Iteration History (append-only)

### Iteration 0 — Phase 0: Architecture and rulebook (2026-11-04)
- **Goal:** inspect the environment, verify the dependency matrix, choose the architecture for 1–3,000 images, and establish SKILLS.md and CLAUDE.md.
- **Environment findings:** no existing `facestudio/` project (nothing to preserve). Node 26.11.1, npm 12.2.0 (no pnpm/yarn/bun). No Redis.
  `node:sqlite` loads without an experimental warning (SQLite 3.53.4). sharp 0.35.5 loads and round-trips JPEG on Node 26. Port 3000 is occupied by
  another local Next.js server, so FaceStudio uses 3100. System Chrome is available for Playwright.
- **Compatibility checks:** next 16.4.5 peers react ^19 ✔. react-konva 19.3.2 peers react ^19.3 and konva ≤10 ✔. typescript-eslint requires TS <6.1 → TS 6.0.3 (ADR-008).
  eslint-plugin-react supports ESLint ≤9 → ESLint 9.39 (ADR-008). vitest 5.1 supports Node ≥26 ✔.
  @mediapipe/tasks-vision 1.2.2 ships an ES-module WASM loader and falls back from `importScripts` to dynamic import (module-worker capable, to be verified in Phase 3).
  The BlazeFace model downloads (229,746 bytes) for self-hosting.
- **Files:** `SKILLS.md`, `CLAUDE.md`, `.claude/settings.json`.
- **Decisions:** ADR-001 … ADR-009.
- **Tests:** none (no code yet). Version and compatibility probes ran as recorded above.
- **Known issues and risks:** (1) MediaPipe module-worker loading is unverified in a real browser. (2) Shared JS kernel export cost at full resolution is unmeasured.
  (3) The single-host SQLite queue limits scale-out (accepted for the MVP).
- **Next:** Phase 1, the application foundation.

### Iteration 1 — Phase 1: Application foundation (2026-11-04)
- **Goal:** a working Next.js app with the design system, a polished landing page, the editor shell, and verified tooling.
- **Acceptance criteria:** `/` and `/editor` serve on :3100; typecheck, lint, unit, build, and e2e pass; the landing page has every specified
  section with working CTAs; the editor has a toolbar, three resizable panels, a status bar, and honest empty states; `/api/health` proves
  sqlite and sharp load inside Next.js.
- **Files/modules added:** project config (`package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `postcss.config.mjs`,
  `vitest.config.mts`, `playwright.config.ts`, Prettier, `.gitignore`, `.env.example`, `components.json`); `src/app/{layout,page,globals.css,icon.svg}`,
  `src/app/editor/page.tsx`, `src/app/api/health/route.ts`; `src/components/ui/{button,tooltip,separator}`, `src/components/brand/logo`;
  `src/features/landing/**`, `src/features/editor-shell/**`; `src/lib/{utils,safe-storage}`, `src/lib/config/limits`,
  `src/lib/image-processing/adjustment-spec`; `src/types/domain`; `server/health`; `tests/**`.
- **Features:** E-1 landing page, E-2 editor shell, E-12 health endpoint, E-14 security headers, E-15 shared foundations.
- **Design changes:** added the slider-gradient tokens (`temp-*`, `tint-*`) and the documented illustration-palette exception (§B.2);
  documented panel persistence and separator behavior (§B.11) and Button `asChild`/`loading` (§B.9).
- **Architecture changes:** ADR-010 (shadcn copy-in), ADR-011 (panel persistence), ADR-008 update (ESLint 9 maintenance status).
- **Tests run (all actually executed this iteration):**
  - `npm run typecheck` → pass (0 errors).
  - `npm run lint` → pass (0 problems).
  - `npx prettier --check src server tests` → pass.
  - `npm test` → 7 files, **44/44 passed** (limits 10, adjustment spec 8, panel sizes 10, health 1, Button 4, landing 7, editor shell 4).
  - `npm run build` → pass (`/`, `/editor` static; `/api/health` dynamic).
  - `npm run test:e2e` → **10/10 passed** against the dev server, and **50/50 passed** (10 tests × 5 repeats, 9 workers) against the production
    build (`next start`) with the production CSP.
  - Manual visual review via screenshots at 1440×900, 390×844, and 800×700: fixed the workflow heading wrap and connector-line alignment.
- **Bugs found and fixed during the iteration:** (1) the jsdom `ResizeObserver` gap (test stub); (2) a panel remount race after hydration, which made
  the keyboard-resize e2e test flaky under parallel load (ADR-011); (3) the saved panel width was one step stale (`getSize` lag, ADR-011);
  (4) invalid `<div>` inside `<ol>` in the workflow section; (5) an inline `import()` type in the e2e spec (lint).
- **Known issues:** the editor cannot import images yet (the canvas says so). There is no git repository yet. Fonts come from `next/font/google`, so the
  **build** needs network access (there are no runtime requests).
- **Next recommended actions:** Phase 2 (upload and library): session cookie + SQLite schema (`server/db`, `server/session`), storage driver,
  `POST /api/images` streaming upload with validation and renditions, `GET /api/images/:id/{thumb,preview}`, client upload queue (concurrency 4,
  retry), Zustand library store, virtualized grid, selection, and generated fixtures for 1/100/1,000/3,000 images.

### Iteration 2 — Phase 2: Image upload and library (2026-11-04)
- **Trigger:** the user opened the editor and asked where the upload option was. It did not exist yet: Phase 1 deliberately shipped no import control (§B.9, no dead buttons).
- **Goal:** a working import: file, folder, and drag-and-drop → validated, stored, and shown in a virtualized, selectable, searchable library that survives reloads.
- **Acceptance criteria:** upload works from the picker, folder picker, and drop; invalid files are rejected with reasons and leave nothing on disk; the grid stays bounded in the DOM;
  selection follows file-manager rules and is keyboard accessible; images persist across reload; sessions are isolated; typecheck, lint, unit, integration, build, and e2e (dev and
  production) pass.
- **Files/modules added:** `server/{config,context,errors,http}.ts`, `server/db/`, `server/session/`, `server/storage/`, `server/images/{ingest,repository}.ts`; routes `api/session`,
  `api/images`, `api/images/[id]/[rendition]`; `src/lib/{api/*,library/*,validation/*,format.ts}`; `src/stores/{library,upload}-store.ts`; `src/features/{upload,image-library,canvas}/`;
  `src/components/ui/dialog.tsx`; tests and fixtures; `domain.ts` gained `SessionId` and `SourceImage.duplicateOfId`. `editor-shell` now composes these; `status-bar` and
  `editor-regions` were rewritten around the stores.
- **Features:** E-3 upload, E-4 library, E-5 (preview only), E-11 sessions and isolation (partial).
- **Design changes:** §B.12 states and the grid geometry rule; §B.15 listbox keyboard model; a `Dialog` primitive (§B.14).
- **Architecture changes:** ADR-012, ADR-013; ids now use `crypto` (22 base64url chars) instead of `nanoid`; the DB and files live under one `FS_STORAGE_DIR`; `GET /api/images` carries the
  effective limits; `turbopackIgnore` on the runtime storage path (it otherwise made Turbopack trace the whole project into the server bundle).
- **Tests run (all executed this iteration):**
  - `npm run typecheck`, `npm run lint` (0 errors, 0 warnings), `prettier --check`: pass.
  - `npm test`: 15 files, **149/149** (ingest integration 27, upload manager 18, filenames 20, selection 10, format 10, limits 10, panel sizes 10, library store 9, adjustment spec 8,
    landing 7, editor shell 6, library sort 5, button 4, image signature 4, health 1).
  - `npm run build`: pass, no warnings after the tracing fix.
  - `npm run test:e2e`: 33 tests; **99/99** (×3 repeats) against the dev server and **99/99** (×3) against the production build.
  - Preliminary import smoke measurements: §E-13 (not a benchmark).
  - Manual visual review via screenshots at 1440×900 (empty, uploaded, selected, dialog, wide panel).
- **Bugs found and fixed:** (1) **session split under parallel first uploads** (ADR-012), found by e2e; (2) **grid rows overlapped**: a tall image inflated its implicit grid track, found by
  measuring boxes in the browser, and now covered by a geometry regression test; (3) pixel-limit violations were reported as `decode_failed` because sharp enforces its limit inside `metadata()`;
  (4) the animated-WebP test fixture silently produced a still image, so the "rejects animated" test was passing for the wrong reason until a guard test was added; (5) test races (reading image
  dimensions before decode; identical fixtures flagged as duplicates); (6) Turbopack whole-project tracing warning.
- **Investigated, no app bug:** a `next dev` reload loop during manual testing was caused by my own setup (the server log was written inside the same directory tree as an out-of-project
  storage directory). A browser tab from an earlier session was also connected to port 3100 during the first attempt, but it was not the cause: the loop reproduced on a clean port and stopped when the
  log was moved. See §D.13.
- **Known issues:** the 1–3,000 requirement is not verified end to end (§E-13); no per-byte upload progress; the upload queue does not survive a page reload; no "Delete all my data" button yet;
  toasts are not built; APNG first-frame limitation; the CSP still allows `'unsafe-inline'` scripts.
- **Next recommended actions:** Phase 3. Konva stage (zoom, pan, fit, overlays), `lib/coordinates` and `lib/cropping` (pure, unit-tested), MediaPipe detection in a worker with persisted results
  (`PUT /api/images/:id/detection`), portrait / face-only / custom crops, and multi-face selection. Verify the MediaPipe module-worker risk first (Iteration 0 risk 1).

### Iteration 3 — Phase 4: Adjustments, with undo/redo and apply-to-selected/all (2026-11-04)
- **Trigger:** the user looked at the editor after Phase 2 and asked where the editing options were. The Edit panel showed only file details; the tools were still ahead.
  Phase 4 was built **before Phase 3** (crop and face detection), at the user's evident priority, so the phase order in §H differs from the original roadmap.
- **Goal:** a real, non-destructive adjustments panel: five controls, live preview, reset, undo/redo, and apply to selected/all, saved on the server.
- **Acceptance criteria:** every control changes the live preview by the specified math; edits persist across reload; one slider drag is one undo step; batch applies are one
  undo step; the production build (with its CSP) runs the worker; typecheck, lint, unit, integration, and e2e pass on dev and production.
- **Files/modules added:** `src/lib/image-processing/adjust-kernel.ts`; `src/workers/{adjust.worker,adjust-protocol}.ts`; `src/features/adjustments/*` (slider, numeric field, panel, live
  preview, preview client, compare button, edit sync, shortcuts); `src/stores/edit-store.ts`; `src/lib/api/edits-api.ts` and the edit schemas; `server/edits/repository.ts`;
  `src/app/api/edits/route.ts`; migration 2 (`image_edits`); toolbar undo/redo; tests. Changed: `canvas-stage`, `editor-regions`, `editor-toolbar`, `editor-shell`,
  `load-library`, `remove-dialog`, `server/context.ts`, `server/db/index.ts`.
- **Features:** E-7 adjustments, E-8 (partial: apply to selected/all, reset), E-5 (live adjusted preview, hold-to-compare).
- **Design changes:** §B.10 slider and numeric-field behavior as built; toolbar undo/redo with named tooltips.
- **Architecture changes:** ADR-014 (sparse persisted edits, batched debounced saves), ADR-015 (worker preview from one pristine source, latest wins); `getContext()` now re-runs
  migrations when the cached connection's schema version is behind.
- **Tests run (all executed this iteration):**
  - `npm run typecheck`, `npm run lint` (0 errors, 0 warnings), `prettier --check`: pass.
  - `npm test`: 21 files, **212/212** (ingest 27, adjust kernel 20, filenames 20, upload manager 18, edit store 16, selection 10, format 10, limits 10, panel sizes 10, library store 9,
    preview client 9, adjustment spec 8, edits repository 7, numeric field 7, landing 7, editor shell 6, library sort 5, button 4, signature 4, migrations 4, health 1).
  - `npm run build`: pass, no warnings (built in a throwaway copy; see §D.9).
  - `npm run test:e2e`: **50 tests** (smoke 10, upload 24, adjustments 16): **100/100** (×2) against the dev server and **150/150** (×3) against the production build.
  - Kernel timing (Node, 1.71 MP): §C.6.
  - Manual visual review via screenshots (open, edited with scope buttons, hold-to-compare).
- **Bugs found and fixed:** (1) **a running dev server never created the new table**: its database connection is cached across hot reloads, so migration 2 did not run (the e2e
  failures all said "Could not save"); fixed by migrating on schema-version change, with an upgrade test. (2) **Preview size race**: the worker answers loads in order but replies were
  not matched to requests, so switching images quickly gave image B the size of image A (a cropped preview); found as an intermittent e2e failure under load, fixed by load ids,
  reproduced by a fake-worker unit test that fails when the fix is removed, and covered by a rapid-switching e2e test. (3) **Escape committed the typed value** in the numeric
  field because blur fires before the re-render; fixed with an explicit flag and tests. (4) A stale "ready" state could render image A's adjustments over image B's pixels (A → B → A);
  fixed by clearing the outcome in the effect cleanup. (5) Two of my own test assertions were wrong, not the code: guessed temperature/tint thresholds (white balance is
  luminance-normalized, so shifts are subtler) and a reference sRGB function missing its linear toe; replaced with a spec-derived reference.
- **Known issues:** the in-browser slider-to-frame latency is unmeasured (kernel cost is measured); semi-transparent previews are approximate; edit history is per page session;
  the panel edits one image at a time; no crop tools yet; the toolbar has no export or processing status yet; the remaining Phase 2 gaps stand (§H).
- **Next recommended actions:** Phase 3. Konva stage (zoom, pan, fit, overlays), `lib/coordinates` and `lib/cropping` (pure, unit-tested), MediaPipe detection in a worker with persisted
  results, portrait / face-only / custom crops, and multi-face selection. Verify the MediaPipe module-worker risk first. Then Phase 6 can reuse `adjust-kernel.ts` unchanged for export.

### Iteration 4 — Photography-led interface refresh (2026-11-04)
- **Goal:** replace the basic presentation with a cohesive photography workspace, using the local 10k-websites design guidance and general frontend-design principles, excluding the Higgsfield/video intro.
- **Changes:** Manrope display headings; deeper neutral surface tokens; photographic contact-sheet app illustration; keyboard-accessible crop explorer; shorter feature copy and varied section layouts; honest export roadmap state; crop-corner final CTA; responsive navigation/footer. Editor: inset workspace, brand/batch toolbar, visible canvas context, illustrated import empty state, import icons, and contextual empty controls guidance.
- **Files:** `src/features/landing/*`, `src/app/{globals.css,layout.tsx,page.tsx}`, editor shell/toolbar/regions, canvas empty state, library import icons, local photo/font assets, `src/lib/utils.ts`, typography regression tests, landing unit tests, smoke e2e, `scripts/review-ui.mjs`, `docs/design-direction.md`.
- **Decision:** ADR-016. No processing, crop geometry, API, or persisted-state behavior was changed.
- **Verification:** TypeScript and ESLint pass; unit/integration suite **395/395 pass** (33 files). Full Chrome suite **32/51 pass**: all 11 smoke tests, including the new crop-preview keyboard/reduced-motion test, pass; 19 older adjustment/upload checks fail against existing canvas/API contracts (18 expect the removed `canvas-preview` element; one expects flat edit fields while the API returns `{ adjustments, crop, output }`). These unrelated contracts were not rewritten as part of a UI refresh.
- **Visual review:** Chrome screenshots at desktop and phone; 360/375/390/768/1024/1280px widths have zero horizontal overflow; no browser console errors. Fixed missing accessible-heading spaces at explicit line breaks. The isolated preview avoids modifying the existing production build on :3100.
- **Production build:** `npm run build` passed in the isolated copy. Production Chrome smoke: **11/11 passed** with the production CSP. Live imported-photo check verifies actual exposure pixels change, the structured edit persists, and undo restores the original preview. Final production rerun after the typography fix: **11/11 smoke checks pass**, computed font sizes are 12px for crop chips and numeric controls, and the live import/edit/save/undo review passes.
- **Typography defect fixed:** default `tailwind-merge` classified custom `text-ui-sm` / `text-ui` / display classes as colors and removed them when followed by `text-fg`, leaving 16px inherited inputs/chips. The merge configuration now distinguishes sizes from colors. Nine regression cases pass, and temporarily restoring the original helper makes them fail. Browser computed-style verification covers 12px chips and numeric fields.


### Iteration 5 — Phase 3: crop modes, aspect ratios, boxes, output sizing, face detection (2026-11-04)
- **Goal:** answer "where is the option for sizing and various kinds of boxes?" with working controls, and verify the stage, panels, and detection in a real browser.
- **Built:** pure geometry (`lib/coordinates`, `lib/cropping`: aspect, framing, custom, output, build, hit-test); migration 3 and the edit/detection repositories and routes;
  the edit store with crop/output actions, named undo steps, and gesture batching; the browser detection pipeline (classic worker, queue manager, background detection,
  status-bar progress); Konva stage with zoom/pan/fit/1:1; Crop panel (modes, aspect, X/Y/W/H, framing sliders, face picker, apply to selected/all, remove);
  Output panel (format, quality, size modes, fit, upscale, pad color, exact readout, apply, reset). Decisions: ADR-017…020.
- **Defects found by running it and fixed:** the e2e target on :3100 was the user's older production server (`npm start`), which had none of this code, so the first browser
  run showed no Crop panel; verification moved to a throwaway hard-linked copy. The zoom bar showed "100%" twice (readout and the 1:1 button): the button now reads "1:1".
  Old e2e tests read the removed `canvas-preview` element and a flat edit shape; they now use the stage's `data-*` attributes and a sampling region derived from the view
  transform, and the structured `{ adjustments, crop, output }` edit. Four new test mistakes were corrected (largest valid X after resize; face numbering by confidence;
  keyboard focus after clicking Undo; undo step wording), none of them product bugs.
- **Verification (all run in this iteration):** `prettier --check` clean; `npm run typecheck` pass; `npm run lint` pass; unit + integration **395/395 pass** (33 files).
  Browser e2e, system Chrome via Playwright, **73 tests in 4 files** (`smoke` 11, `upload` 23, `adjustments` 17, `crop` 22), each run **twice** (`--repeat-each=2`):
  **146/146 pass against a dev server** and **146/146 pass against a production build** (`npm run build` succeeded with no warnings; production CSP active; the classic worker and
  model load under it). Both ran in a hard-linked copy with separate storage, then the copy was deleted; the user's :3100 server was not touched.
- **What the e2e proves and does not:** the real BlazeFace model detects one illustrated, synthetic face (`tests/fixtures/face.ts`) and Portrait/Face-only frame it. Multi-face, no-face,
  and batch cases inject stored detections through `PUT /api/detections` (deterministic) and one case uses the model on a plain image (no face found). **No real photograph has been
  run through detection**; accuracy on real portraits, group shots, profiles, and small faces is unknown.
- **Not done:** crops/output are instructions only (no rendered file until Phase 6); one crop per image; no rotation; reset selected/all; benchmarks; the user's :3100 server needs a
  restart or rebuild (`npm run build` then start) to show any of this.
- **Next recommended actions:** run real portrait photos through detection and record the results; Phase 6 (durable jobs, export, ZIP, reusing `adjust-kernel.ts` and `computeOutputSize`);
  then Phase 7 benchmarks and Phase 8 polish.

### Iteration 6 — Finish the editing flow with full-resolution batch export (2026-11-04)
- **Trigger:** user requested better functionality after accepting the UI refresh. The largest missing step was producing downloadable files from working crop/adjustment/output instructions.
- **Implemented:** current/selected/all export, optional format/template overrides, folder preservation, durable snapshot creation, memory-aware render-thread pool, original-resolution crop/resize/shared adjustments/pad/encode, ZIP, actual progress, cancellation, automatic attempt retry, failed-item retry, partial-success downloads, restoration after reload, ownership/expiry/range enforcement, worker supervision/environment loading, and cleanup.
- **Files:** migration 4; `server/{jobs,processing,worker}`; `src/app/api/{jobs,artifacts}`; `src/features/export`; jobs schemas/client, export store, filename/range helpers; toolbar/status bar; supervised launch and test config; export tests; landing workflow and documentation.
- **Architecture:** ADR-021. Startup migrations read the schema version while holding an IMMEDIATE write reservation. Existing crop geometry and pixel math remain shared. The launch script starts/restarts the separate worker without requiring a second terminal.
- **Checks:** unit/integration, typecheck, lint, formatting, build, and browser results are recorded in the final status below. Real download tests inspect ZIP entries and decoded pixels, rather than assuming success from a link.
- **Browser runs:** initial 10-worker dev run: 67/78 pass, with 11 timeouts while the host had ~0.8 GiB available RAM and fully used swap. After limiting browser concurrency to 4: **78/78 dev pass**; **78/78 production pass**. Existing crop/detection/adjustment/upload checks all pass. No application assertion was weakened.
- **Additional verification:** export snapshot is independent of later saved edits; actual reusable thread execution; SQLite close/reopen recovery; lease fencing; cancellation during rendering and packaging; partial success and retry; PNG/WebP alpha and JPEG flattening; all fit strategies; oriented crop extraction; 4000×3000 export beyond preview dimensions; output pixel guards; ZIP names, collisions, private/expired/ranged downloads.
- **Production finding fixed:** the unbundled worker needed the default CommonJS import for `@next/env`. The supervisor restarted it after the fix; production export tests passed with the real worker and production CSP.
- **Limitations:** one crop per image, first 100 failure details displayed, deletion of an original may fail its pending export, 3,000-image throughput/memory target still unverified. No performance or general face-detection accuracy claim is added.

---

### Iteration 7 — Interactive crop composition (2026-11-05)
- **Goal:** make cropping feel responsive and interactive while preserving precise geometry and predictable history.
- **Built:** hovered-handle highlighting; active frame feedback; live pixel dimensions; action hints; six-screen-pixel center magnets with Alt bypass and alignment lines; undoable Center crop; persistent-on-demand thirds (G); clean crop preview (P), Escape/F return and camera restoration; mode icons and proportional ratio tiles; separate filename/compare footer. Hint/chrome motion honors reduced motion; pointer-driven geometry is never tweened.
- **Decision:** ADR-022 updates overlay presentation and documents the transient composition preview. No dependencies, persistence schema, export math, or stored coordinate conventions changed.
- **Verification:** TypeScript, ESLint, changed-source formatting, and isolated production build pass. **432/432 unit/integration tests** (36 files), including new crop-center, zoom-independent snap, and offset-preview geometry cases. **26/26 focused crop Chrome checks**, followed by **82/82 full development checks** and **82/82 full production checks**. New browser coverage verifies handle feedback, live dimensions, magnets/Alt, single-gesture undo, Center undo, guides, preview camera preservation, keyboard behavior, reduced motion, and real rendered-image alpha outside/inside the preview clip. Existing actual export/pixel tests pass.
- **Visual review:** real local portrait, full workspace and isolated crop; final 1024/1280/1440px checks show zero horizontal overflow and the toolbar stays within the canvas; no browser page errors. Preview toolbar space is reserved above the photo, and compare no longer overlaps the zoom controls.
- **Runtime:** upgraded the isolated production preview at :3101, retaining `/tmp/facestudio-review/.data/preview`. The temporary development server was stopped by its explicit supervisor PID. The project source contains the implementation.
- **Limitations:** this is a composition preview, not a simulated padded/resampled output. Existing one-crop-per-image, deep-zoom preview resolution, heterogeneous face-detection accuracy, and batch/interaction benchmarks remain outstanding.

---

### Iteration 8 — Phone-style automatic crop zoom (2026-11-05)
- **Trigger:** user clarified that the missing interaction was automatic movement into the crop, as in a phone editor, rather than additional overlay feedback or a separate Preview button.
- **Built:** default-on Auto zoom, 320ms camera settling after committed crop changes, fitting/centering with handle/tool margins, bounded enlargement above 100%, interruption by pointer/key gestures or manual zoom/Fit, fit restoration on crop removal/undo, and immediate framing under reduced motion (including a preference change mid-transition). Persistent crop instructions and one-gesture history remain unchanged. Decision: ADR-023.
- **Checks completed:** TypeScript, ESLint, changed-source formatting, isolated production build, and **440/440 unit/integration tests** (37 files). Camera tests cover interpolation, exact endpoints, cancellation, retargeting, manual control, listener/frame cleanup, and reduced motion. Browser tests record actual intermediate view scales via a MutationObserver installed before release and prove the camera remains fixed during drawing/dragging, restores Fit, and does not create history.
- **Verification findings:** an initial dev setup reload-looped with out-of-project storage; moving test storage into the isolated project's ignored `.data` directory fixed it. Two first-version timing probes observed the camera only after the 320ms transition had finished; observations now run inside the browser before release. Concurrent verification runs accidentally shared Playwright's artifact directory, producing trace-file ENOENT cleanup failures; final verification uses one suite at a time with 2 workers and no concurrent artifact writers. No application assertion was loosened.
- **Final production/visual results:** **86/86 production Chrome checks pass**. On the upgraded :3101 preview, a real portrait crop moves from 88.4% to 141.4% zoom across **20 distinct recorded camera frames**. At 1024/1280/1440px, there is no horizontal overflow, the toolbar stays inside the canvas, and there are no browser page errors. The temporary development server is stopped. The retained preview storage is not used for the isolated production test suite.
- **Limitations:** magnification uses the existing preview rendition; no original-resolution deep-zoom loading or new latency/scale benchmark is claimed. Output, crop persistence, export processing, and dependencies are unchanged.

---

### Iteration 9 — Escape removes the crop (2026-11-05)
- **Request:** Esc in crop editing should remove the crop.
- **Built:** editing Escape invokes the existing named, undoable removal action, stops camera/drag state, and prevents subsequent captured pointer movement from recreating the crop. Preview consumes the first Escape to return to editing, and held-key repeats are ignored. Inputs keep revert behavior; dialogs close; library selection and compare keep their own keyboard behavior. The removal button tooltip and canvas help document the shortcut. Decision: ADR-024.
- **Checks completed:** TypeScript, ESLint, changed-source formatting, **440/440 unit/integration tests** (37 files), and isolated production build pass. The new removal regression test was run against the prior :3101 build and failed at the expected assertion (crop remained present), proving it distinguishes the old behavior. **33/33 production crop browser tests pass**, including all three new Escape cases. An older snapping check initially sampled two endpoints across a just-started camera transition; its coordinate helper now waits for three stable paint frames. Exact geometry assertions are unchanged.
- **Verification setup:** the reused development cache reload-looped after changing test storage; the dev server was stopped and verification moved to the isolated production build. No source uploads/edits were changed to work around the test setup.
- **Scope:** no schema, processing, dependency, or camera-math changes. Uses the same autosave and Undo/Redo path as Remove crop. Final upgraded :3101 review confirms Escape directly after a ratio choice removes the crop and Undo restores it.

---

### Iteration 10 — Pure-black surfaces and responsive borders (2026-11-05)
- **Request:** remove the grey/blue cast across the app, use pure black, and make borders feel crisp and interactive.
- **Built:** #000000 app/canvas/panel/elevated surfaces, neutral text/lines, opaque crop zoom toolbar, matching viewport metadata and Konva fallback colors, neutral selected crop/export panels, and no selected-thumbnail color overlay. Hover/focus brightens a narrow neutral rim; sliders retain visible neutral tracks and gain a small hover halo. Progress tracks remain visible on black. Existing crop camera and reduced-motion behavior remain. Decision: ADR-025.
- **Verification:** **440/440 unit/integration tests** (37 files); **89/89 full production Chrome checks** with 2 workers; isolated production build, TypeScript, ESLint, and changed-source formatting pass. Browser probes confirm exact RGB(0,0,0) on body, workspace, side panels, canvas, crop toolbar, zoom bar, inputs, selected ratio, and export dialog. Selected/unselected thumbnail center pixels have **zero difference**. Reduced-motion transitions compute to 0.01ms, with no browser page errors.
- **Visual/live review:** desktop crop workspace, full opened export dialog, desktop/mobile landing; 360/375/390/768/1024/1280px have zero horizontal overflow. An actual imported portrait changes exposure pixels from mean 147.67 to 173, saves +0.5 EV, and Undo restores it. Muted text contrast is 6.92:1 on black (5.97:1 on pressed); control outlines 3.34:1; accent 6.62:1. These measurements do not claim a full accessibility audit.
- **Review tooling:** the responsive capture initially waited indefinitely for off-screen lazy images to decode at some widths; the script now eagerly loads them at every reviewed width. The corrected review passes. No new dependencies or processing/persistence/geometry changes.
- **Preview:** runtime details are maintained below; retained user-preview storage is separate from isolated verification sessions.

---

### Iteration 11 — Editable shape frames and actual shaped exports (2026-11-05)
- **Request:** add Circle, Hexagon, Square, and Rectangle frames alongside aspect ratios, with direct manipulation.
- **Built:** four shape controls; equal-sided Circle/Square constraints; adjustable Rectangle/Hexagon proportions; shared vector outlines, outside-shape scrim, clipped guides and clean preview; shape-aware move targets and visible bounding handles; exact numeric/drag edits, saved/undoable shape changes, face/custom batch propagation, backward-compatible API/job snapshots, and native antialiased full-resolution export masks. PNG/WebP preserve transparent corners; JPEG flattens to the chosen output background. PNG shortcut is explicit. Decision: ADR-026.
- **Verification:** TypeScript, ESLint, changed-source formatting, isolated production build, **452/452 unit/integration tests** (38 files), and **95/95 full production Chrome checks** with 2 workers pass. After the detection-loading/label polish, **44/44 crop/export checks** pass again; the final responsive grid also passes **6/6 focused shape/download checks**. New browser tests resize/move/undo/reload all three added silhouettes, inspect actual preview alpha, release the rectangle ratio lock, use the PNG shortcut, and decode real circle/hexagon ZIP downloads. Integration checks cover PNG/WebP alpha, fractional edge coverage, JPEG flattening, source snapshot persistence, and all four output fits. Disabling the export mask makes both new transparency regressions fail at opaque corner pixels; the implementation was restored and checks rerun.
- **Visual review:** real portrait circle/hexagon/square/rectangle frames and previews; responsive widths 1024/1280/1440px retain a black canvas with zero horizontal page overflow and no browser errors. An initial fixed four-column row cramped labels at narrow panel widths; a container-aware two/four-column grid and compact shape labels resolve it. Final screenshots/report are in `/tmp/facestudio-shapes-review`.
- **Compatibility/limits:** old crops/jobs without a shape render as rectangles. No dependency or SQL migration. One crop per image, no rotation or individual polygon-vertex editing. Preview shows the composed shape, not output padding/resampling. Shape masking adds an intermediate raw image; large-batch throughput remains unbenchmarked.

---

## H. Current Project Status

*(Rewritten every iteration. Last updated: Iteration 11, 2026-11-05.)*

- **Current UI:** pure-black surfaces and responsive neutral borders, plus Rectangle/Square/Circle/Hexagon controls with directly editable frames, shape-aware scrim/guides/preview, auto zoom, Escape removal, and Undo. Circle/Square lock equal sides; Rectangle/Hexagon use the existing ratios. PNG shortcut explains transparent shape export.
- **Current verification:** **452/452 unit/integration tests** (38 files), **95/95 full production Chrome checks** with 2 workers, isolated production build, TypeScript, ESLint, and formatting pass. New checks verify shape geometry, backward compatibility, history, persistence/batch mapping, preview alpha, actual transparent downloads, JPEG backgrounds, antialiasing, and all output fits. See Iteration 11 for limits and the mutation check.
- **Working scope:** import/library/session isolation; face-aware/custom/shape crops and exact geometry/aspects; guides/snapping and auto zoom; adjustments/batch apply; persistence/history; crop preview/compare and Escape removal; durable full-resolution ZIP exports with progress/cancel/retry/recovery and shape masks.
- **Runtime:** production web + export worker preview at `http://localhost:3101/editor`, served from `/tmp/facestudio-shapes-build` with retained `/tmp/facestudio-review/.data/preview`. Root project source contains all changes. Verification storage is separate from retained preview storage; the :3103 test server is stopped after verification.
- **Pending:** reset selected/all with confirmation; multiple crops per image (ADR-020); broad detection accuracy assessment; scale/latency benchmarks; deeper-zoom fidelity; full accessibility/security/claims audit. Crop Preview does not simulate output padding/resampling. Shapes support bounding-frame edits; rotation and custom polygon vertices are not built.
- **Technical debt:** CSP permits inline scripts; ESLint 9 maintenance pin; shadcn manual copy step; upload queue in memory; no toast system or delete-session UI; history per page session; no edit versions; detection worker is untyped JS. Completed imports/jobs survive reload; pending browser uploads do not.
- **Unverified:** 1–3,000 realistic-image workload, p95 interaction latency, heterogeneous portrait/group detection quality. Magnification uses the existing preview resolution. The known XNNPACK INFO diagnostic is distinct from application errors.
