// GSD Setup - Context Management Settings Section
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import type { GSDPreferences, ContextManagementConfig } from "../../types";
import { Field, Toggle, NumberField, SectionHeader } from "../FormControls";

interface Props {
  prefs: GSDPreferences;
  onChange: (prefs: GSDPreferences) => void;
}

export function ContextSection({ prefs, onChange }: Props) {
  const ctx = prefs.context_management ?? {};
  const setCtx = (update: Partial<ContextManagementConfig>) =>
    onChange({ ...prefs, context_management: { ...ctx, ...update } });

  return (
    <div>
      <SectionHeader
        title="Context Management"
        description="Control how GSD manages context window usage: observation masking, compaction, and tool result limits."
      />

      <Field path="context_management.observation_masking" label="Observation Masking" description="Mask old tool results to reduce context bloat.">
        <Toggle checked={ctx.observation_masking ?? true} onChange={(v) => setCtx({ observation_masking: v })} />
      </Field>

      <Field path="context_management.observation_mask_turns" value={ctx.observation_mask_turns} label="Mask Turns" description="Keep this many recent turns verbatim (1-50).">
        <NumberField value={ctx.observation_mask_turns} onChange={(v) => setCtx({ observation_mask_turns: v })} min={1} max={50} placeholder="8" />
      </Field>

      <Field path="context_management.compaction_threshold_percent" value={ctx.compaction_threshold_percent} label="Compaction Threshold (%)" description="Trigger compaction at this % of context window (0.5-0.95).">
        <NumberField value={ctx.compaction_threshold_percent} onChange={(v) => setCtx({ compaction_threshold_percent: v })} min={0.5} max={0.95} placeholder="0.70" />
      </Field>

      <Field path="context_management.tool_result_max_chars" value={ctx.tool_result_max_chars} label="Tool Result Max Chars" description="Max characters per tool result (200-10000).">
        <NumberField value={ctx.tool_result_max_chars} onChange={(v) => setCtx({ tool_result_max_chars: v })} min={200} max={10000} placeholder="800" />
      </Field>
    </div>
  );
}
