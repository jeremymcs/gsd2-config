# GSD Setup — QOL & Features Plan v1
// GSD Setup — QOL and Features Implementation Plan
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

## Scope

Deliver the following in one coordinated effort, sequenced into 5 stages so each stage builds/ships cleanly:

**High-impact QOL**
1. ⌘K command palette (jump to any section/field)
2. Per-section dirty indicator in sidebar
3. Unsaved-changes window-close guard

**Features**
6. Preset import/export
7. Project → Global diff view
8. Validation layer (inline field validation)
9. Config doctor (scan + repair)
10. Backup / history with restore
11. Section-level reset
12. Keyboard shortcuts (⌘S, ⌘Z, ⌘K, j/k nav)
13. Inline template hints (field tooltips)
14. Recent-project pinning, reordering, staleness
15. Dark / light theme toggle

**Lower priority**
16. Drag-to-reorder in list sections (hooks, routing, skill_rules)
17. Shareable config export (redacted, copyable blob — **not** a hosted gist)
18. CLI companion (`gsd-setup` headless apply)

## Architecture touchpoints

| Area | Existing | Change |
|---|---|---|
| `src-tauri/src/lib.rs` | preferences + skills + keyring commands | Add: diff, validate, doctor, history (list/restore/snapshot), preset (export/import), theme-agnostic (noop) |
| `src/App.tsx` | Top-level state, save/reset, scope | Extract dirty-tracking to a hook; add palette, keyboard shortcuts, close guard |
| `src/components/Sidebar.tsx` | Static section groups | Accept `dirtySections: Set<SectionId>`; render dot |
| `src/components/sections/*` | 20 flat sections | Wrap with section-id context so `useSectionDirty` can register field paths |
| `src/types.ts` | Preference types | Add field-metadata registry (label, hint, validator, json-path) |
| New: `src/lib/fields.ts` | — | Central field registry used by palette, hints, validation, doctor |
| New: `src/lib/validators.ts` | — | Pure-TS validators (model IDs, paths, cron, regex, numeric ranges) |
| New: `src/hooks/useDirty.ts` | — | Granular per-section dirty detection |
| New: `src/components/Palette.tsx` | — | ⌘K overlay |
| New: `src/components/DiffModal.tsx` | — | Before/after save preview + project/global compare |
| New: `src/components/HistoryPanel.tsx` | — | Backup list with restore |
| New: `src-tauri/src/history.rs` | — | Snapshot ring buffer in `.gsd/history/` |
| New: `src-tauri/src/validate.rs` | — | Doctor scans |
| New binary: `src-tauri/src/bin/gsd-setup-cli.rs` | — | Headless apply (Stage 5 only) |

## Stage breakdown

### Stage 0 — Foundation (no user-visible change)
- **Extract Rust `core` module now** — create `src-tauri/src/core/mod.rs` holding preferences serialization, path resolution, frontmatter parse. `lib.rs` becomes a thin Tauri-command layer. This unblocks Stages 3-5 cleanly; deferring it causes a rewrite later.
- **Lock the YAML round-trip contract**: add a Rust test that loads every section's representative values, saves, reloads, and asserts equality. Diff/doctor/presets all depend on this being stable.
- **Atomic write helper** in `core`: `write_atomic(path, bytes)` using temp-file + rename. Used by `save_preferences` AND future history snapshots.
- **Per-scope file mutex** in `core`: `Mutex<()>` keyed by canonical path, held across read-modify-write. Prevents races if two windows edit the same prefs file.
- Create `src/lib/fields.ts`: field registry as `const fields = { 'git.auto_push': { ... }, ... } as const`, then `export type FieldPath = keyof typeof fields`
  - Shape: `{ section, label, hint, type, validator?, example? }` (path is the key)
  - One-time codegen bootstrap (`scripts/seed-fields.ts`) parses section JSX to emit the initial file; after that the typed registry is the permanent source of truth, codegen is never re-run
  - All form controls use `bindField(path: FieldPath)` which emits `data-field-path={path}` automatically — no grep CI check needed, TypeScript enforces coverage
- Create `src/hooks/useDirty.ts`: diffs `prefs` vs `originalPrefs` and returns `Set<SectionId>` of sections with changes (by walking field registry → section mapping)
- Create `src/lib/validators.ts` (pure TS, no IPC): numeric ranges, enum membership, regex shapes, path-string sanity
- Add `src/lib/keyboard.ts`: global shortcut manager (register/unregister by id)
- Add `src/lib/tauriListeners.ts`: helper that wraps `onCloseRequested` / `onThemeChanged` and returns a React-friendly unlisten effect (prevents HMR duplicate-dialog bugs)

**Build check:** `npm run build` + `cargo test` — must pass with no behavior change.

### Stage 1 — High-impact QOL (1, 2, 3) + #12

1. **Dirty dots** — Sidebar renders `•` next to sections in `useDirty()` result
2. **⌘K palette** — `Palette.tsx`
   - Opens on ⌘K / Ctrl+K
   - Searches field registry: substring + token-prefix match on label, section, hint, path (fuzzy deferred; harder to test on short config field names)
   - Enter → navigates to section + focuses the field (via `data-field-path` attribute + scroll-into-view)
3. **Window close guard** — `getCurrentWindow().onCloseRequested` in `App.tsx` via `tauriListeners.ts`; if `isDirty`, `preventDefault()` + show dialog
   - **Audit `destroy()` call sites first** — `destroy()` bypasses `onCloseRequested`. Grep the codebase; replace any force-close paths with `close()` before shipping the guard, or the guard is a lie.
   - Register `unlisten()` on unmount to avoid duplicate dialogs under Vite HMR
4. **Keyboard shortcuts** — ⌘S save, ⌘Shift+Z discard (discards only unsaved diff, no section-reset yet), ⌘K palette, `[`/`]` section prev/next

**Note:** Section-level reset (#11) moves to Stage 3 and ships alongside the history panel. Resetting a section with no rollback is a data-loss footgun; wait until Restore exists.

**Build check:** `npm run build` + manual smoke: dirty dot appears/disappears, palette jumps, close guard fires, HMR reload does not stack dialogs.

### Stage 2 — Validation + hints + theme (#8, #13, #15)

1. **Validation** — `FormControls.tsx` reads validator from field registry, shows inline red border + message
2. **Hints** — Small `(?)` icon next to each field label, tooltip from `fields.ts.hint`
3. **Theme toggle** — Settings section or header toggle, persisted in localStorage; add `.light` variant of Tailwind theme tokens in `index.css`
   - Tailwind v4 `@theme` dark/light split
   - Default: follow system (`prefers-color-scheme`)

**Build check:** `npm run build`; verify no unstyled elements in light theme.

### Stage 3 — History + diff + doctor + section reset (#4-equivalent, #7, #9, #10, #11)

**Rust** (all built on the `core` module extracted in Stage 0)
- `core/history.rs`:
  - On every `save_preferences`, snapshot prior content via `write_atomic` to `.gsd/history/{unix_ms}-{counter}.md` (scope-matched). Temp-file + rename is required — the timestamp+counter suffix alone is not crash-safe.
  - Keep last 20 per scope (count-based ring buffer; age-based pruning deferred to v2 unless users report noise)
  - Commands: `list_history(scope, project_path)`, `restore_history(id, scope, project_path)`, `diff_history(id)`
- `core/validate.rs`:
  - `doctor_scan(project_path)` → `Vec<DoctorFinding { severity, code, message, path, fix? }>`
  - Checks: stale model IDs (compared to known list), missing skill references, broken hook command paths, invalid cron, numeric out-of-range
  - **Scope: current project + global only.** "Scan all recent projects" is an explicit future feature, not a hidden toggle, to prevent Stage 3 scope creep.
- Extend `save_preferences` to compute & return a diff summary so frontend can show "X keys changed" toast
- New command: `compare_scopes(project_path)` → returns per-key `{ global, project, effective }` for diff view

**Frontend**
- `HistoryPanel.tsx` — timeline, preview, "Restore" (confirms via `DiffModal`, then writes)
- `DiffModal.tsx` — reused for:
  - Save preview (before/after)
  - Project↔Global overlap
  - History restore preview
  - Section reset preview
- Config doctor section: table of findings with "Apply fix" / "Jump to field"
- **Section-level reset (#11)**: "Reset section" button in each section header. Shows a `DiffModal` preview, and on confirm snapshots current state to history before applying the reset — so the user can always restore.

**Build check:** `npm run build` + `cargo check` + `cargo test` in `src-tauri/`.

### Stage 4 — Presets + shareable export + recent project polish (#6, #14, #17)

- **Presets**: export current prefs as standalone `.md` to a chosen path; import reads a file, shows diff modal, applies on confirm
  - Reuses `save_preferences` serialization — no new YAML code
- **Shareable export**: copy-to-clipboard a ````yaml ... ```` fenced block with API keys stripped (API keys already live in keychain, not prefs — low risk, but explicitly filter `*_KEY`, `*_TOKEN` just in case custom_instructions contains them)
- **Recent projects**: new Tauri command `project_meta(path)` returns `{ lastModified, exists }`; header dropdown shows pin icon, drag-to-reorder, stale indicator (> 30 days gray)

**Build check:** `npm run build` + `cargo check`.

### Stage 5 — CLI companion (#18)

- **CLI companion**: new Cargo binary `gsd-setup-cli` in `src-tauri/src/bin/gsd-setup-cli.rs`
  - Subcommands: `apply <preset.md> [--project PATH]`, `diff [--project PATH]`, `doctor [--project PATH]`, `history list/restore`
  - Imports the `core` module extracted in Stage 0 — one source of truth for GUI and CLI
  - **Separate binary, not a `--cli` flag** on the GUI. The Tauri `plugin-cli` docs call out Windows console output issues when a windowed app writes to stdout; a standalone binary sidesteps this entirely.
  - Ships alongside the Tauri binary (bundled in release archive, installable via `cargo install --path src-tauri --bin gsd-setup-cli`)

**Build check:** `npm run build` + `cargo build --bin gsd-setup-cli`.

### Deferred (not in this plan)

- **#16 Drag-to-reorder in list sections** — deferred indefinitely. Makes array positions semantically meaningful, which complicates diffs, history, and doctor checks. Revisit only if users report pain with the current add/remove model.
- **Scan-all-recent-projects doctor mode** — opt-in action for a future plan version.
- **Age-based history pruning** — revisit if 20-snapshot count-based cap proves noisy.

## Non-goals / explicit cuts

- **No hosted gist / external upload**: #17 is clipboard-only. Uploading config to third-party services is explicitly out of scope (privacy + blast radius).
- **No schema migration**: if a field is removed from GSD-2, the doctor flags it but does not auto-delete.
- **No live-watch**: backups happen on save, not on external file changes.
- **No undo stack beyond history**: ⌘Z discards unsaved changes, full undo lives in the history panel.

## Risks

| Risk | Mitigation |
|---|---|
| Field registry drift from section components | Typed `FieldPath = keyof typeof fields`; `bindField(path)` is the only way to create form inputs, so TypeScript fails the build on any unregistered field. No grep script needed. |
| YAML round-trip key order changes | Stage 0 adds a Rust round-trip test that fails if keys reorder. Diff/doctor/presets all assume this contract. |
| History ring buffer race on rapid saves | ms-precision filename + counter suffix **+** atomic temp-file-rename write. Filename suffix alone is not crash-safe. |
| Concurrent saves from two open windows | Per-scope file mutex in `core`, held across read-modify-write. |
| `destroy()` bypasses close guard | Stage 1 audits and removes any `destroy()` call sites before the guard ships. |
| Tauri listener leaks under Vite HMR | `tauriListeners.ts` helper enforces `unlisten()` on unmount. |
| Light theme reveals missing color tokens | Stage 2 ends with a full visual sweep of every section. |
| CLI binary drifts from GUI behavior | Both consume the same `core` module — one source of truth. |
| Tauri Windows console output | Use a separate `gsd-setup-cli` binary, not a windowed-app CLI flag. |

## Resolved design decisions (from peer review)

1. **Field registry seeding**: one-time codegen bootstrap → typed `as const` registry as permanent source of truth. Codegen never re-runs.
2. **Theme**: three-way toggle `system | dark | light`, default `system` (respects `prefers-color-scheme`).
3. **History retention**: 20 snapshots per scope, count-based. Age-based pruning deferred.
4. **Doctor scope**: current project + global only. Scan-all-recent-projects is an explicit future feature.
5. **CLI bundling**: separate binary (`gsd-setup-cli`) sharing the `core` module, not a `--cli` flag.
6. **Palette search**: substring + token-prefix match. Fuzzy deferred (too ambiguous on short field names).
7. **Stage cadence**: merge each stage individually. Easier to bisect regressions.

## Resolved (user: "your call on all")

- **Drag reorder**: cut entirely. Revisit only if management of hook/routing lists becomes painful.
- **Shareable export**: confirm-before-copy modal shows the exact bytes that will hit the clipboard, with the redacted view highlighted.
- **Preset format**: distinct `.preset.md` extension. Import dialog filters on it; export writes with it. Prevents accidental open-as-live-prefs.

## Rollout

- Each stage = one commit, build-green, manual smoke test
- No co-author trailer on commits (per global rule 6)
- Update `.plans/qol-and-features-v1.md` with ✅ per stage as shipped
- Update `README.md` / in-app "General" section blurb with new keyboard shortcuts after Stage 1
