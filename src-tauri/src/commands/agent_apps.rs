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
/// Marker env var written on takeover so a hand-written settings.json
/// (e.g. pointing at another gateway) is never auto-claimed as managed.
const CLAUDE_MANAGED_MARKER: &str = "MELODY_HUB_MANAGED";
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

    fn command_name(self) -> &'static str {
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
            // Codex resolves its state dir from $CODEX_HOME (default ~/.codex);
            // mirror the official lookup so we read/write the file the CLI
            // and the desktop app (`codex app`) actually use.
            Self::Codex => codex_home_dir()?.join("config.toml"),
            Self::Claude => home.join(".claude").join("settings.json"),
            Self::OpenCode => opencode_config_path(&home),
        })
    }
}

/// Codex 状态目录：`$CODEX_HOME` 优先，默认 `~/.codex`。CLI 与桌面版
/// (`codex app`) 共用该目录，`auth.json` 与 `config.toml` 都在其中。
fn codex_home_dir() -> Result<PathBuf, String> {
    let home = dirs::home_dir()
        .ok_or_else(|| "Unable to resolve the home directory".to_string())?;
    Ok(std::env::var_os("CODEX_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| home.join(".codex")))
}

/// Codex 登录态摘要。**不含任何令牌内容**：只区分登录方式，
/// 以便界面识别「ChatGPT 订阅登录」与「API Key 登录」。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexAuthState {
    /// `chatgpt`（订阅登录）| `api_key` | `none`
    pub login: String,
    /// 是否存在 ChatGPT 订阅登录缓存（`tokens.access_token` / `refresh_token`）。
    pub has_subscription: bool,
    /// `auth.json` 是否存在（区分「未登录」与「没有该文件」）。
    pub auth_file_exists: bool,
}

impl CodexAuthState {
    fn none() -> Self {
        Self {
            login: "none".to_string(),
            has_subscription: false,
            auth_file_exists: false,
        }
    }
}

/// 从指定 `auth.json` 判定登录态；文件缺失或损坏按未登录处理。
fn codex_auth_state_from(path: &Path) -> CodexAuthState {
    let Ok(text) = fs::read_to_string(path) else {
        return CodexAuthState::none();
    };
    let Ok(value) = serde_json::from_str::<Value>(&text) else {
        return CodexAuthState {
            login: "none".to_string(),
            has_subscription: false,
            auth_file_exists: true,
        };
    };
    let tokens = value.get("tokens").and_then(Value::as_object);
    let token_present = |key: &str| {
        tokens
            .and_then(|tokens| tokens.get(key))
            .and_then(Value::as_str)
            .map(|token| !token.trim().is_empty())
            .unwrap_or(false)
    };
    // 只认真实凭据：`tokens` 三件套非空才算 OAuth 登录，
    // 纯元数据（如 `last_refresh`、`tokens.account_id`）不算。
    let has_oauth_material = ["id_token", "access_token", "refresh_token"]
        .iter()
        .any(|key| token_present(key));
    let has_api_key = value
        .get("OPENAI_API_KEY")
        .and_then(Value::as_str)
        .map(|key| !key.trim().is_empty())
        .unwrap_or(false);
    // 与 Codex 一致：显式 auth_mode 优先，否则按凭据存在性判定、兜底 ChatGPT。
    let explicit_mode = value
        .get("auth_mode")
        .and_then(Value::as_str)
        .map(|mode| mode.trim().to_ascii_lowercase())
        .unwrap_or_default();
    let resolved_mode = if !explicit_mode.is_empty() {
        explicit_mode.as_str()
    } else if has_api_key {
        "apikey"
    } else {
        "chatgpt"
    };
    let has_subscription = resolved_mode == "chatgpt" && has_oauth_material;
    let login = if has_subscription {
        "chatgpt"
    } else if matches!(resolved_mode, "apikey" | "api_key") && has_api_key {
        "api_key"
    } else {
        "none"
    };
    CodexAuthState {
        login: login.to_string(),
        has_subscription,
        auth_file_exists: true,
    }
}

/// 读取 `~/.codex/auth.json`（尊重 `CODEX_HOME`）的登录态。
fn read_codex_auth_state() -> CodexAuthState {
    match codex_home_dir() {
        Ok(dir) => codex_auth_state_from(&dir.join("auth.json")),
        Err(_) => CodexAuthState::none(),
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
    /// Whether the agent's CLI command can be found through the current PATH.
    pub command_found: bool,
    pub command_path: Option<String>,
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
    /// Codex 登录态摘要（仅 Codex；不含令牌内容）。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub codex_auth: Option<CodexAuthState>,
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
    /// Codex 模型来源：`melody-hub`（默认，接管到本地端口）或 `keep`
    /// （保留 Codex 自身配置，例如 ChatGPT 订阅登录或用户自带的 provider）。
    /// `keep` 只写功能与推理开关，不触碰 `model_provider` / `model`。
    #[serde(default)]
    pub model_source: Option<String>,
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
    // 只有显式传 "keep" 才保留 Codex 自身配置；其余（含缺省）按接管处理。
    let model_source = if config.model_source.as_deref() == Some("keep") {
        "keep"
    } else {
        "melody-hub"
    };

    if path.exists() {
        backup_config(&path)?;
    }

    match app {
        AgentApp::Codex => save_codex(SaveTarget {
            thinking_enabled: config.thinking_enabled,
            path: &path,
            endpoint: &endpoint,
            model: &model,
            available_models: &config.available_models,
            auth_token: config.auth_token.as_deref(),
            reasoning_effort: &reasoning_effort,
            feature_flags: &config.feature_flags,
            model_source,
        })?,
        AgentApp::Claude => save_claude(SaveTarget {
            path: &path,
            endpoint: &endpoint,
            model: &model,
            available_models: &config.available_models,
            auth_token: config.auth_token.as_deref(),
            reasoning_effort: &reasoning_effort,
            thinking_enabled: config.thinking_enabled,
            feature_flags: &config.feature_flags,
            model_source,
        })?,
        AgentApp::OpenCode => save_opencode(SaveTarget {
            path: &path,
            endpoint: &endpoint,
            model: &model,
            available_models: &config.available_models,
            auth_token: config.auth_token.as_deref(),
            reasoning_effort: &reasoning_effort,
            thinking_enabled: config.thinking_enabled,
            feature_flags: &config.feature_flags,
            model_source,
        })?,
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
    // 手写文本把 Codex 指向 Melody Hub 时同样进入托管态：先留快照，
    // 保证后续「断开」能精确还原用户原本的模型来源。
    if app == AgentApp::Codex {
        let before = read_toml_document(&path)?;
        let managed_before = codex_is_managed(&before);
        let managed_after = content
            .parse::<Document>()
            .map(|document| codex_is_managed(&document))
            .unwrap_or(false);
        if !managed_before && managed_after && read_codex_restore_record(&path).is_none()
        {
            capture_codex_restore_record(&path, &before)?;
        }
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
    if !codex_is_managed(&document) && is_codex_model_source_key(&setting.key) {
        return Err(
            "Codex is not managed by Melody Hub: model source keys can only be changed by taking over"
                .to_string(),
        );
    }
    set_toml_json_path(&mut document, &setting.key, setting.value.as_ref())?;
    write_text_atomic(&path, &document.to_string())
        .map_err(|error| format!("Unable to write {}: {}", app.config_label(), error))?;
    load_status(app)
}

/// Remove every key Melody Hub manages from the agent's config file, leaving
/// the user's own settings untouched.  The file is backed up first, same as
/// the save paths.
#[tauri::command]
pub fn disconnect_agent_app(id: String) -> Result<AgentAppStatus, String> {
    let app = AgentApp::parse(&id)?;
    let path = app.config_path()?;
    if !path.exists() {
        return load_status(app);
    }
    let values = read_config_values(app, &path)?;
    if !values.is_managed {
        return Err(format!(
            "{} is not managed by Melody Hub; nothing to disconnect",
            app.config_label()
        ));
    }
    backup_config(&path)?;
    match app {
        AgentApp::Codex => disconnect_codex(&path)?,
        AgentApp::Claude => disconnect_claude(&path)?,
        AgentApp::OpenCode => disconnect_opencode(&path)?,
    }
    load_status(app)
}

fn disconnect_codex(path: &Path) -> Result<(), String> {
    let mut document = read_toml_document(path)?;
    // 按接管前的快照精确还原模型来源相关键与功能开关：直接删除会把用户
    // 原本的模型（例如订阅下的 gpt-5.6-luna）一并丢掉。
    restore_codex_model_source(path, &mut document)?;
    let _ = fs::remove_file(codex_restore_path(path));
    let _ = fs::remove_file(codex_model_list_path(path));
    write_text_atomic(path, &document.to_string())
}

fn disconnect_claude(path: &Path) -> Result<(), String> {
    let mut root = read_json_object(path)?;
    if let Some(env) = root.get_mut("env").and_then(Value::as_object_mut) {
        for key in [
            "ANTHROPIC_BASE_URL",
            "ANTHROPIC_MODEL",
            "ANTHROPIC_AUTH_TOKEN",
            CLAUDE_MANAGED_MARKER,
        ] {
            env.remove(key);
        }
    }
    for key in [
        "availableModels",
        "effortLevel",
        "alwaysThinkingEnabled",
        "showThinkingSummaries",
    ] {
        root.remove(key);
    }
    write_json_atomic(path, &Value::Object(root))
}

fn disconnect_opencode(path: &Path) -> Result<(), String> {
    let mut root = read_json_object(path)?;
    if let Some(providers) = root.get_mut("provider").and_then(Value::as_object_mut) {
        providers.remove(MELODY_PROVIDER_ID);
    }
    if let Some(model) = root.get("model").and_then(Value::as_str) {
        if model.starts_with(&format!("{MELODY_PROVIDER_ID}/")) {
            root.remove("model");
        }
    }
    write_json_atomic(path, &Value::Object(root))
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
    let command_path = find_executable_on_path(app.command_name());
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
        command_found: command_path.is_some(),
        command_path: command_path.map(|path| path.to_string_lossy().to_string()),
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
        codex_auth: if app == AgentApp::Codex {
            Some(read_codex_auth_state())
        } else {
            None
        },
        error: values.1,
    })
}

/// Resolve an agent CLI from PATH without spawning it. On Windows this also
/// checks PATHEXT so npm-installed `.cmd` shims are detected alongside `.exe`
/// binaries. A command being found means it is available to Melody Hub's
/// current process; it does not attempt to launch the agent or inspect its
/// version.
fn find_executable_on_path(name: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    let candidate_names = vec![name.to_string()];

    #[cfg(windows)]
    let candidate_names = {
        let mut candidate_names = candidate_names;
        let pathext = std::env::var_os("PATHEXT")
            .map(|value| value.to_string_lossy().into_owned())
            .unwrap_or_else(|| ".COM;.EXE;.BAT;.CMD".to_string());
        candidate_names.extend(pathext.split(';').filter_map(|extension| {
            let extension = extension.trim();
            (!extension.is_empty()).then(|| format!("{name}{extension}"))
        }));
        candidate_names
    };

    for directory in std::env::split_paths(&path) {
        for candidate_name in &candidate_names {
            let candidate = directory.join(candidate_name);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }

    None
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

/// Bundled parameters for saving an agent app config file.
struct SaveTarget<'a> {
    path: &'a Path,
    endpoint: &'a str,
    model: &'a str,
    available_models: &'a [String],
    auth_token: Option<&'a str>,
    reasoning_effort: &'a str,
    thinking_enabled: bool,
    feature_flags: &'a BTreeMap<String, bool>,
    model_source: &'a str,
}

fn save_codex(target: SaveTarget<'_>) -> Result<(), String> {
    let SaveTarget {
        path,
        endpoint,
        model,
        available_models,
        auth_token,
        reasoning_effort,
        thinking_enabled,
        feature_flags,
        model_source,
    } = target;
    let mut document = read_toml_document(path)?;

    if model_source == "keep" {
        // 保留 Codex 自身配置（ChatGPT 订阅登录，或用户自带的 provider）：
        // 只写功能与推理开关，绝不触碰 model_provider / model / 模型目录，
        // 因此订阅用户可以放心在这里开关实验特性。
        // 若此前处于接管态，这里视为退出接管并还原原始模型来源。
        if codex_is_managed(&document) {
            restore_codex_model_source(path, &mut document)?;
            let _ = fs::remove_file(codex_restore_path(path));
        }
        heal_codex_model_catalog_key(&mut document);
    } else {
        // 接管：首次接管前快照原始值，断开时据此精确还原。
        if !codex_is_managed(&document) {
            capture_codex_restore_record(path, &document)?;
        }
        document["model_provider"] = value(MELODY_PROVIDER_ID);
        if !model.is_empty() {
            document["model"] = value(model);
        } else {
            document.remove("model");
        }

        // 可用模型列表写入我们自己的旁挂文件：Codex 的 `model_catalog_json`
        // 是「指向目录 JSON 文件的路径」，写入内联数组会让 Codex 整份配置
        // 加载失败（实测 0.154：failed to parse model_catalog_json path）。
        write_codex_model_list(path, available_models)?;
        heal_codex_model_catalog_key(&mut document);

        let provider = &mut document["model_providers"][MELODY_PROVIDER_ID];
        provider["name"] = value(MELODY_PROVIDER_NAME);
        provider["base_url"] = value(endpoint);
        provider["wire_api"] = value("responses");
        if let Some(token) = auth_token {
            set_toml_optional_string(provider, "experimental_bearer_token", token);
        }
    }

    // 以下两项与模型来源无关，两种模式都写。
    if reasoning_effort.trim().is_empty() {
        document.remove("model_reasoning_effort");
    } else {
        document["model_reasoning_effort"] = value(reasoning_effort);
    }
    // Keep the summary flag symmetric with the reader: thinking enabled is
    // Codex's default ("auto") and only materialises when previously off, so
    // hand-tuned summaries survive; disabled writes the explicit off state.
    if thinking_enabled {
        if document
            .get("model_reasoning_summary")
            .and_then(Item::as_str)
            == Some("none")
        {
            document.remove("model_reasoning_summary");
        }
    } else {
        document["model_reasoning_summary"] = value("none");
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
    let is_managed =
        document.get("model_provider").is_some() && provider_id == MELODY_PROVIDER_ID;
    let provider = document
        .get("model_providers")
        .and_then(Item::as_table_like)
        .and_then(|providers| providers.get(provider_id))
        .and_then(Item::as_table_like);
    let feature_flags =
        read_toml_bool_flags(document.get("features"), &CODEX_FEATURE_KEYS);

    // 模型列表来自我们自己的旁挂文件；旧版本曾写进 model_catalog_json，
    // 该值与 Codex schema 不符，读取时兼容、保存时自动清理。
    let available_models = read_codex_model_list(path).unwrap_or_else(|| {
        document
            .get("model_catalog_json")
            .and_then(Item::as_str)
            .and_then(|json| serde_json::from_str::<Vec<String>>(json).ok())
            .unwrap_or_default()
    });

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

fn save_claude(target: SaveTarget<'_>) -> Result<(), String> {
    let SaveTarget {
        path,
        endpoint,
        model,
        available_models,
        auth_token,
        reasoning_effort,
        thinking_enabled,
        feature_flags,
        ..
    } = target;
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
            // Consent marker: written only via the explicit takeover flow.
            env.insert(
                CLAUDE_MANAGED_MARKER.to_string(),
                Value::String("1".to_string()),
            );
        }
    }
    if model.is_empty() {
        root.remove("model");
    } else {
        // Keep the root key in sync with env.ANTHROPIC_MODEL: a stale root
        // value from a hand-written config would shadow nothing but confuse.
        root.insert("model".into(), Value::String(model.to_string()));
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
        // Managed only when the explicit consent marker is present; a
        // hand-written settings.json pointing at another gateway stays
        // unmanaged until the user opts in.
        is_managed: env
            .and_then(|env| env.get(CLAUDE_MANAGED_MARKER))
            .and_then(Value::as_str)
            .map(|value| value == "1")
            .unwrap_or(false),
    })
}

fn save_opencode(target: SaveTarget<'_>) -> Result<(), String> {
    let SaveTarget {
        path,
        endpoint,
        model,
        available_models,
        auth_token,
        reasoning_effort,
        thinking_enabled,
        feature_flags,
        ..
    } = target;
    let mut root = read_json_object(path)?;
    let providers = ensure_object(&mut root, "provider")?;
    let provider = providers
        .entry(MELODY_PROVIDER_ID.to_string())
        .or_insert_with(|| Value::Object(Map::new()))
        .as_object_mut()
        .ok_or_else(|| "OpenCode provider.melody-hub must be an object".to_string())?;

    // Preserve a hand-tuned SDK package; only seed the default on first run.
    provider
        .entry("npm".to_string())
        .or_insert_with(|| Value::String("@ai-sdk/openai".to_string()));
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
        // Drop model entries that are no longer part of the configured list.
        let stale: Vec<String> = models
            .keys()
            .filter(|key| !all_models.contains(key))
            .cloned()
            .collect();
        for key in stale {
            models.remove(&key);
        }
    }
    // Mark the default model via OpenCode's top-level `model` key so the
    // selection survives JSON round-trips (BTreeMap ordering otherwise
    // makes "first entry" meaningless).
    if !model.is_empty() {
        root.insert(
            "model".into(),
            Value::String(format!("{MELODY_PROVIDER_ID}/{model}")),
        );
    } else if root
        .get("model")
        .and_then(Value::as_str)
        .map(|value| value.starts_with(&format!("{MELODY_PROVIDER_ID}/")))
        .unwrap_or(false)
    {
        root.remove("model");
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
    // Prefer OpenCode's top-level `model` marker ("melody-hub/<model>")
    // written by us; fall back to the first entry for legacy configs.
    let model = root
        .get("model")
        .and_then(Value::as_str)
        .and_then(|value| value.strip_prefix(&format!("{MELODY_PROVIDER_ID}/")))
        .filter(|selected| {
            models_obj
                .map(|models| models.contains_key(*selected))
                .unwrap_or(false)
        })
        .map(|selected| selected.to_string())
        .unwrap_or_else(|| {
            models_obj
                .and_then(|models| models.keys().next())
                .cloned()
                .unwrap_or_default()
        });
    // 所有模型名（排除默认模型）作为可用模型列表
    let available_models: Vec<String> = models_obj
        .map(|models| models.keys().filter(|k| *k != &model).cloned().collect())
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
        // Managed means our provider block exists in the config.
        is_managed: provider.is_some(),
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

/// 决定「请求走哪个模型来源」的键：未接管（保留 Codex 自身配置）时禁止修改，
/// 只能通过接管写入，避免订阅用户在编辑功能开关时误把模型来源指向本地端口。
const CODEX_MODEL_SOURCE_KEYS: [&str; 3] =
    ["model", "model_provider", "model_catalog_json"];

fn is_codex_model_source_key(key: &str) -> bool {
    CODEX_MODEL_SOURCE_KEYS.contains(&key)
        || key == "model_providers"
        || key.starts_with("model_providers.")
}

/// 接管时会改写的顶层键（断开时按快照还原）。
const CODEX_MANAGED_TOP_LEVEL_KEYS: [&str; 5] = [
    "model",
    "model_provider",
    "model_catalog_json",
    "model_reasoning_effort",
    "model_reasoning_summary",
];

/// 接管前快照：只记录模型来源相关键与功能开关，**不保存任何凭据**。
#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CodexRestoreRecord {
    /// 顶层字符串键 → 原值。
    #[serde(default)]
    top_level: BTreeMap<String, String>,
    /// 接管前不存在、断开时应删除的顶层键。
    #[serde(default)]
    absent_top_level: Vec<String>,
    /// `features.*` 的原值；未出现在此处的功能键视为原本不存在。
    #[serde(default)]
    features: BTreeMap<String, bool>,
}

/// 快照与目标配置同目录：`config.toml.melody-hub.restore.json`。
fn codex_restore_path(path: &Path) -> PathBuf {
    let filename = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("config");
    path.with_file_name(format!("{}.melody-hub.restore.json", filename))
}

/// 我们自己的模型列表文件：`config.toml.melody-hub.models.json`。
/// 放在 Codex 配置目录里，但 Codex 不读取它，因此不会影响其配置解析。
fn codex_model_list_path(path: &Path) -> PathBuf {
    let filename = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("config");
    path.with_file_name(format!("{}.melody-hub.models.json", filename))
}

fn write_codex_model_list(
    path: &Path,
    available_models: &[String],
) -> Result<(), String> {
    let list: Vec<&str> = available_models
        .iter()
        .map(|model| model.trim())
        .filter(|model| !model.is_empty())
        .collect();
    let target = codex_model_list_path(path);
    if list.is_empty() {
        let _ = fs::remove_file(target);
        return Ok(());
    }
    let json = serde_json::to_string_pretty(&list).map_err(|e| e.to_string())?;
    write_text_atomic(&target, &json)
}

fn read_codex_model_list(path: &Path) -> Option<Vec<String>> {
    let text = fs::read_to_string(codex_model_list_path(path)).ok()?;
    serde_json::from_str::<Vec<String>>(&text).ok()
}

/// 清理旧版本写进 `model_catalog_json` 的内联数组（不符合 Codex schema，
/// 会让配置整体加载失败）；用户自己的取值（合法路径）保持不动。
fn heal_codex_model_catalog_key(document: &mut Document) {
    let legacy = document
        .get("model_catalog_json")
        .and_then(Item::as_str)
        .and_then(|value| serde_json::from_str::<Vec<String>>(value).ok())
        .is_some();
    if legacy {
        document.remove("model_catalog_json");
    }
}

fn codex_is_managed(document: &Document) -> bool {
    document.get("model_provider").and_then(Item::as_str) == Some(MELODY_PROVIDER_ID)
}

fn remove_melody_provider_table(document: &mut Document) {
    let now_empty = match document
        .get_mut("model_providers")
        .and_then(Item::as_table_like_mut)
    {
        Some(providers) => {
            providers.remove(MELODY_PROVIDER_ID);
            // 只清理我们写入的条目；清空后一并移除空表，避免留下
            // 无意义的 `[model_providers]` 块（用户的其他 provider 不受影响）。
            providers.is_empty()
        }
        None => false,
    };
    if now_empty {
        document.remove("model_providers");
    }
}

/// 记录接管前的原始值（仅在从非托管态进入接管时调用一次）。
fn capture_codex_restore_record(path: &Path, document: &Document) -> Result<(), String> {
    let mut record = CodexRestoreRecord::default();
    for key in CODEX_MANAGED_TOP_LEVEL_KEYS {
        match document.get(key) {
            None => record.absent_top_level.push(key.to_string()),
            Some(item) => {
                // 非字符串取值不进快照：还原时保持不动，宁可不动也不误删。
                if let Some(text) = item.as_str() {
                    record.top_level.insert(key.to_string(), text.to_string());
                }
            }
        }
    }
    if let Some(features) = document.get("features").and_then(Item::as_table_like) {
        for key in CODEX_FEATURE_KEYS {
            if let Some(enabled) = features.get(key).and_then(Item::as_bool) {
                record.features.insert(key.to_string(), enabled);
            }
        }
    }
    let json = serde_json::to_string_pretty(&record).map_err(|e| e.to_string())?;
    write_text_atomic(&codex_restore_path(path), &json)
}

fn read_codex_restore_record(path: &Path) -> Option<CodexRestoreRecord> {
    let text = fs::read_to_string(codex_restore_path(path)).ok()?;
    serde_json::from_str(&text).ok()
}

/// 退出接管：按快照还原顶层键与功能开关，并移除我们写入的 provider 表。
fn restore_codex_model_source(
    path: &Path,
    document: &mut Document,
) -> Result<(), String> {
    if let Some(record) = read_codex_restore_record(path) {
        for key in CODEX_MANAGED_TOP_LEVEL_KEYS {
            if let Some(original) = record.top_level.get(key) {
                document[key] = value(original.as_str());
            } else if record.absent_top_level.iter().any(|absent| absent == key) {
                document.remove(key);
            }
        }
        if let Some(features) = document
            .get_mut("features")
            .and_then(Item::as_table_like_mut)
        {
            for key in CODEX_FEATURE_KEYS {
                match record.features.get(key) {
                    Some(enabled) => {
                        features.insert(key, value(*enabled));
                    }
                    None => {
                        features.remove(key);
                    }
                }
            }
        }
    } else {
        // 没有快照（更低版本接管留下的状态）：退化为清理我们写入的键。
        for key in CODEX_MANAGED_TOP_LEVEL_KEYS {
            document.remove(key);
        }
        if let Some(features) = document
            .get_mut("features")
            .and_then(Item::as_table_like_mut)
        {
            for key in CODEX_FEATURE_KEYS {
                features.remove(key);
            }
        }
    }
    remove_melody_provider_table(document);
    Ok(())
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

    #[cfg(not(unix))]
    {
        // Windows has no Unix permission mode to copy, but keep the
        // cross-platform function signature explicit and warning-free.
        let _ = (original, temporary);
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

    fn unique_temp_path(tag: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "melody-hub-agent-apps-{}-{}-{}.toml",
            tag,
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|elapsed| elapsed.as_nanos())
                .unwrap_or_default()
        ))
    }

    fn cleanup(path: &Path) {
        let _ = fs::remove_file(path);
        let _ = fs::remove_file(codex_restore_path(path));
    }

    /// 订阅登录（auth_mode = chatgpt + tokens）应被识别为 ChatGPT 登录。
    #[test]
    fn codex_auth_state_detects_chatgpt_subscription() {
        let path = unique_temp_path("auth-chatgpt").with_extension("json");
        fs::write(
            &path,
            r#"{"auth_mode":"chatgpt","OPENAI_API_KEY":null,"tokens":{"access_token":"a","refresh_token":"r","id_token":"i","account_id":"acct"}}"#,
        )
        .unwrap();

        let state = codex_auth_state_from(&path);
        assert!(state.has_subscription);
        assert_eq!(state.login, "chatgpt");
        assert!(state.auth_file_exists);
        let _ = fs::remove_file(&path);
    }

    /// 只有 API Key 的登录不应被误判为订阅。
    #[test]
    fn codex_auth_state_detects_api_key_login() {
        let path = unique_temp_path("auth-apikey").with_extension("json");
        fs::write(
            &path,
            r#"{"OPENAI_API_KEY":"sk-test","auth_mode":"apikey"}"#,
        )
        .unwrap();

        let state = codex_auth_state_from(&path);
        assert!(!state.has_subscription);
        assert_eq!(state.login, "api_key");
        let _ = fs::remove_file(&path);
    }

    /// 只有元数据残留（无 tokens 三件套）不算订阅登录。
    #[test]
    fn codex_auth_state_ignores_metadata_only_residue() {
        let path = unique_temp_path("auth-metadata").with_extension("json");
        fs::write(
            &path,
            r#"{"auth_mode":"chatgpt","last_refresh":"2026-09-11T00:00:00Z","tokens":{"account_id":"acct"}}"#,
        )
        .unwrap();

        let state = codex_auth_state_from(&path);
        assert!(!state.has_subscription);
        assert_eq!(state.login, "none");
        let _ = fs::remove_file(&path);
    }

    /// 文件缺失或损坏按未登录处理，且不 panic。
    #[test]
    fn codex_auth_state_handles_missing_and_broken_files() {
        let missing = unique_temp_path("auth-missing").with_extension("json");
        let state = codex_auth_state_from(&missing);
        assert_eq!(state.login, "none");
        assert!(!state.auth_file_exists);

        let broken = unique_temp_path("auth-broken").with_extension("json");
        fs::write(&broken, "not json").unwrap();
        let state = codex_auth_state_from(&broken);
        assert_eq!(state.login, "none");
        assert!(state.auth_file_exists);
        let _ = fs::remove_file(&broken);
    }

    /// 未托管时不得通过单键写入改模型来源（后端硬约束，不只靠界面隐藏）。
    #[test]
    fn codex_unmanaged_single_key_write_rejects_model_source() {
        assert!(is_codex_model_source_key("model"));
        assert!(is_codex_model_source_key("model_provider"));
        assert!(is_codex_model_source_key("model_catalog_json"));
        assert!(is_codex_model_source_key("model_providers.melody-hub"));
        // 功能与推理开关不受限制。
        assert!(!is_codex_model_source_key("features.web_search"));
        assert!(!is_codex_model_source_key("model_reasoning_effort"));
    }

    /// 手写文本把 Codex 指向 Melody Hub：应留下快照，断开可精确还原。
    #[test]
    fn codex_raw_text_switch_to_managed_keeps_restore_snapshot() {
        let path = unique_temp_path("codex-raw-text");
        fs::write(
            &path,
            "model = \"gpt-5.6-luna\"\nmodel_reasoning_effort = \"max\"\n",
        )
        .unwrap();

        // 模拟 save_agent_app_text 的快照时机。
        let before = read_toml_document(&path).unwrap();
        let managed_before = codex_is_managed(&before);
        let content = "model = \"gpt-4.1\"\nmodel_provider = \"melody-hub\"\n\n[model_providers.melody-hub]\nbase_url = \"http://127.0.0.1:8080/v1\"\nwire_api = \"responses\"\n";
        let managed_after = content
            .parse::<Document>()
            .map(|document| codex_is_managed(&document))
            .unwrap_or(false);
        assert!(!managed_before && managed_after);
        if !managed_before && managed_after && read_codex_restore_record(&path).is_none()
        {
            capture_codex_restore_record(&path, &before).unwrap();
        }
        fs::write(&path, content).unwrap();
        assert!(codex_restore_path(&path).exists());

        disconnect_codex(&path).unwrap();
        let restored = read_toml_document(&path).unwrap();
        assert_eq!(
            restored.get("model").and_then(Item::as_str),
            Some("gpt-5.6-luna")
        );
        assert!(restored.get("model_provider").is_none());
        assert!(restored.get("model_providers").is_none());
        cleanup(&path);
    }

    /// 接管不得写入 Codex 的 `model_catalog_json`（该键要求路径且会让配置
    /// 加载失败），模型列表改为我们自己的旁挂文件。
    #[test]
    fn codex_takeover_keeps_model_list_out_of_codex_config() {
        let path = unique_temp_path("codex-catalog");
        fs::write(
            &path,
            "model = \"gpt-5.6-luna\"\nmodel_catalog_json = \"[\\\"legacy\\\"]\"\n",
        )
        .unwrap();

        let available = vec!["gpt-4.1".to_string(), "deepseek-v4-flash".to_string()];
        let flags = BTreeMap::new();
        save_codex(SaveTarget {
            path: &path,
            endpoint: "http://127.0.0.1:8080/v1",
            model: "gpt-4.1",
            available_models: &available,
            auth_token: Some("token"),
            reasoning_effort: "max",
            thinking_enabled: true,
            feature_flags: &flags,
            model_source: "melody-hub",
        })
        .unwrap();

        let document = read_toml_document(&path).unwrap();
        // 旧版本写入的内联数组必须被清掉，且不再写入新值。
        assert!(document.get("model_catalog_json").is_none());
        // 模型列表改存旁挂文件，读回顺序与内容一致。
        assert_eq!(read_codex_model_list(&path), Some(available.clone()));
        assert_eq!(read_codex(&path).unwrap().available_models, available);
        // 用户自己的其他键照旧保留。
        assert_eq!(
            document.get("service_tier").and_then(Item::as_str),
            None,
            "sample config has no service_tier"
        );

        disconnect_codex(&path).unwrap();
        // 断开后旁挂文件清理，原始 model 还原。
        assert!(read_codex_model_list(&path).is_none());
        assert_eq!(
            read_toml_document(&path)
                .unwrap()
                .get("model")
                .and_then(Item::as_str),
            Some("gpt-5.6-luna")
        );
        cleanup(&path);
    }

    /// keep 模式：订阅用户编辑功能开关时，模型来源必须原封不动。
    #[test]
    fn codex_keep_mode_preserves_model_source() {
        let path = unique_temp_path("codex-keep");
        fs::write(
            &path,
            "model = \"gpt-5.6-luna\"\nmodel_reasoning_effort = \"max\"\n\n[features]\nweb_search = true\n",
        )
        .unwrap();

        let available = vec!["gpt-4.1".to_string()];
        let flags = BTreeMap::from([("web_search".to_string(), false)]);
        save_codex(SaveTarget {
            path: &path,
            endpoint: "http://127.0.0.1:8080",
            model: "gpt-4.1",
            available_models: &available,
            auth_token: Some("token"),
            reasoning_effort: "max",
            thinking_enabled: true,
            feature_flags: &flags,
            model_source: "keep",
        })
        .unwrap();

        let document = read_toml_document(&path).unwrap();
        assert_eq!(
            document.get("model").and_then(Item::as_str),
            Some("gpt-5.6-luna")
        );
        assert!(document.get("model_provider").is_none());
        assert!(document.get("model_providers").is_none());
        assert!(document.get("model_catalog_json").is_none());
        // 功能开关仍然按用户的编辑写入。
        assert_eq!(
            document
                .get("features")
                .and_then(Item::as_table_like)
                .and_then(|features| features.get("web_search"))
                .and_then(Item::as_bool),
            Some(false)
        );
        cleanup(&path);
    }

    /// 接管后再断开，必须还原用户原本的模型与 provider，而不是直接删除。
    #[test]
    fn codex_takeover_then_disconnect_restores_original_model_source() {
        let path = unique_temp_path("codex-restore");
        fs::write(
            &path,
            "model = \"gpt-5.6-luna\"\nmodel_reasoning_effort = \"max\"\n",
        )
        .unwrap();

        let available = vec!["gpt-4.1".to_string()];
        let flags = BTreeMap::new();
        save_codex(SaveTarget {
            path: &path,
            endpoint: "http://127.0.0.1:8080",
            model: "gpt-4.1",
            available_models: &available,
            auth_token: Some("token"),
            reasoning_effort: "high",
            thinking_enabled: true,
            feature_flags: &flags,
            model_source: "melody-hub",
        })
        .unwrap();

        let managed = read_toml_document(&path).unwrap();
        assert_eq!(
            managed.get("model_provider").and_then(Item::as_str),
            Some(MELODY_PROVIDER_ID)
        );
        assert_eq!(managed.get("model").and_then(Item::as_str), Some("gpt-4.1"));
        assert!(codex_restore_path(&path).exists());

        disconnect_codex(&path).unwrap();

        let restored = read_toml_document(&path).unwrap();
        assert_eq!(
            restored.get("model").and_then(Item::as_str),
            Some("gpt-5.6-luna")
        );
        assert_eq!(
            restored
                .get("model_reasoning_effort")
                .and_then(Item::as_str),
            Some("max")
        );
        assert!(restored.get("model_provider").is_none());
        assert!(restored.get("model_providers").is_none());
        assert!(!codex_restore_path(&path).exists());
        cleanup(&path);
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
        save_codex(SaveTarget {
            thinking_enabled: false,
            path: &path,
            endpoint: "http://127.0.0.1:8080/v1",
            model: "deepseek-v4-flash",
            available_models: &[],
            auth_token: Some("token"),
            reasoning_effort: "xhigh",
            feature_flags: &feature_flags,
            model_source: "melody-hub",
        })
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

        save_claude(SaveTarget {
            path: &claude_path,
            endpoint: "http://127.0.0.1:8080/v1",
            model: "claude-sonnet",
            available_models: &[],
            auth_token: Some("token"),
            reasoning_effort: "medium",
            thinking_enabled: true,
            feature_flags: &claude_flags,
            model_source: "melody-hub",
        })
        .unwrap();
        save_opencode(SaveTarget {
            path: &opencode_path,
            endpoint: "http://127.0.0.1:8080/v1",
            model: "deepseek-v4-flash",
            available_models: &[],
            auth_token: Some("token"),
            reasoning_effort: "high",
            thinking_enabled: true,
            feature_flags: &opencode_flags,
            model_source: "melody-hub",
        })
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

        save_codex(SaveTarget {
            thinking_enabled: false,
            path: &codex_path,
            endpoint: "http://127.0.0.1:8080/v1",
            model: "codex-model",
            available_models: &[],
            auth_token: None,
            reasoning_effort: "",
            feature_flags: &BTreeMap::new(),
            model_source: "melody-hub",
        })
        .unwrap();
        save_codex(SaveTarget {
            thinking_enabled: false,
            path: &codex_path,
            endpoint: "http://127.0.0.1:8080/v1",
            model: "",
            available_models: &[],
            auth_token: None,
            reasoning_effort: "",
            feature_flags: &BTreeMap::new(),
            model_source: "melody-hub",
        })
        .unwrap();
        assert!(read_codex(&codex_path).unwrap().model.is_empty());

        save_claude(SaveTarget {
            path: &claude_path,
            endpoint: "http://127.0.0.1:8080",
            model: "claude-model",
            available_models: &[],
            auth_token: None,
            reasoning_effort: "",
            thinking_enabled: false,
            feature_flags: &BTreeMap::new(),
            model_source: "melody-hub",
        })
        .unwrap();
        save_claude(SaveTarget {
            path: &claude_path,
            endpoint: "http://127.0.0.1:8080",
            model: "",
            available_models: &[],
            auth_token: None,
            reasoning_effort: "",
            thinking_enabled: false,
            feature_flags: &BTreeMap::new(),
            model_source: "melody-hub",
        })
        .unwrap();
        assert!(read_claude(&claude_path).unwrap().model.is_empty());

        save_opencode(SaveTarget {
            path: &opencode_path,
            endpoint: "http://127.0.0.1:8080/v1",
            model: "opencode-model",
            available_models: &[],
            auth_token: None,
            reasoning_effort: "",
            thinking_enabled: false,
            feature_flags: &BTreeMap::new(),
            model_source: "melody-hub",
        })
        .unwrap();
        save_opencode(SaveTarget {
            path: &opencode_path,
            endpoint: "http://127.0.0.1:8080/v1",
            model: "",
            available_models: &[],
            auth_token: None,
            reasoning_effort: "",
            thinking_enabled: false,
            feature_flags: &BTreeMap::new(),
            model_source: "melody-hub",
        })
        .unwrap();
        assert!(read_opencode(&opencode_path).unwrap().model.is_empty());

        let _ = fs::remove_file(codex_path);
        let _ = fs::remove_file(claude_path);
        let _ = fs::remove_file(opencode_path);
    }
}
