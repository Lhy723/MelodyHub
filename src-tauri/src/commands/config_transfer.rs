// ═══════════════════════════════════════════════════════════════
// Melody Hub — Config export / import
// ═══════════════════════════════════════════════════════════════
// 将应用设置、供应商（含明文 API Key，用户显式选择随文件带走）与
// 聚合配置导出为单个 JSON 文件；导入时整体覆盖并热更新运行状态。
// ═══════════════════════════════════════════════════════════════

use serde::{Deserialize, Serialize};
use tauri::Manager;

use crate::commands::settings;
use crate::proxy::SharedAppState;
use crate::storage;
use crate::types::{Aggregation, Provider};

/// 导出文件标识与版本号——导入时校验 kind，version 留作向后兼容。
const EXPORT_KIND: &str = "melody-hub-config";
const EXPORT_VERSION: u32 = 1;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ConfigExport<'a> {
    kind: &'a str,
    version: u32,
    exported_at: String,
    settings: &'a settings::AppSettings,
    providers: &'a [Provider],
    aggregations: &'a [Aggregation],
}

/// 解析导入文件：kind 校验 + 必填三域；未知字段忽略（向前兼容）。
#[derive(Debug, Deserialize)]
struct ConfigImportFile {
    #[serde(default)]
    kind: String,
    settings: settings::AppSettings,
    providers: Vec<Provider>,
    aggregations: Vec<Aggregation>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSummary {
    pub providers: usize,
    pub aggregations: usize,
}

/// 导出配置到下载目录，返回文件完整路径。
#[tauri::command]
pub async fn export_config(app_handle: tauri::AppHandle) -> Result<String, String> {
    let settings = settings::load_or_init(&app_handle)?;
    let providers = storage::load_providers(&app_handle)?;
    let aggregations = storage::load_aggregations(&app_handle)?;

    let export = ConfigExport {
        kind: EXPORT_KIND,
        version: EXPORT_VERSION,
        exported_at: chrono::Utc::now().to_rfc3339(),
        settings: &settings,
        providers: &providers,
        aggregations: &aggregations,
    };

    let downloads = dirs::download_dir().unwrap_or_else(|| {
        app_handle
            .path()
            .app_data_dir()
            .unwrap_or_else(|_| std::path::PathBuf::from("."))
    });
    let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S");
    let path = downloads.join(format!("melody-hub-config-{timestamp}.json"));

    let json = serde_json::to_string_pretty(&export).map_err(|e| e.to_string())?;
    storage::write_json_atomic(&path, &json).map_err(|e| format!("导出失败：{e}"))?;
    println!("[config] Exported config to {:?}", path);
    Ok(path.to_string_lossy().to_string())
}

/// 导入配置（整体覆盖）：持久化三域配置并热更新运行状态与路由。
#[tauri::command]
pub async fn import_config(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, SharedAppState>,
    payload_json: String,
) -> Result<ImportSummary, String> {
    let file: ConfigImportFile = serde_json::from_str(&payload_json)
        .map_err(|e| format!("配置文件格式无效：{e}"))?;
    if file.kind != EXPORT_KIND {
        return Err("不是有效的 Melody Hub 配置文件".into());
    }

    // 供应商明文 Key 会经 save_providers 重新加密落盘。
    storage::save_providers(&app_handle, &file.providers)?;
    storage::save_aggregations(&app_handle, &file.aggregations)?;
    settings::write_settings(&app_handle, &file.settings)?;
    settings::apply_settings_to_state(state.inner(), &file.settings).await?;
    settings::restart_running_proxy_if_needed(state.inner().clone(), &file.settings)
        .await?;
    crate::proxy::update_routing_config(
        &state,
        file.providers.clone(),
        file.aggregations.clone(),
    )
    .await;

    // 开机自启与导入的设置对齐（与 save_settings 同一后置流程）。
    #[cfg(desktop)]
    {
        use tauri_plugin_autostart::ManagerExt;
        let manager = app_handle.autolaunch();
        if file.settings.launch_at_login {
            let _ = manager.enable();
        } else {
            let _ = manager.disable();
        }
    }

    println!(
        "[config] Imported config: {} providers, {} aggregations",
        file.providers.len(),
        file.aggregations.len()
    );
    Ok(ImportSummary {
        providers: file.providers.len(),
        aggregations: file.aggregations.len(),
    })
}
