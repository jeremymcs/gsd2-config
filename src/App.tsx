// GSD2 Config - Main Application Component
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { Sidebar, SECTIONS, type SectionId } from "./components/Sidebar";
import { Palette } from "./components/Palette";
import { ShareModal } from "./components/ShareModal";
import { ThemeToggle } from "./components/ThemeToggle";
import { useDirty } from "./hooks/useDirty";
import { useShortcuts } from "./lib/keyboard";
import { useCloseRequested } from "./lib/tauriListeners";
import type { GSDPreferences } from "./types";

import { GeneralSection } from "./components/sections/GeneralSection";
import { ModelsSection } from "./components/sections/ModelsSection";
import { GitSection } from "./components/sections/GitSection";
import { SkillsSection } from "./components/sections/SkillsSection";
import { BudgetSection } from "./components/sections/BudgetSection";
import { NotificationsSection } from "./components/sections/NotificationsSection";
import { ParallelSection } from "./components/sections/ParallelSection";
import { PhasesSection } from "./components/sections/PhasesSection";
import { ContextSection } from "./components/sections/ContextSection";
import { SafetySection } from "./components/sections/SafetySection";
import { VerificationSection } from "./components/sections/VerificationSection";
import { DiscussionSection } from "./components/sections/DiscussionSection";
import { HooksSection } from "./components/sections/HooksSection";
import { RoutingSection } from "./components/sections/RoutingSection";
import { CmuxSection } from "./components/sections/CmuxSection";
import { RemoteSection } from "./components/sections/RemoteSection";
import { CodebaseSection } from "./components/sections/CodebaseSection";
import { ExperimentalSection } from "./components/sections/ExperimentalSection";
import { SkillsLibrarySection } from "./components/sections/SkillsLibrarySection";
import { AgentsLibrarySection } from "./components/sections/AgentsLibrarySection";
import { ApiKeysSection } from "./components/sections/ApiKeysSection";

type SaveStatus = "idle" | "saving" | "saved" | "error";
type Scope = "global" | "project";

const RECENT_PROJECTS_KEY = "gsd2-config.recent-projects";
const LAST_SCOPE_KEY = "gsd2-config.last-scope";
const LAST_PROJECT_KEY = "gsd2-config.last-project";

/** Strip undefined/null values and empty objects recursively for clean YAML output */
function cleanPrefs(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val === undefined || val === null) continue;
    if (Array.isArray(val)) {
      if (val.length > 0) result[key] = val;
    } else if (typeof val === "object") {
      const cleaned = cleanPrefs(val as Record<string, unknown>);
      if (Object.keys(cleaned).length > 0) result[key] = cleaned;
    } else {
      result[key] = val;
    }
  }
  return result;
}

function loadRecentProjects(): string[] {
  try {
    const stored = localStorage.getItem(RECENT_PROJECTS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveRecentProjects(projects: string[]) {
  try {
    localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(projects));
  } catch {
    // ignore
  }
}

export default function App() {
  const [section, setSection] = useState<SectionId>("general");
  const [prefs, setPrefs] = useState<GSDPreferences>({});
  const [originalPrefs, setOriginalPrefs] = useState<string>("{}");
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [filePath, setFilePath] = useState("");
  const [error, setError] = useState("");

  const [scope, setScope] = useState<Scope>(() => {
    const saved = localStorage.getItem(LAST_SCOPE_KEY);
    return saved === "project" ? "project" : "global";
  });
  const [projectPath, setProjectPath] = useState<string>(() => {
    return localStorage.getItem(LAST_PROJECT_KEY) ?? "";
  });
  const [recentProjects, setRecentProjects] = useState<string[]>(() => loadRecentProjects());

  const activeProjectPath = scope === "project" ? projectPath : undefined;

  const load = useCallback(async () => {
    try {
      setError("");
      const args = activeProjectPath ? { projectPath: activeProjectPath } : {};
      const data = await invoke<GSDPreferences>("load_preferences", args);
      setPrefs(data);
      setOriginalPrefs(JSON.stringify(data));
      const path = await invoke<string>("get_preferences_path", args);
      setFilePath(path);
    } catch (e) {
      setError(String(e));
      setPrefs({});
      setOriginalPrefs("{}");
    }
  }, [activeProjectPath]);

  useEffect(() => {
    // Only load when scope is global, or project with a valid path
    if (scope === "global" || (scope === "project" && projectPath)) {
      load();
    } else {
      setPrefs({});
      setOriginalPrefs("{}");
      setFilePath("");
    }
  }, [scope, projectPath, load]);

  const { isDirty, dirtySections } = useDirty(prefs, originalPrefs);

  // Keep a ref to the latest isDirty so the Tauri close-requested handler,
  // captured once on mount, always sees the current value.
  const isDirtyRef = useRef(isDirty);
  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  const [paletteOpen, setPaletteOpen] = useState(false);

  const save = async () => {
    setStatus("saving");
    try {
      const cleaned = cleanPrefs(prefs as unknown as Record<string, unknown>);
      const args: { preferences: unknown; projectPath?: string } = { preferences: cleaned };
      if (activeProjectPath) args.projectPath = activeProjectPath;
      await invoke("save_preferences", args);
      setOriginalPrefs(JSON.stringify(prefs));
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
    } catch (e) {
      setError(String(e));
      setStatus("error");
    }
  };

  const reset = () => {
    setPrefs(JSON.parse(originalPrefs));
  };

  const [shareOpen, setShareOpen] = useState(false);
  const [shareContent, setShareContent] = useState("");

  const exportPreset = async () => {
    try {
      setError("");
      const target = await saveDialog({
        title: "Export preset",
        defaultPath: "gsd.preset.md",
        filters: [{ name: "GSD Preset", extensions: ["preset.md", "md"] }],
      });
      if (!target) return;
      const cleaned = cleanPrefs(prefs as unknown as Record<string, unknown>);
      await invoke<string>("export_preset", {
        targetPath: target,
        preferences: cleaned,
      });
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
    } catch (e) {
      setError(String(e));
    }
  };

  const sharePreset = async () => {
    try {
      setError("");
      const cleaned = cleanPrefs(prefs as unknown as Record<string, unknown>);
      const content = await invoke<string>("build_shareable_preset", {
        preferences: cleaned,
      });
      setShareContent(content);
      setShareOpen(true);
    } catch (e) {
      setError(String(e));
    }
  };

  // Keep refs for shortcuts so handlers don't need to be re-memoized per render
  const saveRef = useRef(save);
  const resetRef = useRef(reset);
  useEffect(() => {
    saveRef.current = save;
    resetRef.current = reset;
  });

  const shortcutCtx = useRef<{
    section: SectionId;
    setSection: (s: SectionId) => void;
    setPaletteOpen: (v: boolean) => void;
  }>({ section, setSection, setPaletteOpen });
  useEffect(() => {
    shortcutCtx.current = { section, setSection, setPaletteOpen };
  });

  // ⌘K palette · ⌘S save · ⌘⇧Z discard · [/] section prev/next
  useShortcuts([
    {
      id: "palette",
      key: "k",
      mod: true,
      allowInInput: true,
      handler: (ev) => {
        ev.preventDefault();
        shortcutCtx.current.setPaletteOpen(true);
      },
    },
    {
      id: "save",
      key: "s",
      mod: true,
      handler: (ev) => {
        ev.preventDefault();
        if (isDirtyRef.current) saveRef.current();
      },
    },
    {
      id: "discard",
      key: "z",
      mod: true,
      shift: true,
      handler: (ev) => {
        ev.preventDefault();
        if (isDirtyRef.current) resetRef.current();
      },
    },
    {
      id: "section-next",
      key: "]",
      handler: (ev) => {
        ev.preventDefault();
        const cur = SECTIONS.findIndex((s) => s.id === shortcutCtx.current.section);
        const next = SECTIONS[(cur + 1) % SECTIONS.length];
        if (next) shortcutCtx.current.setSection(next.id);
      },
    },
    {
      id: "section-prev",
      key: "[",
      handler: (ev) => {
        ev.preventDefault();
        const cur = SECTIONS.findIndex((s) => s.id === shortcutCtx.current.section);
        const prev = SECTIONS[(cur - 1 + SECTIONS.length) % SECTIONS.length];
        if (prev) shortcutCtx.current.setSection(prev.id);
      },
    },
  ]);

  // Window close guard — prompt before closing with unsaved changes
  useCloseRequested(
    async (event) => {
      if (!isDirtyRef.current) return;
      const ok = confirm("You have unsaved changes. Close anyway?");
      if (!ok) event.preventDefault();
    },
    [],
  );

  const browseProject = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select Project Folder",
      });
      if (typeof selected === "string" && selected) {
        setProjectPath(selected);
        localStorage.setItem(LAST_PROJECT_KEY, selected);

        // Update recent projects (most recent first, max 5)
        const updated = [selected, ...recentProjects.filter((p) => p !== selected)].slice(0, 5);
        setRecentProjects(updated);
        saveRecentProjects(updated);
      }
    } catch (e) {
      setError(String(e));
    }
  };

  const selectScope = (s: Scope) => {
    if (isDirty) {
      const ok = confirm("You have unsaved changes. Discard them and switch scope?");
      if (!ok) return;
    }
    setScope(s);
    localStorage.setItem(LAST_SCOPE_KEY, s);
  };

  const selectRecentProject = (path: string) => {
    if (isDirty) {
      const ok = confirm("You have unsaved changes. Discard them and switch project?");
      if (!ok) return;
    }
    setProjectPath(path);
    localStorage.setItem(LAST_PROJECT_KEY, path);
  };

  const shortPath = (p: string) => {
    const parts = p.split("/");
    return parts[parts.length - 1] || p;
  };

  const renderSection = () => {
    const props = { prefs, onChange: setPrefs };
    switch (section) {
      case "skills-library": return <SkillsLibrarySection projectPath={projectPath || undefined} />;
      case "agents-library": return <AgentsLibrarySection projectPath={projectPath || undefined} />;
      case "api-keys": return <ApiKeysSection />;
      case "general": return <GeneralSection {...props} />;
      case "models": return <ModelsSection {...props} />;
      case "git": return <GitSection {...props} />;
      case "skills": return <SkillsSection {...props} />;
      case "budget": return <BudgetSection {...props} />;
      case "notifications": return <NotificationsSection {...props} />;
      case "parallel": return <ParallelSection {...props} />;
      case "phases": return <PhasesSection {...props} />;
      case "context": return <ContextSection {...props} />;
      case "safety": return <SafetySection {...props} />;
      case "verification": return <VerificationSection {...props} />;
      case "discussion": return <DiscussionSection {...props} />;
      case "hooks": return <HooksSection {...props} />;
      case "routing": return <RoutingSection {...props} />;
      case "cmux": return <CmuxSection {...props} />;
      case "remote": return <RemoteSection {...props} />;
      case "codebase": return <CodebaseSection {...props} />;
      case "experimental": return <ExperimentalSection {...props} />;
    }
  };

  // These sections are independent of preferences load state
  const isLibrarySection =
    section === "skills-library" || section === "agents-library" || section === "api-keys";
  // Library sections with split panes need fixed-height flex layout
  const needsFixedHeight = section === "skills-library" || section === "agents-library";
  const isSkillsLibrary = isLibrarySection;

  const needsProjectSelection = scope === "project" && !projectPath;

  return (
    <div className="flex h-screen overflow-hidden">
      <Palette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onNavigate={(target) => setSection(target)}
      />
      <ShareModal
        open={shareOpen}
        content={shareContent}
        onClose={() => setShareOpen(false)}
      />
      <Sidebar active={section} onSelect={setSection} dirtySections={dirtySections} />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar - scope selector */}
        <header className="flex items-center justify-between px-6 py-3 border-b border-gsd-border bg-gsd-surface shrink-0 gap-4">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {/* Scope pill */}
            <div className="flex rounded-md border border-gsd-border overflow-hidden shrink-0">
              <button
                onClick={() => selectScope("global")}
                className={`px-3 py-1 text-xs font-medium transition-colors ${
                  scope === "global"
                    ? "bg-gsd-accent text-gsd-on-accent"
                    : "bg-gsd-bg text-gsd-text-dim hover:text-gsd-text"
                }`}
              >
                Global
              </button>
              <button
                onClick={() => selectScope("project")}
                className={`px-3 py-1 text-xs font-medium transition-colors ${
                  scope === "project"
                    ? "bg-gsd-accent text-gsd-on-accent"
                    : "bg-gsd-bg text-gsd-text-dim hover:text-gsd-text"
                }`}
              >
                Project
              </button>
            </div>

            {/* Project picker (when project scope active) */}
            {scope === "project" && (
              <div className="flex items-center gap-2 min-w-0">
                <button
                  onClick={browseProject}
                  className="px-3 py-1 text-xs rounded-md border border-gsd-border text-gsd-text-dim hover:text-gsd-text hover:bg-gsd-surface-hover shrink-0"
                >
                  Browse...
                </button>
                {projectPath && (
                  <span className="text-xs text-gsd-text truncate font-medium" title={projectPath}>
                    {shortPath(projectPath)}
                  </span>
                )}
                {recentProjects.length > 0 && (
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) selectRecentProject(e.target.value);
                    }}
                    className="text-xs max-w-40"
                  >
                    <option value="">Recent...</option>
                    {recentProjects.map((p) => (
                      <option key={p} value={p}>
                        {shortPath(p)}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {/* File path (when loaded) */}
            {filePath && !needsProjectSelection && (
              <div className="text-xs text-gsd-text-dim truncate" title={filePath}>
                {filePath}
              </div>
            )}
          </div>

          {/* Save/Discard/Export/Share/Theme buttons (hidden on Skills Library which has its own per-file save) */}
          {!isSkillsLibrary && (
            <div className="flex items-center gap-2 shrink-0">
              <ThemeToggle />
              <div className="w-px h-5 bg-gsd-border mx-1" />
              <button
                onClick={exportPreset}
                disabled={needsProjectSelection}
                title="Export current preferences to a .preset.md file"
                className="px-3 py-1.5 text-xs rounded-md border border-gsd-border text-gsd-text-dim hover:text-gsd-text hover:bg-gsd-surface-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Export
              </button>
              <button
                onClick={sharePreset}
                disabled={needsProjectSelection}
                title="Copy a redacted shareable YAML block to clipboard"
                className="px-3 py-1.5 text-xs rounded-md border border-gsd-border text-gsd-text-dim hover:text-gsd-text hover:bg-gsd-surface-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Share
              </button>
              <div className="w-px h-5 bg-gsd-border mx-1" />
              {isDirty && (
                <button
                  onClick={reset}
                  className="px-3 py-1.5 text-xs rounded-md border border-gsd-border text-gsd-text-dim hover:text-gsd-text hover:bg-gsd-surface-hover transition-colors"
                >
                  Discard
                </button>
              )}
              <button
                onClick={save}
                disabled={!isDirty || status === "saving" || needsProjectSelection}
                className={`px-4 py-1.5 text-xs rounded-md font-medium transition-colors ${
                  isDirty && !needsProjectSelection
                    ? "bg-gsd-accent text-gsd-on-accent hover:bg-gsd-accent-hover"
                    : "bg-gsd-border text-gsd-text-dim cursor-not-allowed"
                }`}
              >
                {status === "saving" ? "Saving..." : status === "saved" ? "Saved" : "Save"}
              </button>
            </div>
          )}
        </header>

        {/* Error banner */}
        {error && (
          <div className="px-6 py-2 bg-gsd-danger/10 border-b border-gsd-danger/30 text-gsd-danger text-xs flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError("")} className="ml-2 hover:text-red-300">dismiss</button>
          </div>
        )}

        {/* Content */}
        <main
          className={`flex-1 px-6 py-5 ${
            needsFixedHeight
              ? "overflow-hidden flex flex-col"
              : "overflow-y-auto"
          }`}
        >
          {needsProjectSelection && !isLibrarySection ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="text-4xl mb-3">📁</div>
              <h2 className="text-lg font-semibold text-gsd-text mb-2">No project selected</h2>
              <p className="text-sm text-gsd-text-dim mb-4 max-w-md">
                Browse to a project folder to edit its <code className="text-xs bg-gsd-surface px-1.5 py-0.5 rounded">.gsd/preferences.md</code> file.
              </p>
              <button
                onClick={browseProject}
                className="px-4 py-2 text-sm rounded-md bg-gsd-accent text-gsd-on-accent font-medium hover:bg-gsd-accent-hover transition-colors"
              >
                Browse for Project...
              </button>
            </div>
          ) : (
            renderSection()
          )}
        </main>
      </div>
    </div>
  );
}
