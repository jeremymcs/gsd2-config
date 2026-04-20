// GSD2 Config - Main Application Component
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { Sidebar, SECTIONS, type SectionId } from "./components/Sidebar";
import { Palette } from "./components/Palette";
import { ShareModal } from "./components/ShareModal";
import { ThemeToggle } from "./components/ThemeToggle";
import { useDirty } from "./hooks/useDirty";
import { useShortcuts } from "./lib/keyboard";
import { useCloseRequested } from "./lib/tauriListeners";
import { usePersistentWebviewZoom } from "./lib/zoom";
import { MODEL_CATALOG, type ProviderCatalog } from "./constants";
import { mergeCustomProviders } from "./lib/customProviders";
import {
  checkForUpdate,
  downloadAndInstallUpdate,
  type UpdateCheck,
} from "./lib/updater";
import type { GSDPreferences, GSDModelsConfig } from "./types";

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
import { CustomProvidersSection } from "./components/sections/CustomProvidersSection";
import { AgentSettingsSection } from "./components/sections/AgentSettingsSection";

type SaveStatus = "idle" | "saving" | "saved" | "error";
type Scope = "global" | "project";

const RECENT_PROJECTS_KEY = "gsd2-config.recent-projects";
const LAST_SCOPE_KEY = "gsd2-config.last-scope";
const LAST_PROJECT_KEY = "gsd2-config.last-project";
const CUSTOM_MODELS_ONLY_KEY = "gsd2-config.custom-models-only";

/**
 * Strip undefined/null values and empty objects recursively for clean YAML output.
 *
 * Known limitation: empty arrays are pruned (a user clearing a list to `[]`
 * loses the key on save). Intentional for now — users don't typically
 * distinguish "unset" from "empty" for these fields. See
 * .plans/qol-and-features-v1.md before changing.
 */
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
  usePersistentWebviewZoom();

  const [section, setSection] = useState<SectionId>("general");
  const [prefs, setPrefs] = useState<GSDPreferences>({});
  const [originalPrefs, setOriginalPrefs] = useState<string>("{}");
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [savedCount, setSavedCount] = useState(0);
  const [filePath, setFilePath] = useState("");
  const [error, setError] = useState("");
  const [pendingFocus, setPendingFocus] = useState<string | null>(null);

  const [scope, setScope] = useState<Scope>(() => {
    const saved = localStorage.getItem(LAST_SCOPE_KEY);
    return saved === "project" ? "project" : "global";
  });
  const [projectPath, setProjectPath] = useState<string>(() => {
    return localStorage.getItem(LAST_PROJECT_KEY) ?? "";
  });
  const [recentProjects, setRecentProjects] = useState<string[]>(() => loadRecentProjects());

  // Second config document: ~/.gsd/agent/models.json (or project equivalent).
  // Tracked independently of PREFERENCES.md — same dirty/save flow, its own
  // mtime baseline for cross-process staleness detection.
  const [modelsDoc, setModelsDoc] = useState<GSDModelsConfig>({});
  const [originalModels, setOriginalModels] = useState<string>("{}");
  const [modelsMtime, setModelsMtime] = useState<number>(0);
  const [customModelsOnly, setCustomModelsOnlyState] = useState<boolean>(() => {
    return localStorage.getItem(CUSTOM_MODELS_ONLY_KEY) === "true";
  });
  const setCustomModelsOnly = useCallback((next: boolean) => {
    setCustomModelsOnlyState(next);
    localStorage.setItem(CUSTOM_MODELS_ONLY_KEY, String(next));
  }, []);
  const modelCatalog: readonly ProviderCatalog[] = useMemo(
    () => mergeCustomProviders(MODEL_CATALOG, modelsDoc, { customOnly: customModelsOnly }).catalog,
    [modelsDoc, customModelsOnly],
  );

  // Third config document: ~/.gsd/agent/settings.json (Claude Code settings).
  // Free-form Record so unknown keys (hooks, enterprise fields) round-trip.
  const [settingsDoc, setSettingsDoc] = useState<Record<string, unknown>>({});
  const [originalSettings, setOriginalSettings] = useState<string>("{}");
  const [settingsMtime, setSettingsMtime] = useState<number>(0);

  // Auto-update state. Silent check runs once on mount; banner appears only
  // if an update is available and the user hasn't dismissed it this session.
  const [updateInfo, setUpdateInfo] = useState<UpdateCheck | null>(null);
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const [updateInstalling, setUpdateInstalling] = useState(false);
  const [updateChecking, setUpdateChecking] = useState(false);

  const runUpdateCheck = useCallback(async (manual: boolean) => {
    setUpdateChecking(true);
    try {
      const result = await checkForUpdate();
      setUpdateInfo(result);
      if (manual) setUpdateDismissed(false);
    } finally {
      setUpdateChecking(false);
    }
  }, []);

  useEffect(() => {
    // Silent check on mount — errors swallowed inside checkForUpdate().
    runUpdateCheck(false);
  }, [runUpdateCheck]);

  const installUpdate = async () => {
    if (!updateInfo?.handle) return;
    setUpdateInstalling(true);
    try {
      await downloadAndInstallUpdate(updateInfo.handle);
      // If relaunch() returns, something's off — leave the banner spinning
      // so the user knows install finished but relaunch didn't fire.
    } catch (e) {
      setError(`Update failed: ${String(e)}`);
      setUpdateInstalling(false);
    }
  };

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
      // models.json — second document, independent failure domain. A missing
      // or malformed file should not block preferences editing.
      try {
        const snap = await invoke<{ value: GSDModelsConfig | null; mtime_ms: number }>(
          "load_models",
          args,
        );
        const next = snap.value ?? {};
        setModelsDoc(next);
        setOriginalModels(JSON.stringify(next));
        setModelsMtime(snap.mtime_ms ?? 0);
      } catch (modelsErr) {
        console.warn("load_models failed:", modelsErr);
        setModelsDoc({});
        setOriginalModels("{}");
        setModelsMtime(0);
      }
      // settings.json — third document, independent failure domain.
      try {
        const snap = await invoke<{
          value: Record<string, unknown> | null;
          mtime_ms: number;
        }>("load_settings", args);
        const next = snap.value ?? {};
        setSettingsDoc(next);
        setOriginalSettings(JSON.stringify(next));
        setSettingsMtime(snap.mtime_ms ?? 0);
      } catch (settingsErr) {
        console.warn("load_settings failed:", settingsErr);
        setSettingsDoc({});
        setOriginalSettings("{}");
        setSettingsMtime(0);
      }
    } catch (e) {
      setError(String(e));
      setPrefs({});
      setOriginalPrefs("{}");
      setModelsDoc({});
      setOriginalModels("{}");
      setModelsMtime(0);
      setSettingsDoc({});
      setOriginalSettings("{}");
      setSettingsMtime(0);
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

  const { isDirty, dirtySections, dirtyPaths } = useDirty(prefs, originalPrefs);

  // models.json dirty check — simple JSON-string compare since the doc is a
  // free-form registry shape and field-level paths don't make sense here.
  const isModelsDirty = useMemo(
    () => JSON.stringify(modelsDoc) !== originalModels,
    [modelsDoc, originalModels],
  );
  const isSettingsDirty = useMemo(
    () => JSON.stringify(settingsDoc) !== originalSettings,
    [settingsDoc, originalSettings],
  );
  const anyDirty = isDirty || isModelsDirty || isSettingsDirty;

  // Keep a ref to the latest any-doc dirty flag so the Tauri close-requested
  // handler, captured once on mount, always sees the current value.
  const isDirtyRef = useRef(anyDirty);
  useEffect(() => {
    isDirtyRef.current = anyDirty;
  }, [anyDirty]);

  const [paletteOpen, setPaletteOpen] = useState(false);

  const save = async () => {
    const count =
      dirtyPaths.length + (isModelsDirty ? 1 : 0) + (isSettingsDirty ? 1 : 0);
    setStatus("saving");
    setError("");
    const errs: string[] = [];

    // Preferences — independent failure domain. On failure, leave prefs
    // dirty so the user can retry without losing in-progress edits.
    if (isDirty) {
      try {
        const cleaned = cleanPrefs(prefs as unknown as Record<string, unknown>);
        const args: { preferences: unknown; projectPath?: string } = { preferences: cleaned };
        if (activeProjectPath) args.projectPath = activeProjectPath;
        await invoke("save_preferences", args);
        setOriginalPrefs(JSON.stringify(prefs));
      } catch (e) {
        errs.push(`Preferences: ${String(e)}`);
      }
    }

    // models.json — independent. Pass expected_mtime_ms so GSD2 writing to
    // this file concurrently gets caught (backend returns STALE: prefix).
    if (isModelsDirty) {
      try {
        const args: {
          models: unknown;
          expectedMtimeMs: number | null;
          projectPath?: string;
        } = {
          models: modelsDoc,
          expectedMtimeMs: modelsMtime > 0 ? modelsMtime : null,
        };
        if (activeProjectPath) args.projectPath = activeProjectPath;
        const newMtime = await invoke<number>("save_models", args);
        setOriginalModels(JSON.stringify(modelsDoc));
        setModelsMtime(newMtime);
      } catch (e) {
        const msg = String(e);
        if (msg.includes("STALE:")) {
          errs.push(
            "Custom providers: file was changed on disk by GSD2. Reload the app to pick up external changes, then retry your edits.",
          );
        } else {
          errs.push(`Custom providers: ${msg}`);
        }
      }
    }

    // settings.json — independent failure domain. Raw round-trip: do NOT run
    // through cleanPrefs (would prune empty permission arrays etc.).
    if (isSettingsDirty) {
      try {
        const args: {
          settings: unknown;
          expectedMtimeMs: number | null;
          projectPath?: string;
        } = {
          settings: settingsDoc,
          expectedMtimeMs: settingsMtime > 0 ? settingsMtime : null,
        };
        if (activeProjectPath) args.projectPath = activeProjectPath;
        const newMtime = await invoke<number>("save_settings", args);
        setOriginalSettings(JSON.stringify(settingsDoc));
        setSettingsMtime(newMtime);
      } catch (e) {
        const msg = String(e);
        if (msg.includes("STALE:")) {
          errs.push(
            "Agent settings: file was changed on disk by another process. Reload the app to pick up external changes, then retry your edits.",
          );
        } else {
          errs.push(`Agent settings: ${msg}`);
        }
      }
    }

    if (errs.length > 0) {
      setError(errs.join("\n"));
      setStatus("error");
    } else {
      setSavedCount(count);
      setStatus("saved");
      setTimeout(() => {
        setStatus("idle");
        setSavedCount(0);
      }, 2000);
    }
  };

  const reset = () => {
    setPrefs(JSON.parse(originalPrefs));
    setModelsDoc(JSON.parse(originalModels));
    setSettingsDoc(JSON.parse(originalSettings));
  };

  const [shareOpen, setShareOpen] = useState(false);
  const [shareContent, setShareContent] = useState("");

  const importPreset = async () => {
    try {
      setError("");
      const picked = await open({
        title: "Import preset",
        multiple: false,
        directory: false,
        filters: [{ name: "GSD Preset", extensions: ["preset.md", "md"] }],
      });
      if (typeof picked !== "string" || !picked) return;
      const loaded = await invoke<GSDPreferences>("import_preset", {
        sourcePath: picked,
      });
      // Stay dirty on purpose — user reviews + clicks Save to commit.
      setPrefs(loaded);
    } catch (e) {
      setError(String(e));
    }
  };

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

  // ⌘K → field focus: when the palette picks a field, scroll it into view and
  // flash a ring on the row. The section must render first (pendingFocus is
  // set alongside setSection), so we defer to the next frame before querying
  // the DOM. data-field-path lives on the Field wrapper in FormControls.tsx.
  useEffect(() => {
    if (!pendingFocus) return;
    const path = pendingFocus;
    const raf = requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(
        `[data-field-path="${CSS.escape(path)}"]`,
      );
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        el.classList.add("gsd-field-focus");
        window.setTimeout(() => el.classList.remove("gsd-field-focus"), 1500);
      }
      setPendingFocus(null);
    });
    return () => cancelAnimationFrame(raf);
  }, [pendingFocus, section]);

  // Window close guard — prompt before closing with unsaved changes
  useCloseRequested(
    async (event) => {
      event.preventDefault();
      if (isDirtyRef.current) {
        const ok = confirm("You have unsaved changes. Close anyway?");
        if (!ok) return;
      }
      await invoke("close_window");
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
    if (anyDirty) {
      const ok = confirm("You have unsaved changes. Discard them and switch scope?");
      if (!ok) return;
    }
    setScope(s);
    localStorage.setItem(LAST_SCOPE_KEY, s);
  };

  const selectRecentProject = (path: string) => {
    if (anyDirty) {
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
      case "custom-providers":
        return (
          <CustomProvidersSection
            value={modelsDoc}
            onChange={setModelsDoc}
            customModelsOnly={customModelsOnly}
            onCustomModelsOnlyChange={setCustomModelsOnly}
          />
        );
      case "agent-settings":
        return <AgentSettingsSection value={settingsDoc} onChange={setSettingsDoc} />;
      case "general": return <GeneralSection {...props} />;
      case "models": return <ModelsSection {...props} catalog={modelCatalog} />;
      case "git": return <GitSection {...props} />;
      case "skills": return <SkillsSection {...props} />;
      case "budget": return <BudgetSection {...props} />;
      case "notifications": return <NotificationsSection {...props} />;
      case "parallel": return <ParallelSection {...props} catalog={modelCatalog} />;
      case "phases": return <PhasesSection {...props} />;
      case "context": return <ContextSection {...props} />;
      case "safety": return <SafetySection {...props} />;
      case "verification": return <VerificationSection {...props} />;
      case "discussion": return <DiscussionSection {...props} />;
      case "hooks": return <HooksSection {...props} />;
      case "routing": return <RoutingSection {...props} catalog={modelCatalog} />;
      case "cmux": return <CmuxSection {...props} />;
      case "remote": return <RemoteSection {...props} />;
      case "codebase": return <CodebaseSection {...props} />;
      case "experimental": return <ExperimentalSection {...props} catalog={modelCatalog} />;
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
        onNavigate={(target, fieldPath) => {
          setSection(target);
          if (fieldPath) setPendingFocus(fieldPath);
        }}
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
                      const v = e.target.value;
                      if (!v) return;
                      if (v === "__clear__") {
                        setRecentProjects([]);
                        saveRecentProjects([]);
                        return;
                      }
                      selectRecentProject(v);
                    }}
                    className="text-xs max-w-40"
                  >
                    <option value="">Recent...</option>
                    {recentProjects.map((p) => (
                      <option key={p} value={p}>
                        {shortPath(p)}
                      </option>
                    ))}
                    <option disabled>──────────</option>
                    <option value="__clear__">Clear recent projects</option>
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
              <button
                onClick={() => runUpdateCheck(true)}
                disabled={updateChecking || updateInstalling}
                title="Check for app updates"
                className="px-3 py-1.5 text-xs rounded-md border border-gsd-border text-gsd-text-dim hover:text-gsd-text hover:bg-gsd-surface-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {updateChecking ? "Checking..." : "Updates"}
              </button>
              <ThemeToggle />
              <div className="w-px h-5 bg-gsd-border mx-1" />
              <button
                onClick={importPreset}
                disabled={needsProjectSelection}
                title="Load preferences from a .preset.md file (review and save to commit)"
                className="px-3 py-1.5 text-xs rounded-md border border-gsd-border text-gsd-text-dim hover:text-gsd-text hover:bg-gsd-surface-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Import
              </button>
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
              {anyDirty && (
                <button
                  onClick={reset}
                  className="px-3 py-1.5 text-xs rounded-md border border-gsd-border text-gsd-text-dim hover:text-gsd-text hover:bg-gsd-surface-hover transition-colors"
                >
                  Discard
                </button>
              )}
              <button
                onClick={save}
                disabled={!anyDirty || status === "saving" || needsProjectSelection}
                className={`px-4 py-1.5 text-xs rounded-md font-medium transition-colors ${
                  anyDirty && !needsProjectSelection
                    ? "bg-gsd-accent text-gsd-on-accent hover:bg-gsd-accent-hover"
                    : "bg-gsd-border text-gsd-text-dim cursor-not-allowed"
                }`}
              >
                {status === "saving"
                  ? "Saving..."
                  : status === "saved"
                  ? savedCount > 0
                    ? `Saved ${savedCount} change${savedCount === 1 ? "" : "s"}`
                    : "Saved"
                  : "Save"}
              </button>
            </div>
          )}
        </header>

        {/* Update banner — shown when a newer version is available and the
            user hasn't dismissed it this session. Install is explicit; we
            never auto-download. */}
        {updateInfo?.available && !updateDismissed && (
          <div className="px-6 py-2 bg-gsd-accent/10 border-b border-gsd-accent/30 text-xs flex items-center justify-between gap-3">
            <span className="text-gsd-text">
              {updateInstalling
                ? `Installing v${updateInfo.version}… the app will relaunch when done.`
                : `Update available: v${updateInfo.version}. Install now to relaunch with the new version.`}
            </span>
            <div className="flex items-center gap-2 shrink-0">
              {!updateInstalling && (
                <>
                  <button
                    onClick={() => setUpdateDismissed(true)}
                    className="px-2 py-1 rounded-md border border-gsd-border text-gsd-text-dim hover:text-gsd-text hover:bg-gsd-surface-hover"
                  >
                    Later
                  </button>
                  <button
                    onClick={installUpdate}
                    className="px-3 py-1 rounded-md bg-gsd-accent text-gsd-on-accent hover:bg-gsd-accent-hover font-medium"
                  >
                    Install &amp; restart
                  </button>
                </>
              )}
            </div>
          </div>
        )}

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
                Browse to a project folder to edit its <code className="text-xs bg-gsd-surface px-1.5 py-0.5 rounded">.gsd/PREFERENCES.md</code> file.
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
