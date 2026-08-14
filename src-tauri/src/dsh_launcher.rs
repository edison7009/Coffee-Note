//! Windows-only hidden launcher for the DeepSeek Harness Node process.
//!
//! The desktop executable re-enters through a private command-line mode so the
//! parent keeps Tokio's async pipes while this synchronous Win32 boundary owns
//! STARTUPINFO visibility and a kill-on-close process-tree job.

pub const SIDECAR_ARG: &str = "--coffee-note-dsh-sidecar";
pub const NODE_ENV: &str = "COFFEE_NOTE_DSH_NODE";
pub const ENTRY_ENV: &str = "COFFEE_NOTE_DSH_ENTRY";
pub const CONFIG_ENV: &str = "COFFEE_NOTE_DSH_CONFIG";
pub const CWD_ENV: &str = "COFFEE_NOTE_DSH_CWD";

#[cfg(not(windows))]
pub fn run_from_environment() -> Option<Result<i32, String>> {
    None
}

#[cfg(windows)]
pub fn run_from_environment() -> Option<Result<i32, String>> {
    if std::env::args_os().nth(1).as_deref() != Some(std::ffi::OsStr::new(SIDECAR_ARG)) {
        return None;
    }
    Some((|| {
        let node = required_env(NODE_ENV)?;
        let entry = required_env(ENTRY_ENV)?;
        let config = required_env(CONFIG_ENV)?;
        let cwd = required_env(CWD_ENV)?;
        run_hidden_process(&node, &[entry, config], std::path::Path::new(&cwd))
    })())
}

#[cfg(windows)]
fn required_env(name: &str) -> Result<std::ffi::OsString, String> {
    std::env::var_os(name).ok_or_else(|| format!("{name} is missing"))
}

#[cfg(windows)]
fn append_quoted_argument(command_line: &mut Vec<u16>, argument: &std::ffi::OsStr) {
    use std::os::windows::ffi::OsStrExt;

    let encoded = argument.encode_wide().collect::<Vec<_>>();
    let needs_quotes = encoded.is_empty()
        || encoded
            .iter()
            .any(|unit| matches!(*unit, 0x20 | 0x09 | 0x22));
    if !needs_quotes {
        command_line.extend(encoded);
        return;
    }

    command_line.push(0x22);
    let mut backslashes = 0usize;
    for unit in encoded {
        if unit == 0x5c {
            backslashes += 1;
            continue;
        }
        if unit == 0x22 {
            command_line.extend(std::iter::repeat_n(0x5c, backslashes * 2 + 1));
        } else {
            command_line.extend(std::iter::repeat_n(0x5c, backslashes));
        }
        backslashes = 0;
        command_line.push(unit);
    }
    command_line.extend(std::iter::repeat_n(0x5c, backslashes * 2));
    command_line.push(0x22);
}

#[cfg(windows)]
fn windows_command_line(program: &std::ffi::OsStr, arguments: &[std::ffi::OsString]) -> Vec<u16> {
    let mut command_line = Vec::new();
    append_quoted_argument(&mut command_line, program);
    for argument in arguments {
        command_line.push(0x20);
        append_quoted_argument(&mut command_line, argument);
    }
    command_line.push(0);
    command_line
}

#[cfg(windows)]
fn run_hidden_process(
    program: &std::ffi::OsStr,
    arguments: &[std::ffi::OsString],
    cwd: &std::path::Path,
) -> Result<i32, String> {
    use std::mem::{size_of, zeroed};
    use std::os::windows::ffi::OsStrExt;
    use std::ptr::null;
    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE, INVALID_HANDLE_VALUE, WAIT_FAILED};
    use windows_sys::Win32::System::Console::{
        GetStdHandle, STD_ERROR_HANDLE, STD_INPUT_HANDLE, STD_OUTPUT_HANDLE,
    };
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
        SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };
    use windows_sys::Win32::System::Threading::{
        CreateProcessW, GetExitCodeProcess, ResumeThread, TerminateProcess, WaitForSingleObject,
        CREATE_NO_WINDOW, CREATE_SUSPENDED, CREATE_UNICODE_ENVIRONMENT, INFINITE,
        PROCESS_INFORMATION, STARTF_USESHOWWINDOW, STARTF_USESTDHANDLES, STARTUPINFOW,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::SW_HIDE;

    let application = program.encode_wide().chain(Some(0)).collect::<Vec<_>>();
    let mut command_line = windows_command_line(program, arguments);
    let current_directory = cwd
        .as_os_str()
        .encode_wide()
        .chain(Some(0))
        .collect::<Vec<_>>();

    let stdin = unsafe { GetStdHandle(STD_INPUT_HANDLE) };
    let stdout = unsafe { GetStdHandle(STD_OUTPUT_HANDLE) };
    let stderr = unsafe { GetStdHandle(STD_ERROR_HANDLE) };
    if [stdin, stdout, stderr]
        .into_iter()
        .any(|handle| handle.is_null() || handle == INVALID_HANDLE_VALUE)
    {
        return Err("DSH launcher inherited invalid standard handles".to_string());
    }

    let job = unsafe { CreateJobObjectW(null(), null()) };
    if job.is_null() {
        return Err(format!(
            "Could not create DSH process job: {}",
            std::io::Error::last_os_error()
        ));
    }
    let mut limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
    limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
    if unsafe {
        SetInformationJobObject(
            job,
            JobObjectExtendedLimitInformation,
            &limits as *const _ as *const _,
            size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        )
    } == 0
    {
        let error = std::io::Error::last_os_error();
        unsafe { CloseHandle(job) };
        return Err(format!("Could not configure DSH process job: {error}"));
    }

    let mut startup: STARTUPINFOW = unsafe { zeroed() };
    startup.cb = size_of::<STARTUPINFOW>() as u32;
    startup.dwFlags = STARTF_USESTDHANDLES | STARTF_USESHOWWINDOW;
    startup.wShowWindow = SW_HIDE as u16;
    startup.hStdInput = stdin;
    startup.hStdOutput = stdout;
    startup.hStdError = stderr;
    let mut process: PROCESS_INFORMATION = unsafe { zeroed() };
    let created = unsafe {
        CreateProcessW(
            application.as_ptr(),
            command_line.as_mut_ptr(),
            null(),
            null(),
            1,
            CREATE_NO_WINDOW | CREATE_SUSPENDED | CREATE_UNICODE_ENVIRONMENT,
            null(),
            current_directory.as_ptr(),
            &startup,
            &mut process,
        )
    };
    if created == 0 {
        let error = std::io::Error::last_os_error();
        unsafe { CloseHandle(job) };
        return Err(format!("Could not start hidden DSH process: {error}"));
    }

    let fail_after_spawn =
        |message: &str, process_handle: HANDLE, thread_handle: HANDLE, job_handle: HANDLE| {
            let error = std::io::Error::last_os_error();
            unsafe {
                TerminateProcess(process_handle, 1);
                CloseHandle(thread_handle);
                CloseHandle(process_handle);
                CloseHandle(job_handle);
            }
            Err(format!("{message}: {error}"))
        };
    if unsafe { AssignProcessToJobObject(job, process.hProcess) } == 0 {
        return fail_after_spawn(
            "Could not assign DSH to its process job",
            process.hProcess,
            process.hThread,
            job,
        );
    }
    if unsafe { ResumeThread(process.hThread) } == u32::MAX {
        return fail_after_spawn(
            "Could not resume hidden DSH process",
            process.hProcess,
            process.hThread,
            job,
        );
    }
    unsafe { CloseHandle(process.hThread) };

    let waited = unsafe { WaitForSingleObject(process.hProcess, INFINITE) };
    if waited == WAIT_FAILED {
        let error = std::io::Error::last_os_error();
        unsafe {
            TerminateProcess(process.hProcess, 1);
            CloseHandle(process.hProcess);
            CloseHandle(job);
        }
        return Err(format!("Could not wait for DSH process: {error}"));
    }
    let mut exit_code = 1u32;
    if unsafe { GetExitCodeProcess(process.hProcess, &mut exit_code) } == 0 {
        let error = std::io::Error::last_os_error();
        unsafe {
            CloseHandle(process.hProcess);
            CloseHandle(job);
        }
        return Err(format!("Could not read DSH exit code: {error}"));
    }
    unsafe {
        CloseHandle(process.hProcess);
        CloseHandle(job);
    }
    Ok(exit_code as i32)
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    #[test]
    fn hidden_launcher_child_has_no_console_window() {
        let output =
            std::env::temp_dir().join(format!("coffee-note-console-{}.txt", uuid::Uuid::new_v4()));
        let escaped = output.to_string_lossy().replace('\'', "''");
        let script = format!(
            "Add-Type -Namespace CoffeeNote -Name ConsoleProbe -MemberDefinition '[System.Runtime.InteropServices.DllImport(\"kernel32.dll\")] public static extern System.IntPtr GetConsoleWindow();'; [IO.File]::WriteAllText('{escaped}', [CoffeeNote.ConsoleProbe]::GetConsoleWindow().ToInt64().ToString())"
        );
        let powershell = std::path::PathBuf::from(std::env::var_os("SystemRoot").unwrap())
            .join("System32/WindowsPowerShell/v1.0/powershell.exe");
        let arguments = [
            "-NoLogo".into(),
            "-NoProfile".into(),
            "-NonInteractive".into(),
            "-Command".into(),
            script.into(),
        ];
        let cwd = std::env::current_dir().unwrap();
        let code = run_hidden_process(powershell.as_os_str(), &arguments, &cwd).unwrap();
        assert_eq!(code, 0);
        assert_eq!(std::fs::read_to_string(&output).unwrap(), "0");
        let _ = std::fs::remove_file(output);
    }
}
