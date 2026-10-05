#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    fs,
    path::Path,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{webview::NewWindowResponse, AppHandle, Manager, Url, WebviewWindowBuilder};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

fn validate_filename(name: &str) -> Result<&str, String> {
    let stem = name.split('.').next().unwrap_or("").to_ascii_uppercase();
    let reserved = matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || (stem.len() == 4
            && (stem.starts_with("COM") || stem.starts_with("LPT"))
            && matches!(stem.as_bytes()[3], b'1'..=b'9'));
    if name.is_empty()
        || name.len() > 240
        || reserved
        || name.starts_with('.')
        || name.ends_with(['.', ' '])
        || name
            .chars()
            .any(|c| c.is_control() || "<>:\"/\\|?*".contains(c))
    {
        return Err("Érvénytelen fájlnév.".into());
    }
    Ok(name)
}

fn allowed_source(name: &str) -> Result<(), String> {
    validate_filename(name)?;
    let ext = Path::new(name)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if !matches!(ext.as_str(), "pdf" | "docx" | "xls" | "xlsx" | "txt") {
        return Err("Nem támogatott forrásfájl.".into());
    }
    Ok(())
}

#[tauri::command]
async fn save_document(app: AppHandle, name: String, data: Vec<u8>) -> Result<bool, String> {
    validate_filename(&name)?;
    tauri::async_runtime::spawn_blocking(move || {
        let Some(file) = app
            .dialog()
            .file()
            .set_title("Mentés")
            .set_file_name(&name)
            .blocking_save_file()
        else {
            return Ok(false);
        };
        let path = file.into_path().map_err(|e| e.to_string())?;
        fs::write(path, data).map_err(|e| e.to_string())?;
        Ok(true)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn open_source_file(app: AppHandle, name: String, data: Vec<u8>) -> Result<(), String> {
    allowed_source(&name)?;
    tauri::async_runtime::spawn_blocking(move || {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_nanos();
        let dir = app
            .path()
            .app_cache_dir()
            .map_err(|e| e.to_string())?
            .join("sources")
            .join(format!("{}-{stamp}", std::process::id()));
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let path = dir.join(name);
        fs::write(&path, data).map_err(|e| e.to_string())?;
        app.opener()
            .open_path(path.to_string_lossy().into_owned(), None::<&str>)
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

fn internal_url(url: &Url, dev_url: Option<&Url>) -> bool {
    (url.scheme() == "tauri" && url.host_str() == Some("localhost"))
        || (matches!(url.scheme(), "http" | "https")
            && url.host_str() == Some("tauri.localhost")
            && url.port().is_none())
        || dev_url.is_some_and(|dev| url.origin() == dev.origin())
}

fn open_external(app: &AppHandle, url: &Url) {
    if matches!(url.scheme(), "http" | "https") {
        if let Err(e) = app.opener().open_url(url.as_str(), None::<&str>) {
            eprintln!("Cannot open link: {e}");
        }
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_opener::Builder::new()
                .open_js_links_on_click(false)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![save_document, open_source_file])
        .setup(|app| {
            let profile = app.path().app_local_data_dir()?.join("WebView");
            fs::create_dir_all(&profile)?;
            let nav_app = app.handle().clone();
            let link_app = app.handle().clone();
            let dev_url = if cfg!(dev) {
                app.config().build.dev_url.clone()
            } else {
                None
            };
            WebviewWindowBuilder::from_config(app, &app.config().app.windows[0])?
                .data_directory(profile)
                .on_navigation(move |url| {
                    if internal_url(url, dev_url.as_ref()) {
                        return true;
                    }
                    open_external(&nav_app, url);
                    false
                })
                .on_new_window(move |url, _| {
                    open_external(&link_app, &url);
                    NewWindowResponse::Deny
                })
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect(
            "RecipeFlow could not start. Check that Microsoft Edge WebView2 Runtime is installed.",
        );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn source_names_cannot_escape_cache_or_launch_programs() {
        for name in [
            "../source.pdf",
            "C:\\source.pdf",
            "source.pdf:payload",
            "CON.pdf",
            "x.exe",
            "x.doc",
            "x.",
        ] {
            assert!(allowed_source(name).is_err(), "{name}");
        }
        for name in [
            "Beszállítói specifikáció.PDF",
            "Recept.xlsx",
            "Demo.docx.txt",
        ] {
            assert!(allowed_source(name).is_ok(), "{name}");
        }
    }

    #[test]
    fn external_pages_do_not_gain_app_navigation() {
        for url in [
            "https://example.com",
            "http://tauri.localhost.evil.test",
            "file:///C:/Windows/system.ini",
            "http://tauri.localhost:9000",
        ] {
            assert!(!internal_url(&Url::parse(url).unwrap(), None));
        }
        assert!(internal_url(
            &Url::parse("http://tauri.localhost/beallitasok").unwrap(),
            None
        ));
        let dev = Url::parse("http://127.0.0.1:43128").unwrap();
        assert!(internal_url(
            &Url::parse("http://127.0.0.1:43128/uj").unwrap(),
            Some(&dev)
        ));
        assert!(!internal_url(
            &Url::parse("http://127.0.0.1:43127").unwrap(),
            Some(&dev)
        ));
    }
}
