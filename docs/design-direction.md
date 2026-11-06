# FaceStudio UI refresh

The reference is a photographer's contact sheet: individual portraits held inside a precise, quiet workspace. The images provide the color. Framing corners, measured spacing, and a clear type hierarchy connect the landing page with the editor.

## Palette and typography

- App, canvas, panels, menus, and raised controls: pure `#000000`. Hover `#0c0c0c`; pressed `#161616`.
- Primary text `#f3f4f6`, secondary text `#a7adb7`, muted text `#9198a3`.
- Blue `#4b91f1` for focus and selection; filled actions use `#2b6fd2` for white-text contrast.
- Locally hosted variable Manrope for landing headings and the editor import heading. Existing Inter for body text and dense controls. Numeric UI retains tabular figures.

## Composition

```text
Brand                         Features / Workflow / Get Started
                Clear two-line promise
                Description and action
      Photographic, three-panel sample workspace
              Photography use cases

Product introduction                      Brief context
Interactive crop demonstration            Framing explanation
Face detection visual                     Adjustment controls
Batch explanation                         Selected contact sheet
Five-step workflow, ending in full-resolution ZIP export
                  Framing-corner CTA
Brand, navigation, and product note
```

The signature is the contact-sheet workspace. Adjacent sections change their composition: interactive framing, a photographic/control pair, a horizontal batch strip, and a linear workflow. Decoration stays tied to photography rather than ambient effects. One preview entrance and user-driven framing transitions honor reduced motion.

The editor uses the same neutral materials, an inset workspace border, a named toolbar, a clear import empty state, and contextual guidance in the empty controls panel. Existing upload, selection, editing, and persistence logic remains in its feature modules.

## Scope and references

Applied the design and verification guidance in `/home/paardhu/Desktop/10k-websites/` and the locally installed frontend-design skill. The requested scope is an existing Next.js application UI refresh. Higgsfield, the scroll-video intro, hosting setup, and static-HTML replacement do not apply to this implementation.

Sample imagery is labelled and does not seed the user's library. The crop demonstration compares illustrative frames rather than running detection. The editor now supports full-resolution ZIP downloads, with progress, cancellation, retry, and reload recovery.

## Verification

`npm run typecheck`, `npm run lint`, and `npm test` pass (440 tests). The pure-black theme passes all 89 production Chrome checks and the isolated production build. Actual computed backgrounds, unchanged selection pixels, reduced motion, live editing, and responsive layouts were reviewed; details are recorded in SKILLS.md §G/§H. Responsive checks cover 360, 375, 390, 768, 1024, and 1280px without horizontal overflow. A live uploaded-photo check verifies exposure pixels, saved structured edits, and undo.

Update (Iteration 5): the older browser tests were migrated to the Konva stage and structured edit contracts. The full suite (73 tests) passed twice on a dev server and twice on a production build; see SKILLS.md §G.

A shared typography defect was also corrected: register custom font sizes with tailwind-merge so color classes cannot remove the intended sizes. Regression tests reject the old behavior.

To capture screens and run the live check against a running server:

```bash
FS_REVIEW_ORIGIN=http://localhost:3101 node scripts/review-ui.mjs
```

The review uses a fresh browser session and imports one local sample portrait into that session. Its screenshots/report go to `/tmp/facestudio-ui-review` by default (`FS_REVIEW_OUTPUT` overrides it).

## Interactive crop workspace (Iteration 7)

The crop stage responds directly to the user: the hovered handle highlights, active frames use the accent, a badge follows the crop with exact dimensions, and dashed center guides appear while magnets are engaged. Holding Alt bypasses center magnets. Rule-of-thirds guides can be kept visible with G. Crop Preview / P clips the rendered image to the current crop and fits it below the controls; Escape returns to editing with the prior camera intact. The separate image footer keeps before/after comparison clear of zoom controls.

A compact composition toolbar and proportional aspect thumbnails connect each control to its effect. Hint entrances and chrome color transitions use the existing 120/180ms timings and stop under reduced motion. Canvas geometry remains immediate during drags. A real-portrait review checks composition and the preview layout; browser tests inspect actual clipped pixels, history, keyboard operation, snapping, and reduced motion.

## Automatic crop framing (Iteration 8)

Cropping now changes the editing camera automatically after the gesture or panel edit is committed. A 320ms ease-out zoom centers and enlarges the crop while keeping its handles and outside-crop context. The camera stays still during edits; a new gesture, wheel zoom, or Fit interrupts settling. Auto zoom defaults on and has a toolbar toggle. Removal/undo returns to whole-image fit, while camera movement never changes crop instructions or creates history. Reduced motion applies the same final view without interpolation.

The camera hook owns a single cancellable animation-frame loop; pure view functions handle fit and interpolation. Tests cover exact endpoints, retargeting, manual control, cleanup, reduced-motion changes, and browser-observed intermediate camera scales. Current verification is recorded in SKILLS.md §H.

## Escape shortcut (Iteration 9)

Escape removes the active crop while editing, with the same Undo/Redo and autosave behavior as the removal button. It ends a live crop drag so pointer capture cannot recreate the crop afterward. In Preview, Escape returns to editing first; key repeats are ignored. Text fields, dialogs, and the library retain their own Escape behavior. Current verification is recorded in SKILLS.md §H.

## Pure-black materials (Iteration 10)

All resting surfaces are opaque black, including the crop toolbar, export dialog, and browser theme color. Neutral graphite dividers and silver borders provide structure. A narrow inset rim responds to hover/focus; control presses tighten the inner rim, and slider thumbs gain a small neutral halo. The existing reduced-motion rules disable transitions. No ambient or looping effect is added.

Selected crop/output tiles keep black backgrounds and clear indicators. Selected library photos retain their exact colors; a ring and checkmark replace the former blue overlay. Text and input outlines retain measured contrast on the new surfaces. Verification and preview details are recorded in SKILLS.md §H.
