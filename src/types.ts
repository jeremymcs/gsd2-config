// GSD Setup - TypeScript Types (mirrors GSD-2 preferences)
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

export type WorkflowMode = "solo" | "team";
export type TokenProfile = "budget" | "balanced" | "quality";
export type BudgetEnforcementMode = "warn" | "pause" | "halt";
export type SkillDiscoveryMode = "auto" | "suggest" | "off";
export type ContextSelectionMode = "full" | "smart";
export type WidgetMode = "full" | "small" | "min" | "off";
export type SearchProvider = "brave" | "tavily" | "ollama" | "native" | "auto";
export type ServiceTier = "priority" | "flex";
export type DiscussDepth = "quick" | "standard" | "thorough";
export type GitIsolation = "worktree" | "branch" | "none";
export type GitMergeStrategy = "squash" | "merge";
export type MergeStrategy = "per-slice" | "per-milestone";
export type AutoMergeMode = "auto" | "confirm" | "manual";
export type HookAction = "modify" | "skip" | "replace";
export type RemoteChannel = "slack" | "discord" | "telegram";

export interface GSDSkillRule {
  when: string;
  use?: string[];
  prefer?: string[];
  avoid?: string[];
}

export interface GSDPhaseModelConfig {
  model: string;
  provider?: string;
  fallbacks?: string[];
}

export interface GSDModelConfig {
  research?: string | GSDPhaseModelConfig;
  planning?: string | GSDPhaseModelConfig;
  discuss?: string | GSDPhaseModelConfig;
  execution?: string | GSDPhaseModelConfig;
  execution_simple?: string | GSDPhaseModelConfig;
  completion?: string | GSDPhaseModelConfig;
  validation?: string | GSDPhaseModelConfig;
  subagent?: string | GSDPhaseModelConfig;
}

export interface AutoSupervisorConfig {
  model?: string;
  soft_timeout_minutes?: number;
  idle_timeout_minutes?: number;
  hard_timeout_minutes?: number;
}

export interface RemoteQuestionsConfig {
  channel?: RemoteChannel;
  channel_id?: string;
  timeout_minutes?: number;
  poll_interval_seconds?: number;
}

export interface CmuxPreferences {
  enabled?: boolean;
  notifications?: boolean;
  sidebar?: boolean;
  splits?: boolean;
  browser?: boolean;
}

export interface GitPreferences {
  auto_push?: boolean;
  push_branches?: boolean;
  remote?: string;
  snapshots?: boolean;
  pre_merge_check?: boolean | string;
  commit_type?: string;
  main_branch?: string;
  merge_strategy?: GitMergeStrategy;
  isolation?: GitIsolation;
  manage_gitignore?: boolean;
  worktree_post_create?: string;
  auto_pr?: boolean;
  pr_target_branch?: string;
}

export interface NotificationPreferences {
  enabled?: boolean;
  on_complete?: boolean;
  on_error?: boolean;
  on_budget?: boolean;
  on_milestone?: boolean;
  on_attention?: boolean;
}

export interface PhaseSkipPreferences {
  skip_research?: boolean;
  skip_reassess?: boolean;
  skip_slice_research?: boolean;
  skip_milestone_validation?: boolean;
  reassess_after_slice?: boolean;
  require_slice_discussion?: boolean;
}

export interface ParallelConfig {
  enabled?: boolean;
  max_workers?: number;
  budget_ceiling?: number;
  merge_strategy?: MergeStrategy;
  auto_merge?: AutoMergeMode;
  worker_model?: string;
}

export interface ContextManagementConfig {
  observation_masking?: boolean;
  observation_mask_turns?: number;
  compaction_threshold_percent?: number;
  tool_result_max_chars?: number;
}

export interface DynamicRoutingConfig {
  enabled?: boolean;
  tier_models?: {
    light?: string;
    standard?: string;
    heavy?: string;
  };
  escalate_on_failure?: boolean;
  budget_pressure?: boolean;
  cross_provider?: boolean;
  hooks?: boolean;
  capability_routing?: boolean;
}

export interface ExperimentalPreferences {
  rtk?: boolean;
}

export interface CodebaseMapPreferences {
  exclude_patterns?: string[];
  max_files?: number;
  collapse_threshold?: number;
}

export interface SafetyHarnessConfig {
  enabled?: boolean;
  evidence_collection?: boolean;
  file_change_validation?: boolean;
  evidence_cross_reference?: boolean;
  destructive_command_warnings?: boolean;
  content_validation?: boolean;
  checkpoints?: boolean;
  auto_rollback?: boolean;
  timeout_scale_cap?: number;
}

export interface ReactiveExecutionConfig {
  enabled?: boolean;
  max_parallel?: number;
  isolation_mode?: "same-tree";
  subagent_model?: string;
}

export interface GateEvaluationConfig {
  enabled?: boolean;
  slice_gates?: string[];
  task_gates?: boolean;
}

export interface PostUnitHookConfig {
  name: string;
  after: string[];
  prompt: string;
  max_cycles?: number;
  model?: string;
  artifact?: string;
  retry_on?: string;
  agent?: string;
  enabled?: boolean;
}

export interface PreDispatchHookConfig {
  name: string;
  before: string[];
  action: HookAction;
  prepend?: string;
  append?: string;
  prompt?: string;
  unit_type?: string;
  skip_if?: string;
  model?: string;
  enabled?: boolean;
}

export interface SliceParallelConfig {
  enabled?: boolean;
  max_workers?: number;
}

export interface GSDPreferences {
  version?: number;
  mode?: WorkflowMode;
  always_use_skills?: string[];
  prefer_skills?: string[];
  avoid_skills?: string[];
  skill_rules?: GSDSkillRule[];
  custom_instructions?: string[];
  models?: GSDModelConfig;
  skill_discovery?: SkillDiscoveryMode;
  skill_staleness_days?: number;
  auto_supervisor?: AutoSupervisorConfig;
  uat_dispatch?: boolean;
  unique_milestone_ids?: boolean;
  budget_ceiling?: number;
  budget_enforcement?: BudgetEnforcementMode;
  context_pause_threshold?: number;
  notifications?: NotificationPreferences;
  cmux?: CmuxPreferences;
  remote_questions?: RemoteQuestionsConfig;
  git?: GitPreferences;
  post_unit_hooks?: PostUnitHookConfig[];
  pre_dispatch_hooks?: PreDispatchHookConfig[];
  dynamic_routing?: DynamicRoutingConfig;
  disabled_model_providers?: string[];
  context_management?: ContextManagementConfig;
  token_profile?: TokenProfile;
  phases?: PhaseSkipPreferences;
  auto_visualize?: boolean;
  auto_report?: boolean;
  parallel?: ParallelConfig;
  verification_commands?: string[];
  verification_auto_fix?: boolean;
  verification_max_retries?: number;
  search_provider?: SearchProvider;
  context_selection?: ContextSelectionMode;
  widget_mode?: WidgetMode;
  reactive_execution?: ReactiveExecutionConfig;
  gate_evaluation?: GateEvaluationConfig;
  service_tier?: ServiceTier;
  forensics_dedup?: boolean;
  show_token_cost?: boolean;
  stale_commit_threshold_minutes?: number;
  experimental?: ExperimentalPreferences;
  codebase?: CodebaseMapPreferences;
  slice_parallel?: SliceParallelConfig;
  safety_harness?: SafetyHarnessConfig;
  enhanced_verification?: boolean;
  enhanced_verification_pre?: boolean;
  enhanced_verification_post?: boolean;
  enhanced_verification_strict?: boolean;
  discuss_preparation?: boolean;
  discuss_web_research?: boolean;
  discuss_depth?: DiscussDepth;
}

// ─── Custom providers / models (~/.gsd/agent/models.json) ───────────────────
// Mirrors the subset of GSD2's ProviderConfig / ModelDefinition that the
// editor currently exposes. Unknown fields (headers, authHeader, cost,
// compat, modelOverrides) are preserved by the backend round-trip; we just
// don't render form controls for them yet.

export type ModelInputKind = "text" | "image";

export interface ModelCost {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
}

export interface CustomModelDefinition {
  id: string;
  name?: string;
  api?: string;
  baseUrl?: string;
  reasoning?: boolean;
  input?: ModelInputKind[];
  cost?: ModelCost;
  contextWindow?: number;
  maxTokens?: number;
  // Preserved but not edited:
  headers?: Record<string, string>;
  compat?: Record<string, unknown>;
}

export interface CustomProviderConfig {
  baseUrl?: string;
  apiKey?: string;
  api?: string;
  authHeader?: boolean;
  headers?: Record<string, string>;
  models?: CustomModelDefinition[];
  modelOverrides?: Record<string, Partial<CustomModelDefinition>>;
}

export interface GSDModelsConfig {
  providers?: Record<string, CustomProviderConfig>;
}

/** Snapshot returned by `load_models` / `load_settings` — value + file mtime. */
export interface JsonDocSnapshot<T> {
  value: T;
  mtimeMs: number;
}

export const KNOWN_UNIT_TYPES = [
  "research-milestone", "plan-milestone", "research-slice", "plan-slice",
  "execute-task", "reactive-execute", "gate-evaluate", "complete-slice",
  "replan-slice", "reassess-roadmap", "run-uat", "complete-milestone",
  "validate-milestone", "rewrite-docs", "discuss-milestone", "discuss-slice",
  "worktree-merge",
] as const;

export const MODEL_PHASES = [
  "research", "planning", "discuss", "execution",
  "execution_simple", "completion", "validation", "subagent",
] as const;
