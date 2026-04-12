// GSD2 Config - Core preferences/filesystem primitives
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>
//
// Pure (non-Tauri) logic that both the GUI command layer and the future
// `gsd-setup-cli` binary depend on. Kept free of tauri types on purpose.

use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};

// ─── Per-file mutex registry ────────────────────────────────────────────────
//
// Two open windows editing the same prefs file would otherwise race on
// read-modify-write. Every save / restore / snapshot acquires the mutex
// for that canonical path first.

fn file_locks() -> &'static Mutex<HashMap<String, Arc<Mutex<()>>>> {
    static LOCKS: OnceLock<Mutex<HashMap<String, Arc<Mutex<()>>>>> = OnceLock::new();
    LOCKS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Acquire (or lazily create) a per-path mutex and run `f` while holding it.
pub fn with_file_lock<T>(path: &Path, f: impl FnOnce() -> T) -> T {
    let key = path.to_string_lossy().to_string();
    let mutex = {
        let mut map = file_locks().lock().expect("file_locks poisoned");
        map.entry(key)
            .or_insert_with(|| Arc::new(Mutex::new(())))
            .clone()
    };
    let _guard = mutex.lock().expect("per-file mutex poisoned");
    f()
}

// ─── Atomic write ───────────────────────────────────────────────────────────

/// Write `bytes` to `path` atomically: write a sibling temp file, fsync it,
/// then rename into place. The rename is atomic on POSIX and on Windows for
/// files on the same volume (which they are — sibling).
pub fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {}", e))?;
    }
    let file_name = path
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or_else(|| "invalid target path".to_string())?;
    let tmp = path.with_file_name(format!(".{}.tmp-{}", file_name, std::process::id()));
    {
        let mut f = fs::File::create(&tmp).map_err(|e| format!("Failed to create temp file: {}", e))?;
        f.write_all(bytes)
            .map_err(|e| format!("Failed to write temp file: {}", e))?;
        f.sync_all()
            .map_err(|e| format!("Failed to fsync temp file: {}", e))?;
    }
    fs::rename(&tmp, path).map_err(|e| format!("Failed to rename temp file: {}", e))?;
    Ok(())
}

// ─── Frontmatter helpers ────────────────────────────────────────────────────

/// Extract the YAML frontmatter body from a markdown string.
///
/// Returns `None` when the content does not start with `---`.
pub fn parse_frontmatter(content: &str) -> Option<String> {
    let trimmed = content.trim_start();
    if !trimmed.starts_with("---") {
        return None;
    }
    let after_first = &trimmed[3..];
    if let Some(end_pos) = after_first.find("\n---") {
        return Some(after_first[..end_pos].to_string());
    }
    let end_with_eof = after_first.trim_end();
    if end_with_eof.ends_with("---") {
        return Some(end_with_eof[..end_with_eof.len() - 3].to_string());
    }
    Some(after_first.to_string())
}

/// Extract a scalar field from YAML frontmatter (primitive, quoted or unquoted).
pub fn read_frontmatter_field(yaml: &str, key: &str) -> Option<String> {
    for line in yaml.lines() {
        let trimmed = line.trim_start();
        if let Some(rest) = trimmed.strip_prefix(&format!("{}:", key)) {
            let v = rest.trim();
            let unquoted = v
                .trim_start_matches('"')
                .trim_end_matches('"')
                .trim_start_matches('\'')
                .trim_end_matches('\'');
            if unquoted.is_empty() {
                return None;
            }
            return Some(unquoted.to_string());
        }
    }
    None
}

// ─── Path resolution ────────────────────────────────────────────────────────

/// Resolve the preferences path for global (None/empty) or project scope.
/// Errors if `project_path` is provided but does not exist.
pub fn preferences_path(project_path: Option<&str>) -> Result<PathBuf, String> {
    match project_path {
        Some(p) if !p.is_empty() => {
            let base = PathBuf::from(p);
            if !base.exists() {
                return Err(format!("Project folder does not exist: {}", p));
            }
            Ok(base.join(".gsd").join("preferences.md"))
        }
        _ => {
            let home = dirs::home_dir().ok_or("could not resolve home directory")?;
            Ok(home.join(".gsd").join("preferences.md"))
        }
    }
}

// ─── Preferences load/save ──────────────────────────────────────────────────

/// Read preferences from `path` as a JSON value. Missing file → empty object.
pub fn load_preferences_at(path: &Path) -> Result<Value, String> {
    if !path.exists() {
        return Ok(Value::Object(serde_json::Map::new()));
    }
    let content = fs::read_to_string(path).map_err(|e| format!("Failed to read file: {}", e))?;
    let yaml_str = parse_frontmatter(&content).unwrap_or_default();
    if yaml_str.trim().is_empty() {
        return Ok(Value::Object(serde_json::Map::new()));
    }
    let yaml_value: serde_yaml::Value =
        serde_yaml::from_str(&yaml_str).map_err(|e| format!("YAML parse error: {}", e))?;
    let json_str =
        serde_json::to_string(&yaml_value).map_err(|e| format!("JSON convert error: {}", e))?;
    let mut json_value: Value =
        serde_json::from_str(&json_str).map_err(|e| format!("JSON parse error: {}", e))?;
    // Must happen BEFORE the value crosses the Tauri bridge: Discord/Slack
    // channel IDs are 64-bit snowflakes that exceed JS's MAX_SAFE_INTEGER.
    // If we leave them as JSON numbers, JSON.parse on the JS side silently
    // loses precision. Coerce to a string here while we still have full i64.
    normalize_stringy_ids(&mut json_value);
    Ok(json_value)
}

/// Coerce well-known "always-a-string" preference keys from number → string.
/// Currently just `remote_questions.channel_id`. This is intentionally
/// conservative: we only touch keys we know must round-trip as strings.
pub fn normalize_stringy_ids(value: &mut Value) {
    let Some(root) = value.as_object_mut() else {
        return;
    };
    let Some(remote) = root.get_mut("remote_questions") else {
        return;
    };
    let Some(remote_obj) = remote.as_object_mut() else {
        return;
    };
    let Some(cid) = remote_obj.get("channel_id").cloned() else {
        return;
    };
    let coerced = match cid {
        Value::String(s) => Value::String(s),
        Value::Number(n) => Value::String(n.to_string()),
        Value::Bool(b) => Value::String(b.to_string()),
        Value::Null => return,
        // Arrays/objects under channel_id are nonsense — drop them so the
        // frontend validator doesn't render a confusing error.
        _ => {
            remote_obj.remove("channel_id");
            return;
        }
    };
    remote_obj.insert("channel_id".to_string(), coerced);
}

/// Serialize preferences to the canonical `---\n{yaml}---\n` format.
pub fn serialize_preferences(prefs: &Value) -> Result<String, String> {
    let yaml_value: serde_yaml::Value =
        serde_json::from_value(prefs.clone()).map_err(|e| format!("Conversion error: {}", e))?;
    let yaml_str =
        serde_yaml::to_string(&yaml_value).map_err(|e| format!("YAML serialize error: {}", e))?;
    Ok(format!("---\n{}---\n", yaml_str))
}

/// Save preferences to `path` under a per-path mutex:
///   1. Copy current file to `{name}.md.bak` (best-effort)
///   2. Serialize and atomically write
///
/// Channel IDs are normalized to strings before serialization so the YAML
/// on disk always round-trips cleanly — a YAML writer may emit an unquoted
/// large integer, which then corrupts under JS Number precision on reload.
pub fn save_preferences_at(path: &Path, prefs: &Value) -> Result<(), String> {
    with_file_lock(path, || {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create directory: {}", e))?;
        }
        if path.exists() {
            let backup = path.with_extension("md.bak");
            fs::copy(path, &backup).ok();
        }
        let mut normalized = prefs.clone();
        normalize_stringy_ids(&mut normalized);
        let output = serialize_preferences(&normalized)?;
        write_atomic(path, output.as_bytes())
    })
}

// ─── Tests ──────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use tempfile::TempDir;

    /// Representative sample covering every GUI section — parsed from a raw
    /// JSON string so we don't blow the `json!` macro recursion limit.
    const FULL_FIXTURE: &str = r#"{
        "version": 1,
        "mode": "solo",
        "token_profile": "balanced",
        "widget_mode": "small",
        "search_provider": "auto",
        "context_selection": "smart",
        "service_tier": "flex",
        "show_token_cost": true,
        "always_use_skills": ["skill-a", "skill-b"],
        "prefer_skills": ["skill-c"],
        "skill_discovery": "auto",
        "skill_staleness_days": 30,
        "skill_rules": [
            { "when": "frontend", "use": ["react-skill"] }
        ],
        "custom_instructions": ["line 1", "line 2"],
        "models": {
            "research": "claude-sonnet-4-5",
            "planning": "claude-sonnet-4-5",
            "execution": {
                "model": "claude-opus-4-6",
                "provider": "anthropic",
                "fallbacks": ["claude-sonnet-4-5"]
            }
        },
        "budget_ceiling": 10.5,
        "budget_enforcement": "warn",
        "context_pause_threshold": 80,
        "notifications": {
            "enabled": true, "on_complete": true, "on_error": true,
            "on_budget": false, "on_milestone": true, "on_attention": true
        },
        "cmux": { "enabled": true, "notifications": false, "sidebar": true, "splits": true, "browser": false },
        "remote_questions": { "channel": "slack", "channel_id": "C123", "timeout_minutes": 30, "poll_interval_seconds": 10 },
        "git": {
            "auto_push": true, "push_branches": false, "remote": "origin",
            "snapshots": true, "main_branch": "main",
            "merge_strategy": "squash", "isolation": "worktree",
            "manage_gitignore": true, "auto_pr": false
        },
        "post_unit_hooks": [
            { "name": "lint", "after": ["execute-task"], "prompt": "run lint", "max_cycles": 2, "enabled": true }
        ],
        "pre_dispatch_hooks": [
            { "name": "audit", "before": ["execute-task"], "action": "modify", "prepend": "audit: ", "enabled": true }
        ],
        "parallel": { "enabled": true, "max_workers": 4, "budget_ceiling": 20.0, "merge_strategy": "per-slice", "auto_merge": "confirm" },
        "slice_parallel": { "enabled": false, "max_workers": 2 },
        "reactive_execution": { "enabled": true, "max_parallel": 3, "isolation_mode": "same-tree" },
        "gate_evaluation": { "enabled": true, "slice_gates": ["verification"], "task_gates": true },
        "context_management": { "observation_masking": true, "observation_mask_turns": 3, "compaction_threshold_percent": 75, "tool_result_max_chars": 20000 },
        "dynamic_routing": {
            "enabled": true,
            "tier_models": { "light": "haiku", "standard": "sonnet", "heavy": "opus" },
            "escalate_on_failure": true,
            "budget_pressure": true,
            "cross_provider": false,
            "hooks": true,
            "capability_routing": true
        },
        "phases": {
            "skip_research": false, "skip_reassess": false, "skip_slice_research": false,
            "skip_milestone_validation": false, "reassess_after_slice": true, "require_slice_discussion": false
        },
        "safety_harness": {
            "enabled": true, "evidence_collection": true, "file_change_validation": true,
            "evidence_cross_reference": true, "destructive_command_warnings": true,
            "content_validation": true, "checkpoints": true, "auto_rollback": false,
            "timeout_scale_cap": 4
        },
        "enhanced_verification": true,
        "enhanced_verification_pre": false,
        "enhanced_verification_post": true,
        "enhanced_verification_strict": false,
        "verification_commands": ["npm run build", "cargo test"],
        "verification_auto_fix": true,
        "verification_max_retries": 3,
        "discuss_preparation": true,
        "discuss_web_research": false,
        "discuss_depth": "standard",
        "experimental": { "rtk": false },
        "codebase": { "exclude_patterns": ["node_modules", "target"], "max_files": 5000, "collapse_threshold": 100 },
        "auto_visualize": false,
        "auto_report": true,
        "forensics_dedup": true,
        "uat_dispatch": true,
        "unique_milestone_ids": true,
        "stale_commit_threshold_minutes": 60
    }"#;

    #[test]
    fn round_trip_preserves_full_preferences() {
        let tmp = TempDir::new().unwrap();
        let path = tmp.path().join("preferences.md");

        let original: Value = serde_json::from_str(FULL_FIXTURE).expect("fixture parses");
        save_preferences_at(&path, &original).expect("save");
        let reloaded = load_preferences_at(&path).expect("load");
        assert_eq!(
            original, reloaded,
            "round-trip must preserve all preference values"
        );
    }

    #[test]
    fn atomic_write_creates_parent_and_file() {
        let tmp = TempDir::new().unwrap();
        let path = tmp.path().join("nested").join("out.txt");
        write_atomic(&path, b"hello").unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "hello");
    }

    #[test]
    fn atomic_write_overwrites_existing_file() {
        let tmp = TempDir::new().unwrap();
        let path = tmp.path().join("a.txt");
        fs::write(&path, "old").unwrap();
        write_atomic(&path, b"new").unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "new");
    }

    #[test]
    fn parse_frontmatter_normal_case() {
        let content = "---\nkey: value\nother: 1\n---\n\nbody";
        let yaml = parse_frontmatter(content).expect("frontmatter present");
        assert!(yaml.contains("key: value"));
        assert!(yaml.contains("other: 1"));
    }

    #[test]
    fn parse_frontmatter_missing_returns_none() {
        assert_eq!(parse_frontmatter("no frontmatter here"), None);
    }

    #[test]
    fn read_frontmatter_field_handles_quoted_values() {
        let yaml = "name: \"my-skill\"\ndescription: 'does a thing'\n";
        assert_eq!(read_frontmatter_field(yaml, "name").as_deref(), Some("my-skill"));
        assert_eq!(
            read_frontmatter_field(yaml, "description").as_deref(),
            Some("does a thing")
        );
    }

    #[test]
    fn save_creates_bak_sibling_when_file_exists() {
        let tmp = TempDir::new().unwrap();
        let path = tmp.path().join("preferences.md");
        save_preferences_at(&path, &json!({ "mode": "solo" })).unwrap();
        // Second save should create a .bak sibling
        save_preferences_at(&path, &json!({ "mode": "team" })).unwrap();
        let bak = path.with_extension("md.bak");
        assert!(bak.exists(), "backup sibling must exist after second save");
        let bak_content = fs::read_to_string(&bak).unwrap();
        assert!(bak_content.contains("solo"), "backup should have the previous value");
    }

    /// Regression: a Discord snowflake written unquoted in YAML was being
    /// parsed as an integer and sent across the Tauri bridge as a JSON
    /// number. JS Number loses precision above 2^53, so the channel_id
    /// arrived corrupted and the frontend validator ("Must be a string")
    /// flagged it. Load path must coerce to a string while the full i64 is
    /// still intact.
    #[test]
    fn load_coerces_unquoted_channel_id_to_string() {
        let tmp = TempDir::new().unwrap();
        let path = tmp.path().join("preferences.md");
        // Raw YAML with an unquoted snowflake — simulates a hand-edited file
        // or one saved by a tool that doesn't know to quote channel IDs.
        let raw = "---\nremote_questions:\n  channel: discord\n  channel_id: 1234567890123456789\n---\n";
        fs::write(&path, raw).unwrap();

        let loaded = load_preferences_at(&path).expect("load");
        let cid = loaded
            .get("remote_questions")
            .and_then(|r| r.get("channel_id"))
            .expect("channel_id present");
        assert!(
            cid.is_string(),
            "channel_id must be coerced to string, got {:?}",
            cid
        );
        assert_eq!(
            cid.as_str().unwrap(),
            "1234567890123456789",
            "full i64 precision must be preserved across the coercion"
        );
    }

    /// On save, even if the frontend sent a number (defense in depth), the
    /// written file must store the channel_id as a quoted string so the next
    /// reload doesn't reintroduce the precision bug.
    #[test]
    fn save_normalizes_numeric_channel_id_to_string() {
        let tmp = TempDir::new().unwrap();
        let path = tmp.path().join("preferences.md");
        let prefs = json!({
            "remote_questions": {
                "channel": "discord",
                "channel_id": 1234567890123456789_u64
            }
        });
        save_preferences_at(&path, &prefs).expect("save");
        let reloaded = load_preferences_at(&path).expect("load");
        let cid = reloaded
            .get("remote_questions")
            .and_then(|r| r.get("channel_id"))
            .expect("channel_id present after reload");
        assert_eq!(cid.as_str(), Some("1234567890123456789"));
    }
}
