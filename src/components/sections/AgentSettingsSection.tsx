// GSD Setup - Agent Settings (settings.json) Section
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>
//
// Editor for `~/.gsd/agent/settings.json` (or `<project>/.gsd/settings.json`).
// State is stored as a free-form `Record<string, unknown>` so unknown keys
// (hooks, experimental flags, enterprise fields) round-trip verbatim — we
// only touch the keys this UI owns. `ClaudeCodeSettings` is used as a
// read-time lens to type-check the fields we expose.

import { useState } from "react";
import {
  SectionHeader,
  Field,
  Toggle,
  SelectField,
  TextField,
  NumberField,
} from "../FormControls";
import type {
  ClaudeCodeSettings,
  ClaudeCodePermissions,
  ClaudeCodePermissionMode,
  ClaudeCodeStatusLine,
} from "../../types";

interface Props {
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}

const PERMISSION_MODES: readonly ClaudeCodePermissionMode[] = [
  "default",
  "acceptEdits",
  "bypassPermissions",
  "plan",
  "auto",
];

const STATUS_LINE_TYPES = ["command", "static_text"] as const;

/** Read a top-level field through the typed lens. */
function read<K extends keyof ClaudeCodeSettings>(
  doc: Record<string, unknown>,
  key: K,
): ClaudeCodeSettings[K] {
  return (doc as ClaudeCodeSettings)[key];
}

/** Set or unset a top-level key. `undefined` removes the key entirely. */
function setKey(
  doc: Record<string, unknown>,
  key: string,
  next: unknown,
): Record<string, unknown> {
  if (next === undefined) {
    const { [key]: _drop, ...rest } = doc;
    return rest;
  }
  return { ...doc, [key]: next };
}

export function AgentSettingsSection({ value, onChange }: Props) {
  const model = read(value, "model");
  const apiKeyHelper = read(value, "apiKeyHelper");
  const outputStyle = read(value, "outputStyle");
  const includeCoAuthoredBy = read(value, "includeCoAuthoredBy");
  const cleanupPeriodDays = read(value, "cleanupPeriodDays");
  const verbose = read(value, "verbose");
  const autoUpdates = read(value, "autoUpdates");
  const alwaysThinkingEnabled = read(value, "alwaysThinkingEnabled");
  const permissions = (read(value, "permissions") ?? {}) as ClaudeCodePermissions;
  const statusLine = (read(value, "statusLine") ?? {}) as ClaudeCodeStatusLine;
  const env = (read(value, "env") ?? {}) as Record<string, string>;

  const update = (key: string, next: unknown) => onChange(setKey(value, key, next));

  const updatePermissions = (patch: Partial<ClaudeCodePermissions>) => {
    const merged: ClaudeCodePermissions = { ...permissions, ...patch };
    // Drop undefined keys so they don't get serialized as null
    const cleaned: ClaudeCodePermissions = {};
    if (merged.defaultMode !== undefined) cleaned.defaultMode = merged.defaultMode;
    if (merged.allow !== undefined) cleaned.allow = merged.allow;
    if (merged.deny !== undefined) cleaned.deny = merged.deny;
    if (merged.ask !== undefined) cleaned.ask = merged.ask;
    update("permissions", Object.keys(cleaned).length > 0 ? cleaned : undefined);
  };

  const updateStatusLine = (patch: Partial<ClaudeCodeStatusLine>) => {
    const merged: ClaudeCodeStatusLine = { ...statusLine, ...patch };
    const cleaned: ClaudeCodeStatusLine = {};
    if (merged.type !== undefined) cleaned.type = merged.type;
    if (merged.command !== undefined) cleaned.command = merged.command;
    if (merged.padding !== undefined) cleaned.padding = merged.padding;
    update("statusLine", Object.keys(cleaned).length > 0 ? cleaned : undefined);
  };

  return (
    <div>
      <SectionHeader
        title="Agent Settings"
        description="Edit Claude Code's settings.json. Writes to ~/.gsd/agent/settings.json (or the project equivalent). Unknown fields (hooks, enterprise keys, experimental flags) are preserved verbatim on save."
      />

      <h3 className="mt-4 mb-1 text-xs font-semibold tracking-wide text-gsd-text uppercase">
        Model &amp; Defaults
      </h3>
      <div className="rounded-lg bg-gsd-surface border border-gsd-border px-4">
        <Field label="Default model" description="Model name (e.g. claude-opus-4-6) or a provider/model-qualified string.">
          <TextField
            value={model}
            onChange={(v) => update("model", v)}
            placeholder="claude-opus-4-6"
            className="w-72"
          />
        </Field>
        <Field label="API key helper" description="Shell command that prints an API key to stdout. Claude Code runs it on demand.">
          <TextField
            value={apiKeyHelper}
            onChange={(v) => update("apiKeyHelper", v)}
            placeholder="/usr/local/bin/get-anthropic-key"
            className="w-72"
          />
        </Field>
        <Field label="Output style" description="Named output style (e.g. 'concise', 'explanatory') or a custom style name.">
          <TextField
            value={outputStyle}
            onChange={(v) => update("outputStyle", v)}
            placeholder="default"
            className="w-52"
          />
        </Field>
      </div>

      <h3 className="mt-6 mb-1 text-xs font-semibold tracking-wide text-gsd-text uppercase">
        Permissions
      </h3>
      <div className="rounded-lg bg-gsd-surface border border-gsd-border px-4">
        <Field label="Default permission mode" description="How tool permissions are gated by default.">
          <SelectField<ClaudeCodePermissionMode>
            value={permissions.defaultMode}
            onChange={(v) => updatePermissions({ defaultMode: v })}
            options={PERMISSION_MODES}
            placeholder="default"
          />
        </Field>
        <StringListField
          label="Allow list"
          description="Tool patterns auto-approved without prompting."
          values={permissions.allow}
          onChange={(next) => updatePermissions({ allow: next })}
          placeholder='e.g. Bash(git status) or Edit(**/*.md)'
        />
        <StringListField
          label="Deny list"
          description="Tool patterns blocked outright."
          values={permissions.deny}
          onChange={(next) => updatePermissions({ deny: next })}
          placeholder='e.g. Bash(rm -rf *)'
        />
        <StringListField
          label="Ask list"
          description="Tool patterns that always prompt, even in acceptEdits."
          values={permissions.ask}
          onChange={(next) => updatePermissions({ ask: next })}
          placeholder='e.g. Bash(git push*)'
        />
      </div>

      <h3 className="mt-6 mb-1 text-xs font-semibold tracking-wide text-gsd-text uppercase">
        Environment Variables
      </h3>
      <div className="rounded-lg bg-gsd-surface border border-gsd-border p-4">
        <p className="text-xs text-gsd-text-dim mb-3">
          Injected into every Claude Code session. Values are written as plain strings.
        </p>
        <EnvEditor
          value={env}
          onChange={(next) =>
            update("env", Object.keys(next).length > 0 ? next : undefined)
          }
        />
      </div>

      <h3 className="mt-6 mb-1 text-xs font-semibold tracking-wide text-gsd-text uppercase">
        Behavior
      </h3>
      <div className="rounded-lg bg-gsd-surface border border-gsd-border px-4">
        <Field
          label="Include Co-Authored-By"
          description="Append a Claude Co-Authored-By line to commits Claude generates."
        >
          <Toggle
            checked={includeCoAuthoredBy === true}
            onChange={(b) => update("includeCoAuthoredBy", b ? true : undefined)}
          />
        </Field>
        <Field label="Verbose output" description="Show detailed logs in the CLI.">
          <Toggle
            checked={verbose === true}
            onChange={(b) => update("verbose", b ? true : undefined)}
          />
        </Field>
        <Field label="Auto-updates" description="Allow Claude Code to update itself in the background.">
          <Toggle
            checked={autoUpdates !== false}
            onChange={(b) => update("autoUpdates", b ? undefined : false)}
          />
        </Field>
        <Field
          label="Always thinking"
          description="Force extended thinking on every turn (higher latency/cost)."
        >
          <Toggle
            checked={alwaysThinkingEnabled === true}
            onChange={(b) => update("alwaysThinkingEnabled", b ? true : undefined)}
          />
        </Field>
      </div>

      <h3 className="mt-6 mb-1 text-xs font-semibold tracking-wide text-gsd-text uppercase">
        Status Line
      </h3>
      <div className="rounded-lg bg-gsd-surface border border-gsd-border px-4">
        <Field label="Type" description="`command` runs a shell command; `static_text` shows a fixed string.">
          <SelectField
            value={statusLine.type}
            onChange={(v) => updateStatusLine({ type: v })}
            options={STATUS_LINE_TYPES}
            placeholder="off"
          />
        </Field>
        <Field
          label="Command / text"
          description="Shell command to run (type=command) or literal text (type=static_text)."
        >
          <TextField
            value={statusLine.command}
            onChange={(v) => updateStatusLine({ command: v })}
            placeholder="~/.claude/statusline.sh"
            className="w-80"
          />
        </Field>
        <Field label="Padding" description="Blank lines inserted around the status line.">
          <NumberField
            value={statusLine.padding}
            onChange={(v) => updateStatusLine({ padding: v })}
            min={0}
            max={10}
            placeholder="0"
          />
        </Field>
      </div>

      <h3 className="mt-6 mb-1 text-xs font-semibold tracking-wide text-gsd-text uppercase">
        Maintenance
      </h3>
      <div className="rounded-lg bg-gsd-surface border border-gsd-border px-4">
        <Field
          label="Cleanup period (days)"
          description="How long Claude Code keeps old session logs before deleting them."
        >
          <NumberField
            value={cleanupPeriodDays}
            onChange={(v) => update("cleanupPeriodDays", v)}
            min={0}
            placeholder="30"
          />
        </Field>
      </div>
    </div>
  );
}

// ─── String list editor (inline, for permission lists) ─────────────────────

interface StringListFieldProps {
  label: string;
  description?: string;
  values: string[] | undefined;
  onChange: (next: string[] | undefined) => void;
  placeholder?: string;
}

function StringListField({
  label,
  description,
  values,
  onChange,
  placeholder,
}: StringListFieldProps) {
  const [draft, setDraft] = useState("");
  const list = values ?? [];

  const commit = (next: string[]) => {
    onChange(next.length > 0 ? next : undefined);
  };

  const add = () => {
    const trimmed = draft.trim();
    if (!trimmed || list.includes(trimmed)) {
      setDraft("");
      return;
    }
    commit([...list, trimmed]);
    setDraft("");
  };

  const remove = (idx: number) => {
    commit(list.filter((_, i) => i !== idx));
  };

  return (
    <Field label={label} description={description}>
      <div className="w-80">
        <div className="flex flex-wrap gap-1 mb-1.5 min-h-[1.25rem]">
          {list.length === 0 && (
            <span className="text-xs text-gsd-text-dim italic">empty</span>
          )}
          {list.map((v, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-mono rounded bg-gsd-accent/20 text-gsd-accent-hover"
            >
              {v}
              <button
                onClick={() => remove(i)}
                className="text-gsd-text-dim hover:text-gsd-danger ml-0.5"
                aria-label={`Remove ${v}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-1">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            placeholder={placeholder}
            className="flex-1 text-xs font-mono"
          />
          <button
            type="button"
            onClick={add}
            className="px-2 py-1 text-xs rounded-md border border-gsd-border text-gsd-text-dim hover:text-gsd-text hover:bg-gsd-surface-hover"
          >
            Add
          </button>
        </div>
      </div>
    </Field>
  );
}

// ─── Environment variable editor ────────────────────────────────────────────

interface EnvEditorProps {
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}

function EnvEditor({ value, onChange }: EnvEditorProps) {
  const [draftKey, setDraftKey] = useState("");
  const [draftVal, setDraftVal] = useState("");
  const entries = Object.entries(value);

  const add = () => {
    const k = draftKey.trim();
    if (!k) return;
    onChange({ ...value, [k]: draftVal });
    setDraftKey("");
    setDraftVal("");
  };

  const updateVal = (k: string, v: string) => {
    onChange({ ...value, [k]: v });
  };

  const remove = (k: string) => {
    const { [k]: _drop, ...rest } = value;
    onChange(rest);
  };

  return (
    <div>
      {entries.length === 0 && (
        <div className="text-xs text-gsd-text-dim italic mb-2">
          No environment variables set.
        </div>
      )}
      {entries.map(([k, v]) => (
        <div key={k} className="flex items-center gap-2 mb-2">
          <input
            type="text"
            value={k}
            readOnly
            className="w-52 font-mono text-xs bg-gsd-bg"
            title="Key (remove and re-add to rename)"
          />
          <input
            type="text"
            value={v}
            onChange={(e) => updateVal(k, e.target.value)}
            className="flex-1 font-mono text-xs"
          />
          <button
            onClick={() => remove(k)}
            className="px-2 py-1 text-xs rounded-md border border-gsd-border text-gsd-text-dim hover:text-gsd-danger hover:border-gsd-danger"
          >
            ×
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2 pt-2 border-t border-gsd-border">
        <input
          type="text"
          value={draftKey}
          onChange={(e) => setDraftKey(e.target.value)}
          placeholder="KEY"
          className="w-52 font-mono text-xs"
        />
        <input
          type="text"
          value={draftVal}
          onChange={(e) => setDraftVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="value"
          className="flex-1 font-mono text-xs"
        />
        <button
          type="button"
          onClick={add}
          disabled={!draftKey.trim()}
          className="px-3 py-1 text-xs rounded-md border border-gsd-border text-gsd-text-dim hover:text-gsd-text hover:bg-gsd-surface-hover disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Add
        </button>
      </div>
    </div>
  );
}
