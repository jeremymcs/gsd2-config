// GSD2 Config - Sidebar Navigation
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import gsdLogo from "../assets/gsd-logo.svg";

export const SECTION_GROUPS = [
  {
    label: "Setup",
    items: [
      { id: "general", label: "General" },
      { id: "models", label: "Models" },
      { id: "custom-providers", label: "Custom Providers" },
      { id: "api-keys", label: "API Keys & Auth" },
      { id: "agent-settings", label: "Agent Settings" },
      { id: "git", label: "Git" },
    ],
  },
  {
    label: "Workflow",
    items: [
      { id: "phases", label: "Phases" },
      { id: "discussion", label: "Discussion" },
      { id: "hooks", label: "Hooks" },
      { id: "parallel", label: "Parallel" },
      { id: "notifications", label: "Notifications" },
    ],
  },
  {
    label: "Performance",
    items: [
      { id: "routing", label: "Dynamic Routing" },
      { id: "context", label: "Context" },
      { id: "budget", label: "Budget & Cost" },
      { id: "codebase", label: "Codebase Map" },
    ],
  },
  {
    label: "Quality",
    items: [
      { id: "safety", label: "Safety" },
      { id: "verification", label: "Verification" },
    ],
  },
  {
    label: "Skills & Agents",
    items: [
      { id: "skills", label: "Skill Rules" },
      { id: "skills-library", label: "Skills Library" },
      { id: "agents-library", label: "Agents Library" },
    ],
  },
  {
    label: "Integrations",
    items: [
      { id: "cmux", label: "CMux" },
      { id: "remote", label: "Remote Questions" },
    ],
  },
  {
    label: "Experimental",
    items: [
      { id: "experimental", label: "Experimental" },
    ],
  },
] as const;

type AllItems = (typeof SECTION_GROUPS)[number]["items"][number];

export const SECTIONS: readonly AllItems[] = SECTION_GROUPS.flatMap(
  (g) => g.items as readonly AllItems[],
);

export type SectionId = AllItems["id"];

interface SidebarProps {
  active: SectionId;
  onSelect: (id: SectionId) => void;
  /** Sections with unsaved changes — render a dirty dot next to each. */
  dirtySections?: Set<SectionId>;
}

export function Sidebar({ active, onSelect, dirtySections }: SidebarProps) {
  return (
    <nav className="w-56 shrink-0 bg-gsd-bg border-r border-gsd-border overflow-y-auto relative z-10">
      <div className="px-5 pt-6 pb-5 border-b border-gsd-border flex flex-col items-center">
        <img
          src={gsdLogo}
          alt="GSD2"
          className="h-11 w-auto mb-2 drop-shadow-[0_0_24px_rgba(125,207,255,0.35)]"
        />
        <p className="text-[10px] text-gsd-text-dim tracking-[0.2em] uppercase font-medium">
          Config Manager
        </p>
      </div>
      <div className="px-2 py-3">
        {SECTION_GROUPS.map((group) => (
          <div key={group.label} className="mb-4">
            <div className="px-3 py-1 text-[10px] font-semibold tracking-[0.15em] uppercase text-gsd-text-muted">
              {group.label}
            </div>
            <ul>
              {group.items.map((s) => {
                const isDirty = dirtySections?.has(s.id) ?? false;
                return (
                  <li key={s.id}>
                    <button
                      onClick={() => onSelect(s.id)}
                      className={`w-full text-left px-3 py-1.5 rounded-md text-sm transition-all flex items-center justify-between ${
                        active === s.id
                          ? "bg-gsd-accent-dim text-gsd-accent font-medium"
                          : "text-gsd-text-dim hover:text-gsd-text hover:bg-gsd-surface-hover"
                      }`}
                    >
                      <span>{s.label}</span>
                      {isDirty && (
                        <span
                          aria-label="Unsaved changes"
                          title="Unsaved changes"
                          className="h-1.5 w-1.5 rounded-full bg-gsd-accent shrink-0"
                        />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
