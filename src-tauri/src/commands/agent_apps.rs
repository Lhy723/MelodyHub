//! Commands for connecting local coding agents to Melody Hub.
//!
//! Each supported agent keeps its own configuration format.  This module
//! deliberately limits writes to known user-level files and updates only the
//! Melody Hub-owned provider keys, leaving the rest of the user's config in
//! place.  Existing files are copied to a sibling backup before every write.

use std::collections::BTreeMap;
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use toml_edit::{value, Array, Document, InlineTable, Item, Table, Value as TomlValue};

const MELODY_PROVIDER_ID: &str = "melody-hub";
const MELODY_PROVIDER_NAME: &str = "Melody Hub";
const CODEX_FEATURE_KEYS: [&str; 4] =
    ["web_search", "shell_tool", "computer_use", "multi_agent"];
const CLAUDE_FEATURE_KEYS: [&str; 1] = ["showThinkingSummaries"];
const OPENCODE_FEATURE_KEYS: [&str; 1] = ["encryptedReasoning"];
const CLAUDE_PERSISTENT_EFFORT_LEVELS: [&str; 4] = ["low", "medium", "high", "xhigh"];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum AgentApp {
    Codex,
    Claude,
    OpenCode,
}

impl AgentApp {
    const ALL: [Self; 3] = [Self::Codex, Self::Claude, Self::OpenCode];

    fn parse(id: &str) -> Result<Self, String> {
        match id {
            "codex" => Ok(Self::Codex),
            "claude" => Ok(Self::Claude),
            "opencode" => Ok(Self::OpenCode),
            _ => Err(format!("Unsupported agent app: {}", id)),
        }
    }

    fn id(self) -> &'static str {
        match self {
            Self::Codex => "codex",
            Self::Claude => "claude",
            Self::OpenCode => "opencode",
        }
    }

    fn config_label(self) -> &'static str {
        match self {
            Self::Codex => "~/.codex/config.toml",
            Self::Claude => "~/.claude/settings.json",
            Self::OpenCode => "~/.config/opencode/opencode.json",
        }
    }

    fn config_path(self) -> Result<PathBuf, String> {
        let home = dirs::home_dir()
            .ok_or_else(|| "Unable to resolve the home directory".to_string())?;
        Ok(match self {
            Self::Codex => home.join(".codex").join("config.toml"),
            Self::Claude => home.join(".claude").join("settings.json"),
            Self::OpenCode => opencode_config_path(&home),
        })
    }
}

fn opencode_config_path(home: &Path) -> PathBuf {
    let xdg_config = std::env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| home.join(".config"));
    let xdg_path = xdg_config.join("opencode").join("opencode.json");
    let platform_path = dirs::config_dir()
        .unwrap_or_else(|| home.join(".config"))
        .join("opencode")
        .join("opencode.json");

    // OpenCode documents ~/.config on Unix and that is also where many
    // existing installations keep the file.  Keep the platform directory as
    // the default for Windows, where %APPDATA% is the conventional location.
    if xdg_path.is_file() || (!platform_path.is_file() && cfg!(unix)) {
        xdg_path
    } else {
        platform_path
    }
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppStatus {
    pub id: String,
    pub config_path: String,
    pub config_label: String,
    pub config_exists: bool,
    pub backup_exists: bool,
    pub is_managed: bool,
    pub endpoint: String,
    pub model: String,
    pub available_models: Vec<String>,
    pub auth_token_set: bool,
    pub auth_token_masked: String,
    pub reasoning_effort: String,
    pub thinking_enabled: bool,
    pub feature_flags: BTreeMap<String, bool>,
    /// Flattened values from the Codex user config.  Keys use the same dotted
    /// paths as the official config reference (for example
    /// `sandbox_workspace_write.network_access`).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub codex_settings: Option<BTreeMap<String, Value>>,
    pub config_text: String,
    pub error: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppConfigInput {
    pub id: String,
    pub endpoint: String,
    #[serde(default)]
    pub model: String,
    #[serde(default)]
    pub available_models: Vec<String>,
    #[serde(default)]
    pub reasoning_effort: String,
    #[serde(default)]
    pub thinking_enabled: bool,
    #[serde(default)]
    pub feature_flags: BTreeMap<String, bool>,
    /// `null` keeps the existing credential; a string replaces it.  An empty
    /// string explicitly removes the credential from the target config.
    pub auth_token: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppSettingInput {
    pub id: String,
    pub key: String,
    /// `null` removes the key from config.toml.  A JSON scalar, array, or
    /// object is converted to its TOML equivalent by the backend.
    pub value: Option<Value>,
}

#[derive(Debug, Clone)]
struct AgentConfigValues {
    endpoint: String,
    model: String,
    available_models: Vec<String>,
    auth_token_set: bool,
    reasoning_effort: String,
    thinking_enabled: bool,
    feature_flags: BTreeMap<String, bool>,
    is_managed: bool,
}

#[tauri::command]
pub fn load_agent_apps() -> Result<Vec<AgentAppStatus>, String> {
    AgentApp::ALL.iter().map(|app| load_status(*app)).collect()
}

#[tauri::command]
pub fn save_agent_app_config(
    config: AgentAppConfigInput,
) -> Result<AgentAppStatus, String> {
    let app = AgentApp::parse(&config.id)?;
    let endpoint = normalize_endpoint(&config.endpoint)?;
    let model = config.model.trim().to_string();
    let reasoning_effort = normalize_reasoning_effort(&config.reasoning_effort)?;
    if app == AgentApp::Claude
        && !reasoning_effort.is_empty()
        && !CLAUDE_PERSISTENT_EFFORT_LEVELS.contains(&reasoning_effort.as_str())
    {
        return Err("Claude Code persistent effortLevel only supports low, medium, high, or xhigh; max is session-only".to_string());
    }
    let path = app.config_path()?;

    if path.exists() {
        backup_config(&path)?;
    }

    match app {
        AgentApp::Codex => save_codex(
            &path,
            &endpoint,
            &model,
            &config.available_models,
            config.auth_token.as_deref(),
            &reasoning_effort,
            &config.feature_flags,
        )?,
        AgentApp::Claude => save_claude(
            &path,
            &endpoint,
            &model,
            &config.available_models,
            config.auth_token.as_deref(),
            &reasoning_effort,
            config.thinking_enabled,
            &config.feature_flags,
        )?,
        AgentApp::OpenCode => save_opencode(
            &path,
            &endpoint,
            &model,
            &config.available_models,
            config.auth_token.as_deref(),
            &reasoning_effort,
            config.thinking_enabled,
            &config.feature_flags,
        )?,
    }

    load_status(app)
}

/// Replace the complete user-visible configuration file after validating its
/// syntax for the selected agent.  The editor in the UI uses this command so
/// users can make changes that are not represented by the visual form while
/// still getting the same backup and atomic-write guarantees.
#[tauri::command]
pub fn save_agent_app_text(
    id: String,
    content: String,
) -> Result<AgentAppStatus, String> {
    let app = AgentApp::parse(&id)?;
    validate_config_text(app, &content)?;
    let path = app.config_path()?;

    if path.exists() {
        backup_config(&path)?;
    }
    write_text_atomic(&path, &content)
        .map_err(|error| format!("Unable to write {}: {}", app.config_label(), error))?;
    load_status(app)
}

/// Update one Codex dotted setting without rebuilding the rest of the TOML
/// document.  This is the write path used by the full visual editor; it keeps
/// comments and unknown fields intact and takes the same backup/atomic-write
/// path as the other agent settings.
#[tauri::command]
pub fn save_agent_app_setting(
    setting: AgentAppSettingInput,
) -> Result<AgentAppStatus, String> {
    let app = AgentApp::parse(&setting.id)?;
    if app != AgentApp::Codex {
        return Err(
            "Single-key visual settings are currently supported for Codex only"
                .to_string(),
        );
    }
    validate_toml_setting_path(&setting.key)?;
    let path = app.config_path()?;
    if path.exists() {
        backup_config(&path)?;
    }
    let mut document = read_toml_document(&path)?;
    set_toml_json_path(&mut document, &setting.key, setting.value.as_ref())?;
    write_text_atomic(&path, &document.to_string())
        .map_err(|error| format!("Unable to write {}: {}", app.config_label(), error))?;
    load_status(app)
}

#[tauri::command]
pub fn restore_agent_app_config(id: String) -> Result<AgentAppStatus, String> {
    let app = AgentApp::parse(&id)?;
    let path = app.config_path()?;
    let backup = backup_path(&path);
    if !backup.exists() {
        return Err(format!("No Melody Hub backup exists for {}", app.id()));
    }
    let content = fs::read_to_string(&backup).map_err(|e| {
        format!(
            "Unable to read the backup for {}: {}",
            app.config_label(),
            e
        )
    })?;
    write_text_atomic(&path, &content)
        .map_err(|e| format!("Unable to restore {}: {}", app.config_label(), e))?;
    load_status(app)
}

fn load_status(app: AgentApp) -> Result<AgentAppStatus, String> {
    let path = app.config_path()?;
    let exists = path.is_file();
    let config_text = if exists {
        fs::read_to_string(&path).unwrap_or_default()
    } else {
        String::new()
    };
    let values = if exists {
        match read_config_values(app, &path) {
            Ok(values) => (values, None),
            Err(error) => (empty_config_values(), Some(error)),
        }
    } else {
        (empty_config_values(), None)
    };
    let codex_settings = if app == AgentApp::Codex && exists {
        read_toml_document(&path)
            .ok()
            .map(|document| flatten_toml_document(&document))
    } else {
        None
    };

    Ok(AgentAppStatus {
        id: app.id().to_string(),
        config_path: path.to_string_lossy().to_string(),
        config_label: app.config_label().to_string(),
        config_exists: exists,
        backup_exists: backup_path(&path).is_file(),
        is_managed: values.0.is_managed,
        endpoint: values.0.endpoint,
        model: values.0.model,
        available_models: values.0.available_models,
        auth_token_set: values.0.auth_token_set,
        auth_token_masked: if values.0.auth_token_set {
            "••••••••".to_string()
        } else {
            String::new()
        },
        reasoning_effort: values.0.reasoning_effort,
        thinking_enabled: values.0.thinking_enabled,
        feature_flags: values.0.feature_flags,
        codex_settings,
        config_text,
        error: values.1,
    })
}

fn empty_config_values() -> AgentConfigValues {
    AgentConfigValues {
        endpoint: String::new(),
        model: String::new(),
        available_models: Vec::new(),
        auth_token_set: false,
        reasoning_effort: String::new(),
        thinking_enabled: false,
        feature_flags: BTreeMap::new(),
        is_managed: false,
    }
}

fn validate_config_text(app: AgentApp, content: &str) -> Result<(), String> {
    match app {
        AgentApp::Codex => content
            .parse::<Document>()
            .map(|_| ())
            .map_err(|error| format!("Invalid Codex TOML: {}", error)),
        AgentApp::Claude | AgentApp::OpenCode => {
            let value: Value = serde_json::from_str(content).map_err(|error| {
                format!("Invalid {} JSON: {}", app.config_label(), error)
            })?;
            if !value.is_object() {
                return Err(format!(
                    "{} must contain a JSON object",
                    app.config_label()
                ));
            }
            if app == AgentApp::Claude {
                validate_claude_settings(&value)?;
            }
            Ok(())
        }
    }
}

fn validate_claude_settings(value: &Value) -> Result<(), String> {
    let Some(root) = value.as_object() else {
        return Err("~/.claude/settings.json must contain a JSON object".to_string());
    };
    let Some(effort) = root.get("effortLevel") else {
        return Ok(());
    };
    let Some(effort) = effort.as_str() else {
        return Err(
            "Claude Code effortLevel must be one of low, medium, high, or xhigh"
                .to_string(),
        );
    };
    if CLAUDE_PERSISTENT_EFFORT_LEVELS.contains(&effort) {
        Ok(())
    } else {
        Err(format!(
            "Claude Code effortLevel '{}' is not valid for persistent settings; use low, medium, high, or xhigh (max is session-only)",
            effort
        ))
    }
}

fn read_config_values(app: AgentApp, path: &Path) -> Result<AgentConfigValues, String> {
    match app {
        AgentApp::Codex => read_codex(path),
        AgentApp::Claude => read_claude(path),
        AgentApp::OpenCode => read_opencode(path),
    }
}

fn save_codex(
    path: &Path,
    endpoint: &str,
    model: &str,
    available_models: &[String],
    auth_token: Option<&str>,
    reasoning_effort: &str,
    feature_flags: &BTreeMap<String, bool>,
) -> Result<(), String> {
    let mut document = read_toml_document(path)?;
    document["model_provider"] = value(MELODY_PROVIDER_ID);
    if !model.is_empty() {
        document["model"] = value(model);
    } else {
        document.remove("model");
    }

    // 将可用模型列表写入 model_catalog_json（JSON 字符串格式）
    let filtered: Vec<&str> = available_models
        .iter()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .collect();
    if filtered.is_empty() {
        document.remove("model_catalog_json");
    } else {
        let json = serde_json::to_string(&filtered)
            .map_err(|e| format!("Failed to serialize model catalog: {}", e))?;
        document["model_catalog_json"] = value(json);
    }

    let provider = &mut document["model_providers"][MELODY_PROVIDER_ID];
    provider["name"] = value(MELODY_PROVIDER_NAME);
    provider["base_url"] = value(endpoint);
    provider["wire_api"] = value("responses");
    if let Some(token) = auth_token {
        set_toml_optional_string(provider, "experimental_bearer_token", token);
    }
    if reasoning_effort.trim().is_empty() {
        document.remove("model_reasoning_effort");
    } else {
        document["model_reasoning_effort"] = value(reasoning_effort);
    }
    set_toml_bool_flags(&mut document, &CODEX_FEATURE_KEYS, feature_flags);

    write_text_atomic(path, &document.to_string())
}

fn read_codex(path: &Path) -> Result<AgentConfigValues, String> {
    let document = read_toml_document(path)?;
    let model = document
        .get("model")
        .and_then(Item::as_str)
        .unwrap_or_default()
        .to_string();
    let provider_id = document
        .get("model_provider")
        .and_then(Item::as_str)
        .unwrap_or(MELODY_PROVIDER_ID);
    // 只有当 config.toml 中显式写了 `model_provider = "melody-hub"` 时才视为托管。
    // 缺失该字段（如 ChatGPT 登录）或其他 provider 都视为非托管。
    let is_managed = document.get("model_provider").is_some()
        && provider_id == MELODY_PROVIDER_ID;
    let provider = document
        .get("model_providers")
        .and_then(Item::as_table_like)
        .and_then(|providers| providers.get(provider_id))
        .and_then(Item::as_table_like);
    let feature_flags =
        read_toml_bool_flags(document.get("features"), &CODEX_FEATURE_KEYS);

    // 读取 model_catalog_json（JSON 字符串格式的模型名数组）
    let available_models = document
        .get("model_catalog_json")
        .and_then(Item::as_str)
        .and_then(|json| serde_json::from_str::<Vec<String>>(json).ok())
        .unwrap_or_default();

    Ok(AgentConfigValues {
        endpoint: provider
            .and_then(|provider| provider.get("base_url"))
            .and_then(Item::as_str)
            .unwrap_or_default()
            .to_string(),
        model,
        available_models,
        auth_token_set: provider
            .and_then(|provider| provider.get("experimental_bearer_token"))
            .and_then(Item::as_str)
            .map(|token| !token.trim().is_empty())
            .unwrap_or(false),
        reasoning_effort: document
            .get("model_reasoning_effort")
            .and_then(Item::as_str)
            .unwrap_or_default()
            .to_string(),
        thinking_enabled: document
            .get("model_reasoning_summary")
            .and_then(Item::as_str)
            .map(|summary| summary != "none")
            .unwrap_or(false),
        feature_flags,
        is_managed,
    })
}

fn save_claude(
    path: &Path,
    endpoint: &str,
    model: &str,
    available_models: &[String],
    auth_token: Option<&str>,
    reasoning_effort: &str,
    thinking_enabled: bool,
    feature_flags: &BTreeMap<String, bool>,
) -> Result<(), String> {
    let mut root = read_json_object(path)?;
    {
        let env = ensure_object(&mut root, "env")?;
        env.insert(
            "ANTHROPIC_BASE_URL".to_string(),
            Value::String(endpoint.to_string()),
        );
        if !model.is_empty() {
            env.insert(
                "ANTHROPIC_MODEL".to_string(),
                Value::String(model.to_string()),
            );
        } else {
            env.remove("ANTHROPIC_MODEL");
        }
        if let Some(token) = auth_token {
            set_json_optional_string(env, "ANTHROPIC_AUTH_TOKEN", token);
        }
    }
    if model.is_empty() {
        root.remove("model");
    }

    // 写入 availableModels 数组
    let filtered: Vec<String> = available_models
        .iter()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    if filtered.is_empty() {
        root.remove("availableModels");
    } else {
        root.insert(
            "availableModels".to_string(),
            Value::Array(filtered.into_iter().map(Value::String).collect()),
        );
    }

    set_json_optional_string(&mut root, "effortLevel", reasoning_effort);
    root.insert(
        "alwaysThinkingEnabled".to_string(),
        Value::Bool(thinking_enabled),
    );
    set_json_optional_bool(
        &mut root,
        "showThinkingSummaries",
        feature_flags.get("showThinkingSummaries"),
    );
    write_json_atomic(path, &Value::Object(root))
}

fn read_claude(path: &Path) -> Result<AgentConfigValues, String> {
    let root = read_json_object(path)?;
    let env = root.get("env").and_then(Value::as_object);
    let token = env
        .and_then(|env| env.get("ANTHROPIC_AUTH_TOKEN"))
        .and_then(Value::as_str)
        .or_else(|| {
            env.and_then(|env| env.get("ANTHROPIC_API_KEY"))
                .and_then(Value::as_str)
        });
    Ok(AgentConfigValues {
        endpoint: env
            .and_then(|env| env.get("ANTHROPIC_BASE_URL"))
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        model: env
            .and_then(|env| env.get("ANTHROPIC_MODEL"))
            .and_then(Value::as_str)
            .or_else(|| root.get("model").and_then(Value::as_str))
            .unwrap_or_default()
            .to_string(),
        available_models: root
            .get("availableModels")
            .and_then(Value::as_array)
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default(),
        auth_token_set: token.map(|token| !token.trim().is_empty()).unwrap_or(false),
        reasoning_effort: root
            .get("effortLevel")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        thinking_enabled: root
            .get("alwaysThinkingEnabled")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        feature_flags: read_json_bool_flags(&root, &CLAUDE_FEATURE_KEYS),
        is_managed: true,
    })
}

fn save_opencode(
    path: &Path,
    endpoint: &str,
    model: &str,
    available_models: &[String],
    auth_token: Option<&str>,
    reasoning_effort: &str,
    thinking_enabled: bool,
    feature_flags: &BTreeMap<String, bool>,
) -> Result<(), String> {
    let mut root = read_json_object(path)?;
    let providers = ensure_object(&mut root, "provider")?;
    let provider = providers
        .entry(MELODY_PROVIDER_ID.to_string())
        .or_insert_with(|| Value::Object(Map::new()))
        .as_object_mut()
        .ok_or_else(|| "OpenCode provider.melody-hub must be an object".to_string())?;

    provider.insert(
        "npm".to_string(),
        Value::String("@ai-sdk/openai".to_string()),
    );
    provider.insert(
        "name".to_string(),
        Value::String(MELODY_PROVIDER_NAME.to_string()),
    );
    let options = ensure_object(provider, "options")?;
    options.insert("baseURL".to_string(), Value::String(endpoint.to_string()));
    if let Some(token) = auth_token {
        set_json_optional_string(options, "apiKey", token);
    }

    // 收集所有需要创建模型条目的名称：默认模型 + 可用模型列表（去重）
    let mut all_models: Vec<String> = Vec::new();
    if !model.is_empty() {
        all_models.push(model.to_string());
    }
    for m in available_models {
        let trimmed = m.trim().to_string();
        if !trimmed.is_empty() && !all_models.contains(&trimmed) {
            all_models.push(trimmed);
        }
    }

    if all_models.is_empty() {
        provider.remove("models");
    } else {
        let models = ensure_object(provider, "models")?;
        for model_name in &all_models {
            let model_config = models
                .entry(model_name.clone())
                .or_insert_with(|| Value::Object(Map::new()))
                .as_object_mut()
                .ok_or_else(|| {
                    "OpenCode provider.melody-hub.models must be an object".to_string()
                })?;
            model_config.insert("name".to_string(), Value::String(model_name.clone()));
            let model_options = ensure_object(model_config, "options")?;
            set_json_optional_string(model_options, "reasoningEffort", reasoning_effort);
            if thinking_enabled {
                model_options.insert(
                    "reasoningSummary".to_string(),
                    Value::String("auto".to_string()),
                );
            } else {
                model_options.remove("reasoningSummary");
            }
            if let Some(enabled) = feature_flags.get(OPENCODE_FEATURE_KEYS[0]) {
                set_json_include_flag(
                    model_options,
                    "reasoning.encrypted_content",
                    *enabled,
                );
            }
        }
    }
    write_json_atomic(path, &Value::Object(root))
}

fn read_opencode(path: &Path) -> Result<AgentConfigValues, String> {
    let root = read_json_object(path)?;
    let provider = root
        .get("provider")
        .and_then(Value::as_object)
        .and_then(|providers| providers.get(MELODY_PROVIDER_ID))
        .and_then(Value::as_object);
    let options = provider
        .and_then(|provider| provider.get("options"))
        .and_then(Value::as_object);
    let models_obj = provider
        .and_then(|provider| provider.get("models"))
        .and_then(Value::as_object);
    let model = models_obj
        .and_then(|models| models.keys().next())
        .cloned()
        .unwrap_or_default();
    // 所有模型名（排除默认模型）作为可用模型列表
    let available_models: Vec<String> = models_obj
        .map(|models| {
            models
                .keys()
                .filter(|k| *k != &model)
                .cloned()
                .collect()
        })
        .unwrap_or_default();
    let model_options = models_obj
        .and_then(|models| models.get(&model))
        .and_then(Value::as_object)
        .and_then(|model| model.get("options"))
        .and_then(Value::as_object);
    Ok(AgentConfigValues {
        endpoint: options
            .and_then(|options| options.get("baseURL"))
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        model,
        available_models,
        auth_token_set: options
            .and_then(|options| options.get("apiKey"))
            .and_then(Value::as_str)
            .map(|token| !token.trim().is_empty())
            .unwrap_or(false),
        reasoning_effort: model_options
            .and_then(|options| options.get("reasoningEffort"))
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        thinking_enabled: model_options
            .and_then(|options| options.get("reasoningSummary"))
            .and_then(Value::as_str)
            .map(|summary| !summary.trim().is_empty())
            .unwrap_or(false),
        feature_flags: read_opencode_feature_flags(model_options),
        is_managed: true,
    })
}

fn read_toml_document(path: &Path) -> Result<Document, String> {
    if !path.exists() {
        return Ok(Document::new());
    }
    let text = fs::read_to_string(path)
        .map_err(|e| format!("Unable to read {}: {}", path.display(), e))?;
    text.parse::<Document>()
        .map_err(|e| format!("Unable to parse {}: {}", path.display(), e))
}

fn validate_toml_setting_path(key: &str) -> Result<(), String> {
    let key = key.trim();
    if key.is_empty() {
        return Err("Codex setting key cannot be empty".to_string());
    }
    if key.split('.').any(|segment| {
        segment.is_empty()
            || !segment.chars().all(|character| {
                character.is_ascii_alphanumeric() || character == '_' || character == '-'
            })
    }) {
        return Err(format!("Unsupported Codex setting path: {}", key));
    }
    Ok(())
}

fn set_toml_json_path(
    document: &mut Document,
    key: &str,
    json_value: Option<&Value>,
) -> Result<(), String> {
    let segments: Vec<&str> = key.split('.').collect();
    let mut table = document.as_table_mut();
    for segment in &segments[..segments.len() - 1] {
        let item = table
            .entry(segment)
            .or_insert_with(|| Item::Table(Table::new()));
        if !item.is_table() {
            let existing = std::mem::replace(item, Item::None);
            *item = existing
                .into_table()
                .map(Item::Table)
                .unwrap_or_else(|_| Item::Table(Table::new()));
        }
        table = item.as_table_mut().ok_or_else(|| {
            format!("Codex setting parent is not a table: {}", segment)
        })?;
    }

    let leaf = segments[segments.len() - 1];
    match json_value {
        Some(json_value) => {
            table.insert(leaf, json_to_toml_item(json_value)?);
        }
        None => {
            table.remove(leaf);
        }
    }
    Ok(())
}

fn json_to_toml_item(value: &Value) -> Result<Item, String> {
    match value {
        Value::Null => Err(
            "TOML does not support null values; clear the setting instead".to_string(),
        ),
        Value::Bool(value) => Ok(Item::Value(TomlValue::from(*value))),
        Value::String(value) => Ok(Item::Value(TomlValue::from(value.clone()))),
        Value::Number(value) => {
            if let Some(value) = value.as_i64() {
                Ok(Item::Value(TomlValue::from(value)))
            } else if let Some(value) = value.as_u64() {
                let value = i64::try_from(value).map_err(|_| {
                    "TOML integer is outside the supported range".to_string()
                })?;
                Ok(Item::Value(TomlValue::from(value)))
            } else if let Some(value) = value.as_f64() {
                Ok(Item::Value(TomlValue::from(value)))
            } else {
                Err("Unsupported JSON number".to_string())
            }
        }
        Value::Array(values) => {
            let mut array = Array::new();
            for value in values {
                let item = json_to_toml_item(value)?;
                match item {
                    Item::Value(value) => array.push(value),
                    Item::Table(table) => {
                        array.push(TomlValue::from(table.into_inline_table()))
                    }
                    Item::ArrayOfTables(tables) => {
                        array.push(TomlValue::from(tables.into_array()))
                    }
                    Item::None => {
                        return Err("TOML arrays cannot contain empty values".to_string())
                    }
                }
            }
            Ok(Item::Value(TomlValue::from(array)))
        }
        Value::Object(values) => {
            let mut table = Table::new();
            for (key, value) in values {
                table.insert(key, json_to_toml_item(value)?);
            }
            Ok(Item::Table(table))
        }
    }
}

fn flatten_toml_document(document: &Document) -> BTreeMap<String, Value> {
    let mut values = BTreeMap::new();
    flatten_toml_table(document.as_table(), None, &mut values);
    values
}

fn flatten_toml_table(
    table: &Table,
    prefix: Option<&str>,
    values: &mut BTreeMap<String, Value>,
) {
    for (key, item) in table.iter() {
        let path = prefix
            .map(|prefix| format!("{}.{}", prefix, key))
            .unwrap_or_else(|| key.to_string());
        let json = toml_item_to_json(item);
        values.insert(path.clone(), json);
        if let Item::Table(child) = item {
            flatten_toml_table(child, Some(&path), values);
        } else if let Item::Value(TomlValue::InlineTable(child)) = item {
            flatten_toml_inline_table(child, Some(&path), values);
        }
    }
}

fn flatten_toml_inline_table(
    table: &InlineTable,
    prefix: Option<&str>,
    values: &mut BTreeMap<String, Value>,
) {
    for (key, value) in table.iter() {
        let path = prefix
            .map(|prefix| format!("{}.{}", prefix, key))
            .unwrap_or_else(|| key.to_string());
        values.insert(path, toml_value_to_json(value));
    }
}

fn toml_item_to_json(item: &Item) -> Value {
    match item {
        Item::None => Value::Null,
        Item::Value(value) => toml_value_to_json(value),
        Item::Table(table) => Value::Object(
            table
                .iter()
                .map(|(key, item)| (key.to_string(), toml_item_to_json(item)))
                .collect(),
        ),
        Item::ArrayOfTables(tables) => Value::Array(
            tables
                .iter()
                .map(|table| toml_item_to_json(&Item::Table(table.clone())))
                .collect(),
        ),
    }
}

fn toml_value_to_json(value: &TomlValue) -> Value {
    match value {
        TomlValue::String(value) => Value::String(value.value().clone()),
        TomlValue::Integer(value) => Value::Number((*value.value()).into()),
        TomlValue::Float(value) => serde_json::Number::from_f64(*value.value())
            .map(Value::Number)
            .unwrap_or(Value::Null),
        TomlValue::Boolean(value) => Value::Bool(*value.value()),
        TomlValue::Datetime(value) => Value::String(value.value().to_string()),
        TomlValue::Array(values) => {
            Value::Array(values.iter().map(toml_value_to_json).collect())
        }
        TomlValue::InlineTable(table) => Value::Object(
            table
                .iter()
                .map(|(key, value)| (key.to_string(), toml_value_to_json(value)))
                .collect(),
        ),
    }
}

fn read_json_object(path: &Path) -> Result<Map<String, Value>, String> {
    if !path.exists() {
        return Ok(Map::new());
    }
    let text = fs::read_to_string(path)
        .map_err(|e| format!("Unable to read {}: {}", path.display(), e))?;
    let value: Value = serde_json::from_str(&text)
        .map_err(|e| format!("Unable to parse {}: {}", path.display(), e))?;
    value
        .as_object()
        .cloned()
        .ok_or_else(|| format!("{} must contain a JSON object", path.display()))
}

fn ensure_object<'a>(
    object: &'a mut Map<String, Value>,
    key: &str,
) -> Result<&'a mut Map<String, Value>, String> {
    let entry = object
        .entry(key.to_string())
        .or_insert_with(|| Value::Object(Map::new()));
    if !entry.is_object() {
        return Err(format!("{} must be a JSON object", key));
    }
    entry
        .as_object_mut()
        .ok_or_else(|| format!("{} must be a JSON object", key))
}

fn set_json_optional_string(object: &mut Map<String, Value>, key: &str, value: &str) {
    if value.trim().is_empty() {
        object.remove(key);
    } else {
        object.insert(key.to_string(), Value::String(value.to_string()));
    }
}

fn set_json_optional_bool(
    object: &mut Map<String, Value>,
    key: &str,
    value: Option<&bool>,
) {
    if let Some(value) = value {
        object.insert(key.to_string(), Value::Bool(*value));
    }
}

fn read_json_bool_flags(
    root: &Map<String, Value>,
    keys: &[&str],
) -> BTreeMap<String, bool> {
    let mut flags = BTreeMap::new();
    for key in keys {
        if let Some(value) = root.get(*key).and_then(Value::as_bool) {
            flags.insert((*key).to_string(), value);
        }
    }
    flags
}

fn set_json_include_flag(options: &mut Map<String, Value>, needle: &str, enabled: bool) {
    if !enabled {
        if let Some(include) = options.get_mut("include").and_then(Value::as_array_mut) {
            include.retain(|value| value.as_str() != Some(needle));
            if include.is_empty() {
                options.remove("include");
            }
        }
        return;
    }

    let include = options
        .entry("include".to_string())
        .or_insert_with(|| Value::Array(Vec::new()));
    let Some(include) = include.as_array_mut() else {
        return;
    };
    include.retain(|value| value.as_str() != Some(needle));
    include.push(Value::String(needle.to_string()));
}

fn read_opencode_feature_flags(
    options: Option<&Map<String, Value>>,
) -> BTreeMap<String, bool> {
    let mut flags = BTreeMap::new();
    let Some(options) = options else {
        return flags;
    };
    let Some(include) = options.get("include") else {
        return flags;
    };
    let enabled = include
        .as_array()
        .map(|values| {
            values
                .iter()
                .any(|value| value.as_str() == Some("reasoning.encrypted_content"))
        })
        .unwrap_or(false);
    flags.insert(OPENCODE_FEATURE_KEYS[0].to_string(), enabled);
    flags
}

fn normalize_reasoning_effort(value: &str) -> Result<String, String> {
    let normalized = value.trim().to_ascii_lowercase();
    if normalized.is_empty() || normalized == "auto" {
        return Ok(String::new());
    }
    match normalized.as_str() {
        "minimal" | "low" | "medium" | "high" | "xhigh" | "max" => Ok(normalized),
        _ => Err(format!("Unsupported reasoning effort: {}", value.trim())),
    }
}

fn read_toml_bool_flags(item: Option<&Item>, keys: &[&str]) -> BTreeMap<String, bool> {
    let mut flags = BTreeMap::new();
    let Some(table) = item.and_then(Item::as_table_like) else {
        return flags;
    };
    for key in keys {
        if let Some(value) = table.get(key).and_then(Item::as_bool) {
            flags.insert((*key).to_string(), value);
        }
    }
    flags
}

fn set_toml_bool_flags(
    document: &mut Document,
    keys: &[&str],
    flags: &BTreeMap<String, bool>,
) {
    if !keys.iter().any(|key| flags.contains_key(*key)) {
        return;
    }
    let features = &mut document["features"];
    for key in keys {
        if let Some(enabled) = flags.get(*key) {
            features[*key] = value(*enabled);
        }
    }
}

fn set_toml_optional_string(provider: &mut Item, key: &str, token: &str) {
    if let Some(table) = provider.as_table_like_mut() {
        if token.trim().is_empty() {
            table.remove(key);
        } else {
            table.insert(key, value(token));
        }
    }
}

fn normalize_endpoint(endpoint: &str) -> Result<String, String> {
    let endpoint = endpoint.trim().trim_end_matches('/');
    if endpoint.is_empty() {
        return Err("Endpoint cannot be empty".to_string());
    }
    if !(endpoint.starts_with("http://") || endpoint.starts_with("https://")) {
        return Err("Endpoint must start with http:// or https://".to_string());
    }
    Ok(endpoint.to_string())
}

fn backup_path(path: &Path) -> PathBuf {
    let filename = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("config");
    path.with_file_name(format!("{}.melody-hub.bak", filename))
}

fn backup_config(path: &Path) -> Result<(), String> {
    backup_config_to(path, &backup_path(path))
}

fn backup_config_to(path: &Path, destination: &Path) -> Result<(), String> {
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::copy(path, destination)
        .map(|_| ())
        .map_err(|e| format!("Unable to back up {}: {}", path.display(), e))
}

fn write_text_atomic(path: &Path, content: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let temporary = path.with_file_name(format!(
        ".{}.melody-hub.tmp",
        path.file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("config")
    ));
    let mut file = File::create(&temporary).map_err(|e| e.to_string())?;
    file.write_all(content.as_bytes())
        .map_err(|e| e.to_string())?;
    file.sync_all().map_err(|e| e.to_string())?;
    preserve_permissions(path, &temporary);
    fs::rename(&temporary, path)
        .or_else(|_| {
            if path.exists() {
                fs::remove_file(path)?;
            }
            fs::rename(&temporary, path)
        })
        .map_err(|e| e.to_string())
}

fn write_json_atomic(path: &Path, value: &Value) -> Result<(), String> {
    let content = serde_json::to_string_pretty(value).map_err(|e| e.to_string())? + "\n";
    write_text_atomic(path, &content)
}

fn preserve_permissions(original: &Path, temporary: &Path) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mode = original
            .metadata()
            .map(|metadata| metadata.permissions().mode())
            .unwrap_or(0o600);
        let _ = fs::set_permissions(temporary, fs::Permissions::from_mode(mode));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn endpoint_validation_trims_slashes() {
        assert_eq!(
            normalize_endpoint(" http://127.0.0.1:8080/v1/ ").unwrap(),
            "http://127.0.0.1:8080/v1"
        );
        assert!(normalize_endpoint("127.0.0.1:8080").is_err());
    }

    #[test]
    fn codex_document_keeps_existing_content_and_sets_provider() {
        let mut document: Document = r#"model = "old"
[features]
multi_agent = true
"#
        .parse()
        .unwrap();
        let provider = &mut document["model_providers"][MELODY_PROVIDER_ID];
        provider["name"] = value(MELODY_PROVIDER_NAME);
        provider["base_url"] = value("http://127.0.0.1:8080/v1");
        provider["wire_api"] = value("responses");
        set_toml_optional_string(provider, "experimental_bearer_token", "token");
        assert_eq!(document["features"]["multi_agent"].as_bool(), Some(true));
        assert_eq!(
            document["model_providers"][MELODY_PROVIDER_ID]["wire_api"].as_str(),
            Some("responses")
        );
    }

    #[test]
    fn json_helpers_remove_an_explicitly_cleared_token() {
        let mut object = Map::new();
        object.insert("token".to_string(), Value::String("secret".to_string()));
        set_json_optional_string(&mut object, "token", "");
        assert!(!object.contains_key("token"));
    }

    #[test]
    fn codex_single_setting_updates_nested_tables_and_flattens_values() {
        let mut document: Document = r#"[features.network_proxy]
mode = "limited"
"#
        .parse()
        .unwrap();

        set_toml_json_path(
            &mut document,
            "features.network_proxy.enabled",
            Some(&Value::Bool(true)),
        )
        .unwrap();

        let flattened = flatten_toml_document(&document);
        assert_eq!(
            flattened.get("features.network_proxy.mode"),
            Some(&Value::String("limited".to_string()))
        );
        assert_eq!(
            flattened.get("features.network_proxy.enabled"),
            Some(&Value::Bool(true))
        );
    }

    #[test]
    fn codex_json_setting_supports_nested_objects_and_arrays() {
        let mut document = Document::new();
        let value = json!({
            "enabled": true,
            "domains": { "localhost": "allow" },
            "writable_roots": ["/tmp/project", "/tmp/cache"]
        });

        set_toml_json_path(&mut document, "features.network_proxy", Some(&value))
            .unwrap();

        let flattened = flatten_toml_document(&document);
        assert_eq!(
            flattened.get("features.network_proxy.enabled"),
            Some(&Value::Bool(true))
        );
        assert_eq!(
            flattened.get("features.network_proxy.domains.localhost"),
            Some(&Value::String("allow".to_string()))
        );
        assert_eq!(
            flattened.get("features.network_proxy.writable_roots"),
            Some(&json!(["/tmp/project", "/tmp/cache"]))
        );
    }

    #[test]
    fn complete_config_text_is_validated_per_agent_format() {
        assert!(validate_config_text(AgentApp::Codex, "model = \"gpt-5\"\n").is_ok());
        assert!(validate_config_text(AgentApp::Claude, "{\"env\":{}}\n").is_ok());
        assert!(
            validate_config_text(AgentApp::Claude, "{\"effortLevel\":\"xhigh\"}\n")
                .is_ok()
        );
        assert!(
            validate_config_text(AgentApp::Claude, "{\"effortLevel\":\"max\"}\n")
                .is_err()
        );
        assert!(
            validate_config_text(AgentApp::Claude, "{\"effortLevel\":true}\n").is_err()
        );
        assert!(validate_config_text(AgentApp::OpenCode, "[]").is_err());
        assert!(validate_config_text(AgentApp::Claude, "{invalid").is_err());
    }

    #[test]
    fn codex_round_trip_reads_the_written_provider() {
        let path = std::env::temp_dir().join(format!(
            "melody-hub-codex-test-{}.toml",
            uuid::Uuid::new_v4()
        ));
        let mut feature_flags = BTreeMap::new();
        feature_flags.insert("web_search".to_string(), true);
        save_codex(
            &path,
            "http://127.0.0.1:8080/v1",
            "deepseek-v4-flash",
            Some("token"),
            "xhigh",
            &feature_flags,
        )
        .unwrap();
        let values = read_codex(&path).unwrap();
        assert_eq!(values.endpoint, "http://127.0.0.1:8080/v1");
        assert_eq!(values.model, "deepseek-v4-flash");
        assert!(values.auth_token_set);
        assert_eq!(values.reasoning_effort, "xhigh");
        assert_eq!(values.feature_flags.get("web_search"), Some(&true));
        let _ = fs::remove_file(path);
    }

    #[test]
    fn claude_and_opencode_round_trip_preserve_json_sections() {
        let claude_path = std::env::temp_dir().join(format!(
            "melody-hub-claude-test-{}.json",
            uuid::Uuid::new_v4()
        ));
        let opencode_path = std::env::temp_dir().join(format!(
            "melody-hub-opencode-test-{}.json",
            uuid::Uuid::new_v4()
        ));
        let mut claude_flags = BTreeMap::new();
        claude_flags.insert("showThinkingSummaries".to_string(), true);
        let mut opencode_flags = BTreeMap::new();
        opencode_flags.insert("encryptedReasoning".to_string(), true);

        save_claude(
            &claude_path,
            "http://127.0.0.1:8080/v1",
            "claude-sonnet",
            Some("token"),
            "medium",
            true,
            &claude_flags,
        )
        .unwrap();
        save_opencode(
            &opencode_path,
            "http://127.0.0.1:8080/v1",
            "deepseek-v4-flash",
            Some("token"),
            "high",
            true,
            &opencode_flags,
        )
        .unwrap();

        let claude_values = read_claude(&claude_path).unwrap();
        let opencode_values = read_opencode(&opencode_path).unwrap();
        assert_eq!(claude_values.model, "claude-sonnet");
        assert!(claude_values.auth_token_set);
        assert_eq!(claude_values.reasoning_effort, "medium");
        assert!(claude_values.thinking_enabled);
        assert_eq!(
            claude_values.feature_flags.get("showThinkingSummaries"),
            Some(&true)
        );
        assert_eq!(opencode_values.model, "deepseek-v4-flash");
        assert!(opencode_values.auth_token_set);
        assert_eq!(opencode_values.reasoning_effort, "high");
        assert!(opencode_values.thinking_enabled);
        assert_eq!(
            opencode_values.feature_flags.get("encryptedReasoning"),
            Some(&true)
        );
        let _ = fs::remove_file(claude_path);
        let _ = fs::remove_file(opencode_path);
    }

    #[test]
    fn empty_model_clears_agent_defaults() {
        let codex_path = std::env::temp_dir().join(format!(
            "melody-hub-codex-clear-model-{}.toml",
            uuid::Uuid::new_v4()
        ));
        let claude_path = std::env::temp_dir().join(format!(
            "melody-hub-claude-clear-model-{}.json",
            uuid::Uuid::new_v4()
        ));
        let opencode_path = std::env::temp_dir().join(format!(
            "melody-hub-opencode-clear-model-{}.json",
            uuid::Uuid::new_v4()
        ));

        save_codex(
            &codex_path,
            "http://127.0.0.1:8080/v1",
            "codex-model",
            None,
            "",
            &BTreeMap::new(),
        )
        .unwrap();
        save_codex(
            &codex_path,
            "http://127.0.0.1:8080/v1",
            "",
            None,
            "",
            &BTreeMap::new(),
        )
        .unwrap();
        assert!(read_codex(&codex_path).unwrap().model.is_empty());

        save_claude(
            &claude_path,
            "http://127.0.0.1:8080",
            "claude-model",
            None,
            "",
            false,
            &BTreeMap::new(),
        )
        .unwrap();
        save_claude(
            &claude_path,
            "http://127.0.0.1:8080",
            "",
            None,
            "",
            false,
            &BTreeMap::new(),
        )
        .unwrap();
        assert!(read_claude(&claude_path).unwrap().model.is_empty());

        save_opencode(
            &opencode_path,
            "http://127.0.0.1:8080/v1",
            "opencode-model",
            None,
            "",
            false,
            &BTreeMap::new(),
        )
        .unwrap();
        save_opencode(
            &opencode_path,
            "http://127.0.0.1:8080/v1",
            "",
            None,
            "",
            false,
            &BTreeMap::new(),
        )
        .unwrap();
        assert!(read_opencode(&opencode_path).unwrap().model.is_empty());

        let _ = fs::remove_file(codex_path);
        let _ = fs::remove_file(claude_path);
        let _ = fs::remove_file(opencode_path);
    }
}
