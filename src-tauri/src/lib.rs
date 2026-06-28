use serde_json::Value;
use std::time::Duration;
use tauri::command;

/// Canonical GitHub raw URL for the curated channels catalog.
/// Matches the constant in the old Electron IPC handler.
const GITHUB_RAW_URL: &str =
    "https://raw.githubusercontent.com/ANALAMIN/taranga-plus/master/data/channels.json";

/// Fetch channels.json via reqwest with a 5-second timeout.
///
/// Replaces the Electron `fetch-channels` IPC handler. The renderer calls this
/// through `invoke('fetch_channels')` and receives the raw JSON value, which the
/// renderer's `getChannels()` types as `ChannelFinal[]`.
#[command]
async fn fetch_channels() -> Result<Value, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .map_err(|e| format!("HTTP client build failed: {e}"))?;

    let resp = client
        .get(GITHUB_RAW_URL)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Could not retrieve channels: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!(
            "Could not retrieve channels: HTTP {}",
            resp.status()
        ));
    }

    let json: Value = resp
        .json()
        .await
        .map_err(|e| format!("Could not parse channels: {e}"))?;

    Ok(json)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![fetch_channels])
        .run(tauri::generate_context!())
        .expect("error while running Taranga+ application");
}
