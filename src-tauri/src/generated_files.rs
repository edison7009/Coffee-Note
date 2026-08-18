use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

const GENERATED_FILES_CONFIG: &str = "generated-files.json";

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct StoredGeneratedFilesSettings {
    directory: PathBuf,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedFilesSettings {
    pub directory: String,
    pub uses_desktop_default: bool,
}

fn config_path() -> PathBuf {
    crate::app_data_dir().join(GENERATED_FILES_CONFIG)
}

fn desktop_directory() -> Result<PathBuf, String> {
    dirs::desktop_dir()
        .or_else(|| dirs::home_dir().map(|home| home.join("Desktop")))
        .ok_or_else(|| "Could not find the current user's Desktop directory".to_string())
}

fn read_config(path: &Path) -> Result<Option<StoredGeneratedFilesSettings>, String> {
    if !path.is_file() {
        return Ok(None);
    }
    let contents = fs::read_to_string(path)
        .map_err(|error| format!("Could not read generated-files settings: {error}"))?;
    let settings = serde_json::from_str(&contents)
        .map_err(|error| format!("Could not parse generated-files settings: {error}"))?;
    Ok(Some(settings))
}

fn validate_directory(directory: PathBuf) -> Result<PathBuf, String> {
    if !directory.is_absolute() {
        return Err("The generated-files directory must be an absolute path".to_string());
    }
    if !directory.is_dir() {
        return Err("The generated-files directory does not exist or is not a folder".to_string());
    }
    directory
        .canonicalize()
        .map(|path| PathBuf::from(user_facing_path(&path)))
        .map_err(|error| format!("Could not resolve the generated-files directory: {error}"))
}

pub fn user_facing_path(path: &Path) -> String {
    let value = path.to_string_lossy();
    #[cfg(target_os = "windows")]
    {
        if let Some(network_path) = value.strip_prefix(r"\\?\UNC\") {
            return format!(r"\\{network_path}");
        }
        if let Some(local_path) = value.strip_prefix(r"\\?\") {
            return local_path.to_string();
        }
    }
    value.into_owned()
}

fn save_config(path: &Path, directory: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!("Could not create the generated-files settings directory: {error}")
        })?;
    }
    let contents = serde_json::to_string_pretty(&StoredGeneratedFilesSettings {
        directory: directory.to_path_buf(),
    })
    .map_err(|error| format!("Could not serialize generated-files settings: {error}"))?;
    fs::write(path, format!("{contents}\n"))
        .map_err(|error| format!("Could not write generated-files settings: {error}"))
}

fn current_settings_from(path: &Path) -> Result<GeneratedFilesSettings, String> {
    let stored = read_config(path)?;
    let (directory, uses_desktop_default) = match stored {
        Some(settings) => (settings.directory, false),
        None => (validate_directory(desktop_directory()?)?, true),
    };
    Ok(GeneratedFilesSettings {
        directory: directory.to_string_lossy().into_owned(),
        uses_desktop_default,
    })
}

pub fn output_directory() -> Result<PathBuf, String> {
    let settings = current_settings_from(&config_path())?;
    validate_directory(PathBuf::from(settings.directory))
}

#[tauri::command]
pub fn load_generated_files_settings() -> Result<GeneratedFilesSettings, String> {
    current_settings_from(&config_path())
}

#[tauri::command]
pub fn save_generated_files_directory(
    directory: Option<String>,
) -> Result<GeneratedFilesSettings, String> {
    let path = config_path();
    match directory.map(|value| value.trim().to_string()) {
        Some(value) if !value.is_empty() => {
            let directory = validate_directory(PathBuf::from(value))?;
            save_config(&path, &directory)?;
        }
        _ => {
            if path.exists() {
                fs::remove_file(&path).map_err(|error| {
                    format!("Could not restore the Desktop save location: {error}")
                })?;
            }
        }
    }
    current_settings_from(&path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    #[test]
    fn custom_directory_round_trips_and_must_be_absolute() {
        let fixture = std::env::temp_dir().join(format!("coffee-note-output-{}", Uuid::new_v4()));
        let output = fixture.join("exports");
        let settings_path = fixture.join("generated-files.json");
        fs::create_dir_all(&output).expect("fixture output should exist");

        let output = validate_directory(output).expect("output should validate");
        save_config(&settings_path, &output).expect("settings should save");
        let settings = current_settings_from(&settings_path).expect("settings should load");
        assert!(!settings.uses_desktop_default);
        assert_eq!(PathBuf::from(settings.directory), output);
        assert!(validate_directory(PathBuf::from("relative-output")).is_err());

        fs::remove_dir_all(fixture).expect("fixture should be removed");
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn windows_paths_hide_the_internal_verbatim_prefix() {
        assert_eq!(
            user_facing_path(Path::new(r"\\?\C:\Users\Alice\Desktop\deck.pptx")),
            r"C:\Users\Alice\Desktop\deck.pptx"
        );
        assert_eq!(
            user_facing_path(Path::new(r"\\?\UNC\server\share\video.mp4")),
            r"\\server\share\video.mp4"
        );
    }
}
