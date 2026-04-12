# GSD Settings App - Implementation Plan
// GSD Settings App - Tauri Desktop Application
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

## Overview
A Tauri v2 desktop app providing a GUI for all GSD-2 preferences stored in `~/.gsd/preferences.md`.

## Tech Stack
- **Desktop Shell**: Tauri v2 (Rust)
- **Frontend**: React 19 + TypeScript + Tailwind CSS v4
- **Config Format**: YAML frontmatter in markdown files

## Architecture
- Rust backend reads/writes `~/.gsd/preferences.md` (YAML frontmatter between `---` markers)
- React frontend organized by settings sections
- Tauri IPC commands: `load_preferences`, `save_preferences`
- Settings grouped into logical sections matching GSD's preference structure

## Settings Sections
1. **General** - mode, version, token_profile, widget_mode, search_provider, etc.
2. **Models** - per-phase model selection with fallback support
3. **Git** - auto_push, isolation, merge_strategy, etc.
4. **Skills** - always_use, prefer, avoid, rules, discovery
5. **Budget & Cost** - ceiling, enforcement, show_token_cost, service_tier
6. **Notifications** - enabled, per-event toggles
7. **Parallel Execution** - enabled, max_workers, merge_strategy
8. **Hooks** - post_unit_hooks, pre_dispatch_hooks
9. **Context Management** - observation masking, compaction, tool result limits
10. **Safety & Verification** - safety_harness, enhanced_verification
11. **Discussion** - preparation, web_research, depth
12. **Advanced** - experimental, codebase map, dynamic routing, cmux, remote_questions

## File Structure
```
gsd-setup/
├── src-tauri/
│   ├── src/
│   │   ├── main.rs
│   │   └── lib.rs          # Tauri commands
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── types.ts             # GSD preference types
│   ├── components/
│   │   ├── Sidebar.tsx
│   │   ├── SettingsSection.tsx
│   │   └── sections/
│   │       ├── GeneralSection.tsx
│   │       ├── ModelsSection.tsx
│   │       ├── GitSection.tsx
│   │       └── ... (one per section)
│   └── styles/
│       └── index.css
├── index.html
├── package.json
├── tsconfig.json
├── tailwind.config.js
└── vite.config.ts
```
