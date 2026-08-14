#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if let Some(result) = coffee_note_lib::dsh_launcher::run_from_environment() {
        let code = match result {
            Ok(code) => code,
            Err(error) => {
                eprintln!("Coffee Note DSH launcher failed: {error}");
                1
            }
        };
        std::process::exit(code);
    }
    coffee_note_lib::run();
}
