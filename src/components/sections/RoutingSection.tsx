// GSD Setup - Dynamic Routing Settings Section
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import type { GSDPreferences, DynamicRoutingConfig } from "../../types";
import { Field, Toggle, ModelPicker, SectionHeader } from "../FormControls";
import type { ProviderCatalog } from "../../constants";

interface Props {
  prefs: GSDPreferences;
  onChange: (prefs: GSDPreferences) => void;
  catalog: readonly ProviderCatalog[];
}

export function RoutingSection({ prefs, onChange, catalog }: Props) {
  const routing = prefs.dynamic_routing ?? {};
  const setRouting = (update: Partial<DynamicRoutingConfig>) =>
    onChange({ ...prefs, dynamic_routing: { ...routing, ...update } });

  const tiers = routing.tier_models ?? {};

  return (
    <div>
      <SectionHeader
        title="Dynamic Routing"
        description="Dynamic model router that selects models based on task complexity tiers."
      />

      <Field path="dynamic_routing.enabled" label="Enabled" description="Enable dynamic model routing.">
        <Toggle checked={routing.enabled ?? false} onChange={(v) => setRouting({ enabled: v })} />
      </Field>

      <Field path="dynamic_routing.escalate_on_failure" label="Escalate on Failure" description="Escalate to higher-tier model on failure.">
        <Toggle checked={routing.escalate_on_failure ?? true} onChange={(v) => setRouting({ escalate_on_failure: v })} />
      </Field>

      <Field path="dynamic_routing.budget_pressure" label="Budget Pressure" description="Downgrade model tier when under budget pressure.">
        <Toggle checked={routing.budget_pressure ?? true} onChange={(v) => setRouting({ budget_pressure: v })} />
      </Field>

      <Field path="dynamic_routing.cross_provider" label="Cross Provider" description="Allow routing across different providers.">
        <Toggle checked={routing.cross_provider ?? true} onChange={(v) => setRouting({ cross_provider: v })} />
      </Field>

      <Field path="dynamic_routing.hooks" label="Hooks" description="Enable routing hooks.">
        <Toggle checked={routing.hooks ?? true} onChange={(v) => setRouting({ hooks: v })} />
      </Field>

      <Field path="dynamic_routing.capability_routing" label="Capability Routing" description="Enable capability-profile scoring.">
        <Toggle checked={routing.capability_routing ?? false} onChange={(v) => setRouting({ capability_routing: v })} />
      </Field>

      <h3 className="text-sm font-medium text-gsd-text-dim mt-4 mb-2 uppercase tracking-wider">Tier Models</h3>

      <Field path="dynamic_routing.tier_models.light" label="Light" description="Model for simple/light tasks.">
        <ModelPicker
          value={tiers.light}
          onChange={(v) => setRouting({ tier_models: { ...tiers, light: v } })}
          catalog={catalog}
          placeholder="Default"
        />
      </Field>

      <Field path="dynamic_routing.tier_models.standard" label="Standard" description="Model for standard tasks.">
        <ModelPicker
          value={tiers.standard}
          onChange={(v) => setRouting({ tier_models: { ...tiers, standard: v } })}
          catalog={catalog}
          placeholder="Default"
        />
      </Field>

      <Field path="dynamic_routing.tier_models.heavy" label="Heavy" description="Model for complex/heavy tasks.">
        <ModelPicker
          value={tiers.heavy}
          onChange={(v) => setRouting({ tier_models: { ...tiers, heavy: v } })}
          catalog={catalog}
          placeholder="Default"
        />
      </Field>
    </div>
  );
}
