#[cfg(windows)]
#[test]
fn gui_launcher_preserves_bidirectional_dsh_pipes() {
    use std::io::Write;
    use std::process::{Command, Stdio};

    let manifest = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let project = manifest.parent().unwrap();
    let node = project.join("dsh-runtime/node_modules/node/bin/node.exe");
    assert!(node.is_file(), "run npm run dsh:install before this test");

    let probe =
        std::env::temp_dir().join(format!("coffee-note-dsh-pipe-{}.mjs", uuid::Uuid::new_v4()));
    std::fs::write(
        &probe,
        "process.stdin.setEncoding('utf8'); let input = ''; process.stdin.on('data', chunk => { input += chunk }); process.stdin.on('end', () => { process.stdout.write(`reply:${input}`) });\n",
    )
    .unwrap();

    let binary = env!("CARGO_BIN_EXE_coffee-note");
    let mut child = Command::new(binary)
        .arg(coffee_note_lib::dsh_launcher::SIDECAR_ARG)
        .env(coffee_note_lib::dsh_launcher::NODE_ENV, &node)
        .env(coffee_note_lib::dsh_launcher::ENTRY_ENV, &probe)
        .env(coffee_note_lib::dsh_launcher::CONFIG_ENV, "ignored")
        .env(coffee_note_lib::dsh_launcher::CWD_ENV, project)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    child.stdin.take().unwrap().write_all(b"ping\n").unwrap();
    let output = child.wait_with_output().unwrap();

    let _ = std::fs::remove_file(probe);
    assert!(
        output.status.success(),
        "launcher stderr: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert_eq!(String::from_utf8_lossy(&output.stdout), "reply:ping\n");
}
