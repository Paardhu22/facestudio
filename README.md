# FaceStudio

A web-based batch image editor for intelligent face cropping, precise bounding-box editing, image adjustments,
and full-resolution batch export — designed for batches of 1 to 3,000 images.

> **Status:** import photos, detect faces, crop and adjust images, apply settings to a selection or the whole library, and download full-resolution results as a ZIP.
> Exports run in the background with progress, cancel, retry, and recovery after reload. The complete 1–3,000 realistic-image target is **not yet benchmarked**.
> See [`SKILLS.md` §H](./SKILLS.md#h-current-project-status) for detailed scope and verification.

## Requirements

- Node.js **≥ 26** (uses the built-in `node:sqlite` module)
- npm 12
- Google Chrome (for Playwright end-to-end tests)

## Getting started

```bash
npm install
npm run dev            # http://localhost:3100, starts web app + export worker
```

| Command                       | Purpose                                                 |
| ----------------------------- | ------------------------------------------------------- |
| `npm run dev`                 | Development web app and export worker on port 3100      |
| `npm run build` / `npm start` | Production build / web app + export worker on port 3100 |
| `npm run worker`              | Standalone export worker for custom process management  |
| `npm run typecheck`           | TypeScript (strict)                                     |
| `npm run lint`                | ESLint                                                  |
| `npm run format`              | Prettier                                                |
| `npm test`                    | Unit and component tests (Vitest)                       |
| `npm run test:e2e`            | End-to-end tests (Playwright, system Chrome)            |

Uploaded images are stored on the machine running the server, under `FS_STORAGE_DIR` (default `./.data/storage`, git-ignored): a SQLite database, the originals, and
generated thumbnails and previews. The export worker sweeps expired jobs/artifacts and idle sessions. Sessions idle for 24 hours are eligible for deletion; ZIP downloads expire after 24 hours by default. Optional server configuration lives in [`.env.example`](./.env.example).

## Export your batch

For composition, drag the crop or its handles and watch the live pixel dimensions. After you release, the view smoothly zooms into the crop, keeping the handles available. The **Auto zoom** toolbar toggle turns this off; manual zoom or **Fit** interrupts the movement. Reduced motion reframes immediately. Crop centers snap to the image center; hold **Alt** for free movement. **G** toggles thirds guides, **P** shows a clean crop preview, and **Escape** returns from Preview to editing; in the crop editor, **Escape removes the crop**, and Undo restores it. The floating toolbar also offers an undoable **Center crop** action. Arrow keys nudge by one pixel (**Shift**: ten), **Space + drag** pans, and **F** fits the image.

1. Import photos, open one, and set its crop, adjustments, and output size/quality.
2. Use the panel’s Apply to selected/all actions for a consistent batch.
3. Click **Export photos** in the toolbar. Choose Current image, Selected, or All images.
4. Keep each photo’s output settings or override the format. Optionally set a filename template and preserve folders.
5. Start export, then download the ZIP when ready. You can keep editing, close the dialog, or reload while processing continues.

Exports snapshot the current instructions, including changes still awaiting autosave. Later edits do not alter that export. Successful files remain downloadable if some images fail; **Retry failed** keeps the successes. Cancelling stops remaining work; already running images finish first. Source originals stay untouched.

Supported output formats are JPEG, PNG, and WebP. Templates support `{name}`, `{n}`, `{w}`, `{h}`, and `{mode}`; duplicate names get a suffix. One crop per image is supported. If an original is removed before its queued export renders, that item fails with a visible reason.

The standard commands supervise the worker automatically. If you manage it separately, give web and worker the same `NODE_ENV` and storage/environment configuration. Production launches need the `server/`, `src/lib/`, and worker runtime dependencies alongside the Next.js build.

## Documentation

[`SKILLS.md`](./SKILLS.md) is the single source of truth for product scope, the design system, architecture,
engineering rules, feature specifications, architecture decisions, and iteration history. Read it before changing code.

## Privacy

FaceStudio performs face **detection** only (locating faces to frame crops). It does not perform face recognition,
identity matching, or build biometric profiles.
