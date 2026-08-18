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
    pub uses_workspace_default: bool,
}

fn config_path() -> PathBuf {
    crate::app_data_dir().join(GENERATED_FILES_CONFIG)
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

fn current_settings_from(
    path: &Path,
    workspace_root: &Path,
) -> Result<GeneratedFilesSettings, String> {
    let stored = read_config(path)?;
    let (directory, uses_workspace_default) = match stored {
        Some(settings) => (settings.directory, false),
        None => (validate_directory(workspace_root.to_path_buf())?, true),
    };
    Ok(GeneratedFilesSettings {
        directory: directory.to_string_lossy().into_owned(),
        uses_workspace_default,
    })
}

pub fn output_directory(workspace_root: &Path) -> Result<PathBuf, String> {
    let settings = current_settings_from(&config_path(), workspace_root)?;
    validate_directory(PathBuf::from(settings.directory))
}

#[tauri::command]
pub fn load_generated_files_settings(
    workspace_root: String,
) -> Result<GeneratedFilesSettings, String> {
    current_settings_from(&config_path(), Path::new(&workspace_root))
}

#[tauri::command]
pub fn save_generated_files_directory(
    directory: Option<String>,
    workspace_root: String,
) -> Result<GeneratedFilesSettings, String> {
    save_generated_files_directory_to(&config_path(), directory, Path::new(&workspace_root))
}

fn save_generated_files_directory_to(
    path: &Path,
    directory: Option<String>,
    workspace_root: &Path,
) -> Result<GeneratedFilesSettings, String> {
    let workspace_root = validate_directory(workspace_root.to_path_buf())?;
    match directory.map(|value| value.trim().to_string()) {
        Some(value) if !value.is_empty() => {
            let directory = validate_directory(PathBuf::from(value))?;
            save_config(path, &directory)?;
        }
        _ => {
            if path.exists() {
                fs::remove_file(path).map_err(|error| {
                    format!("Could not restore the workspace save location: {error}")
                })?;
            }
        }
    }
    current_settings_from(path, &workspace_root)
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
        let settings =
            current_settings_from(&settings_path, &fixture).expect("settings should load");
        assert!(!settings.uses_workspace_default);
        assert_eq!(PathBuf::from(settings.directory), output);
        assert!(validate_directory(PathBuf::from("relative-output")).is_err());

        fs::remove_dir_all(fixture).expect("fixture should be removed");
    }

    #[test]
    fn missing_config_defaults_to_the_current_workspace() {
        let fixture = std::env::temp_dir().join(format!("coffee-note-output-{}", Uuid::new_v4()));
        let workspace = fixture.join("workspace");
        let settings_path = fixture.join("generated-files.json");
        fs::create_dir_all(&workspace).expect("fixture workspace should exist");

        let settings = current_settings_from(&settings_path, &workspace)
            .expect("workspace default should load");

        assert!(settings.uses_workspace_default);
        assert_eq!(
            PathBuf::from(settings.directory),
            validate_directory(workspace).expect("workspace should validate")
        );
        fs::remove_dir_all(fixture).expect("fixture should be removed");
    }

    #[test]
    fn invalid_workspace_does_not_erase_a_custom_directory() {
        let fixture = std::env::temp_dir().join(format!("coffee-note-output-{}", Uuid::new_v4()));
        let custom = fixture.join("custom");
        let settings_path = fixture.join("generated-files.json");
        fs::create_dir_all(&custom).expect("fixture custom directory should exist");
        save_config(&settings_path, &custom).expect("custom settings should save");

        let result =
            save_generated_files_directory_to(&settings_path, None, Path::new("missing-workspace"));

        assert!(result.is_err());
        assert!(settings_path.is_file());
        let stored = read_config(&settings_path)
            .expect("settings should remain readable")
            .expect("custom settings should remain present");
        assert_eq!(stored.directory, custom);
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
