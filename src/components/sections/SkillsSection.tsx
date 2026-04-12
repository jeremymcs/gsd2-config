// GSD Setup - Skills Settings Section
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import type { GSDPreferences, SkillDiscoveryMode } from "../../types";
import { Field, SelectField, NumberField, TagInput, SectionHeader } from "../FormControls";

interface Props {
  prefs: GSDPreferences;
  onChange: (prefs: GSDPreferences) => void;
}

export function SkillsSection({ prefs, onChange }: Props) {
  const set = <K extends keyof GSDPreferences>(key: K, val: GSDPreferences[K]) =>
    onChange({ ...prefs, [key]: val });

  return (
    <div>
      <SectionHeader
        title="Skills"
        description="Control which skills GSD uses, prefers, or avoids. Manage discovery behavior and staleness."
      />

      <Field path="skill_discovery" value={prefs.skill_discovery} label="Skill Discovery" description="Whether GSD discovers and applies skills during auto-mode.">
        <SelectField<SkillDiscoveryMode>
          value={prefs.skill_discovery}
          onChange={(v) => set("skill_discovery", v)}
          options={["auto", "suggest", "off"]}
          placeholder="suggest"
        />
      </Field>

      <Field path="skill_staleness_days" value={prefs.skill_staleness_days} label="Skill Staleness (days)" description="Skills unused for N days get deprioritized. 0 disables.">
        <NumberField
          value={prefs.skill_staleness_days}
          onChange={(v) => set("skill_staleness_days", v)}
          min={0}
          max={365}
          placeholder="60"
        />
      </Field>

      <Field path="always_use_skills" label="Always Use Skills" description="Skills GSD should use whenever relevant.">
        <TagInput
          values={prefs.always_use_skills ?? []}
          onChange={(v) => set("always_use_skills", v.length > 0 ? v : undefined)}
          placeholder="Add skill name"
        />
      </Field>

      <Field path="prefer_skills" label="Prefer Skills" description="Soft defaults GSD should prefer when relevant.">
        <TagInput
          values={prefs.prefer_skills ?? []}
          onChange={(v) => set("prefer_skills", v.length > 0 ? v : undefined)}
          placeholder="Add skill name"
        />
      </Field>

      <Field path="avoid_skills" label="Avoid Skills" description="Skills GSD should avoid unless clearly needed.">
        <TagInput
          values={prefs.avoid_skills ?? []}
          onChange={(v) => set("avoid_skills", v.length > 0 ? v : undefined)}
          placeholder="Add skill name"
        />
      </Field>

      <Field path="custom_instructions" label="Custom Instructions" description="Extra durable instructions related to skill use.">
        <TagInput
          values={prefs.custom_instructions ?? []}
          onChange={(v) => set("custom_instructions", v.length > 0 ? v : undefined)}
          placeholder="Add instruction"
        />
      </Field>

      <Field path="disabled_model_providers" label="Disabled Model Providers" description="Provider IDs to exclude from model selection.">
        <TagInput
          values={prefs.disabled_model_providers ?? []}
          onChange={(v) => set("disabled_model_providers", v.length > 0 ? v : undefined)}
          placeholder="Add provider ID"
        />
      </Field>
    </div>
  );
}
