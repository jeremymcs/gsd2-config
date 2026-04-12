// GSD Setup - General Settings Section
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import type { GSDPreferences, WorkflowMode, TokenProfile, SearchProvider, WidgetMode, ContextSelectionMode, ServiceTier } from "../../types";
import { Field, Toggle, SelectField, NumberField, SectionHeader } from "../FormControls";
import {
  applyModePreset,
  applyProfilePreset,
  diffModePreset,
  diffProfilePreset,
  formatValue,
  type PresetDiffEntry,
} from "../../lib/presets";

interface Props {
  prefs: GSDPreferences;
  onChange: (prefs: GSDPreferences) => void;
}

/** Build a human-readable confirm message listing every field the cascade
 *  will overwrite so the user sees exactly what's about to change. */
function buildCascadeMessage(
  presetLabel: string,
  diff: PresetDiffEntry[],
): string {
  const lines = diff.map(
    (d) => `  • ${d.path}: ${formatValue(d.before)} → ${formatValue(d.after)}`,
  );
  const n = diff.length;
  return (
    `Applying the "${presetLabel}" preset will update ${n} setting${n === 1 ? "" : "s"}:\n\n` +
    lines.join("\n") +
    `\n\nApply these defaults? Click Cancel to switch without cascading.`
  );
}

export function GeneralSection({ prefs, onChange }: Props) {
  const set = <K extends keyof GSDPreferences>(key: K, val: GSDPreferences[K]) =>
    onChange({ ...prefs, [key]: val });

  // Cascade handler for `mode`. If the user picks solo/team, preview the
  // cascaded fields, ask to confirm, and apply the full preset on OK. On
  // cancel we still flip `mode` — they explicitly picked it — just without
  // the cascade. Clearing the field (undefined) never cascades.
  const onModeChange = (v: WorkflowMode | undefined) => {
    if (v === undefined) {
      set("mode", undefined);
      return;
    }
    const diff = diffModePreset(prefs, v);
    if (diff.length === 0) {
      set("mode", v);
      return;
    }
    const ok = window.confirm(buildCascadeMessage(`${v} mode`, diff));
    if (ok) {
      onChange(applyModePreset(prefs, v));
    } else {
      set("mode", v);
    }
  };

  // Same shape for `token_profile`.
  const onProfileChange = (v: TokenProfile | undefined) => {
    if (v === undefined) {
      set("token_profile", undefined);
      return;
    }
    const diff = diffProfilePreset(prefs, v);
    if (diff.length === 0) {
      set("token_profile", v);
      return;
    }
    const ok = window.confirm(buildCascadeMessage(`${v} profile`, diff));
    if (ok) {
      onChange(applyProfilePreset(prefs, v));
    } else {
      set("token_profile", v);
    }
  };

  return (
    <div>
      <SectionHeader
        title="General"
        description="Core workflow mode, profiles, and global behavior."
      />

      <Field path="mode" value={prefs.mode} label="Workflow Mode" description="Solo (single dev) or Team (multi-dev). Picking a mode cascades sensible defaults for git, parallel, phases, and notifications.">
        <SelectField<WorkflowMode>
          value={prefs.mode}
          onChange={onModeChange}
          options={["solo", "team"]}
          placeholder="Not set"
        />
      </Field>

      <Field path="token_profile" value={prefs.token_profile} label="Token Profile" description="Picking a profile cascades phase skipping, context compression, and verification defaults. Model IDs are left alone.">
        <SelectField<TokenProfile>
          value={prefs.token_profile}
          onChange={onProfileChange}
          options={["budget", "balanced", "quality"]}
          placeholder="Not set"
        />
      </Field>

      <Field path="search_provider" value={prefs.search_provider} label="Search Provider" description="Search backend. 'auto' uses the default behavior.">
        <SelectField<SearchProvider>
          value={prefs.search_provider}
          onChange={(v) => set("search_provider", v)}
          options={["auto", "brave", "tavily", "ollama", "native"]}
        />
      </Field>

      <Field path="widget_mode" value={prefs.widget_mode} label="Widget Mode" description="Default widget display for auto-mode dashboard.">
        <SelectField<WidgetMode>
          value={prefs.widget_mode}
          onChange={(v) => set("widget_mode", v)}
          options={["full", "small", "min", "off"]}
        />
      </Field>

      <Field path="context_selection" value={prefs.context_selection} label="Context Selection" description="File inlining strategy. 'full' inlines entire files, 'smart' uses semantic chunking.">
        <SelectField<ContextSelectionMode>
          value={prefs.context_selection}
          onChange={(v) => set("context_selection", v)}
          options={["full", "smart"]}
          placeholder="Derived from profile"
        />
      </Field>

      <Field path="service_tier" value={prefs.service_tier} label="Service Tier" description="OpenAI tier. 'priority' = 2x cost/faster, 'flex' = 0.5x cost/slower. Only for gpt-5.4 models.">
        <SelectField<ServiceTier>
          value={prefs.service_tier}
          onChange={(v) => set("service_tier", v)}
          options={["priority", "flex"]}
          placeholder="Not set"
        />
      </Field>

      <Field path="unique_milestone_ids" label="Unique Milestone IDs" description="Generate milestone IDs in M{seq}-{rand6} format (recommended for teams).">
        <Toggle
          checked={prefs.unique_milestone_ids ?? false}
          onChange={(v) => set("unique_milestone_ids", v)}
        />
      </Field>

      <Field path="uat_dispatch" label="UAT Dispatch" description="Enable User Acceptance Testing dispatch mode.">
        <Toggle
          checked={prefs.uat_dispatch ?? false}
          onChange={(v) => set("uat_dispatch", v)}
        />
      </Field>

      <Field path="auto_visualize" label="Auto Visualize" description="Show visualizer hint after each milestone completion.">
        <Toggle
          checked={prefs.auto_visualize ?? false}
          onChange={(v) => set("auto_visualize", v)}
        />
      </Field>

      <Field path="auto_report" label="Auto Report" description="Generate HTML report snapshot after each milestone completion.">
        <Toggle
          checked={prefs.auto_report ?? true}
          onChange={(v) => set("auto_report", v)}
        />
      </Field>

      <Field path="show_token_cost" label="Show Token Cost" description="Show per-prompt and cumulative session token cost.">
        <Toggle
          checked={prefs.show_token_cost ?? false}
          onChange={(v) => set("show_token_cost", v)}
        />
      </Field>

      <Field path="forensics_dedup" label="Forensics Dedup" description="Search existing issues/PRs before filing from forensics.">
        <Toggle
          checked={prefs.forensics_dedup ?? false}
          onChange={(v) => set("forensics_dedup", v)}
        />
      </Field>

      <Field path="stale_commit_threshold_minutes" value={prefs.stale_commit_threshold_minutes} label="Stale Commit Threshold" description="Minutes without a commit before auto-safety-snapshot. 0 disables.">
        <NumberField
          value={prefs.stale_commit_threshold_minutes}
          onChange={(v) => set("stale_commit_threshold_minutes", v)}
          min={0}
          placeholder="30"
        />
      </Field>
    </div>
  );
}
