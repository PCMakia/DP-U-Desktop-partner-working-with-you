use tauri::{Emitter, Manager};
use serde::Serialize;
use std::sync::OnceLock;
use std::sync::atomic::{AtomicU64, Ordering};

static APP_HANDLE: OnceLock<tauri::AppHandle> = OnceLock::new();
static LAST_CHROME_TOGGLE_MS: AtomicU64 = AtomicU64::new(0);

fn emit_overlay_chrome_toggle() {
	let now = std::time::SystemTime::now()
		.duration_since(std::time::UNIX_EPOCH)
		.map(|d| d.as_millis() as u64)
		.unwrap_or(0);
	let prev = LAST_CHROME_TOGGLE_MS.load(Ordering::Relaxed);
	if now.saturating_sub(prev) < 400 {
		return;
	}
	LAST_CHROME_TOGGLE_MS.store(now, Ordering::Relaxed);
	if let Some(app) = APP_HANDLE.get() {
		let _ = app.emit("overlay-chrome-toggle", ());
	}
}

/// Windows will not RegisterHotKey(VK_RSHIFT). A low-level hook on its own
/// thread pumps messages while the overlay is unfocused, and immediately
/// forwards every key except Ctrl+Alt+Right Shift so OBS and other apps keep
/// their own shortcuts.
#[cfg(windows)]
fn install_chrome_hotkey() {
	use std::ptr::null_mut;

	const WH_KEYBOARD_LL: i32 = 13;
	const HC_ACTION: i32 = 0;
	const WM_KEYDOWN: u32 = 0x0100;
	const WM_SYSKEYDOWN: u32 = 0x0104;
	const VK_RSHIFT: u32 = 0xA1;
	const VK_CONTROL: i32 = 0x11;
	const VK_MENU: i32 = 0x12;

	#[repr(C)]
	struct KbdLlHook {
		vk: u32,
		scan: u32,
		flags: u32,
		time: u32,
		extra: usize,
	}

	#[repr(C)]
	struct Msg {
		hwnd: isize,
		message: u32,
		wparam: usize,
		lparam: isize,
		time: u32,
		pt_x: i32,
		pt_y: i32,
	}

	unsafe extern "system" fn hook_proc(code: i32, wparam: usize, lparam: isize) -> isize {
		extern "system" {
			fn CallNextHookEx(hhk: isize, code: i32, wparam: usize, lparam: isize) -> isize;
			fn GetAsyncKeyState(vkey: i32) -> i16;
		}
		if code == HC_ACTION {
			let msg = wparam as u32;
			if msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN {
				let info = unsafe { &*(lparam as *const KbdLlHook) };
				if info.vk == VK_RSHIFT {
					let ctrl = unsafe { GetAsyncKeyState(VK_CONTROL) } as u16 & 0x8000 != 0;
					let alt = unsafe { GetAsyncKeyState(VK_MENU) } as u16 & 0x8000 != 0;
					if ctrl && alt {
						emit_overlay_chrome_toggle();
						return 1;
					}
				}
			}
		}
		unsafe { CallNextHookEx(0, code, wparam, lparam) }
	}

	let _ = std::thread::Builder::new()
		.name("alice-yue-chrome-hotkey".into())
		.spawn(|| unsafe {
			extern "system" {
				fn GetModuleHandleW(name: *const u16) -> *mut core::ffi::c_void;
				fn SetWindowsHookExW(
					id: i32,
					fn_: unsafe extern "system" fn(i32, usize, isize) -> isize,
					mod_: *mut core::ffi::c_void,
					thread: u32,
				) -> isize;
				fn GetMessageW(msg: *mut Msg, hwnd: isize, min: u32, max: u32) -> i32;
			}

			let instance = GetModuleHandleW(null_mut());
			let hook = SetWindowsHookExW(WH_KEYBOARD_LL, hook_proc, instance, 0);
			if hook == 0 {
				eprintln!("Failed to install overlay chrome global hotkey");
				return;
			}
			let mut msg = Msg {
				hwnd: 0,
				message: 0,
				wparam: 0,
				lparam: 0,
				time: 0,
				pt_x: 0,
				pt_y: 0,
			};
			while GetMessageW(&mut msg, 0, 0, 0) > 0 {}
		});
}

#[derive(Serialize)]
struct ScreenPos {
    x: i32,
    y: i32,
}

#[tauri::command]
fn cursor_screen_pos() -> Result<ScreenPos, String> {
    #[cfg(windows)]
    unsafe {
        #[repr(C)]
        struct POINT {
            x: i32,
            y: i32,
        }
        extern "system" {
            fn GetCursorPos(lp_point: *mut POINT) -> i32;
        }
        let mut point = POINT { x: 0, y: 0 };
        if GetCursorPos(&mut point) == 0 {
            return Err("GetCursorPos failed".into());
        }
        return Ok(ScreenPos {
            x: point.x,
            y: point.y,
        });
    }

    #[cfg(not(windows))]
    Err("cursor_screen_pos is implemented on Windows; use the JS cursor API elsewhere".into())
}

#[tauri::command]
fn alice_yue_brain_status() -> Result<bool, String> {
    match std::net::TcpStream::connect_timeout(
        &"127.0.0.1:8081"
            .parse()
            .map_err(|e: std::net::AddrParseError| e.to_string())?,
        std::time::Duration::from_millis(400),
    ) {
        Ok(_) => Ok(true),
        Err(_) => Ok(false),
    }
}

#[tauri::command]
fn alice_yue_brain(action: String, discord: Option<bool>) -> Result<String, String> {
    let root = std::env::var("DPU_ROOT").map_err(|_| {
        "DPU_ROOT is not set. Start Utsuwa with scripts/07-utsuwa-ui.ps1".to_string()
    })?;
    let script = match action.as_str() {
        "park" => "11-park-brain.ps1",
        "wake" => "12-wake-brain.ps1",
        _ => return Err("action must be wake or park".into()),
    };
    let script_path = format!("{}\\scripts\\{}", root, script);
    let mut cmd = std::process::Command::new("powershell.exe");
    cmd.args([
        "-ExecutionPolicy",
        "Bypass",
        "-NoProfile",
        "-File",
        &script_path,
    ]);
    if action == "wake" && discord.unwrap_or(false) {
        cmd.arg("-Discord");
    }
    cmd.spawn().map_err(|e| e.to_string())?;
    Ok(action)
}

fn stop_dpu_stack() {
    let root = match std::env::var("DPU_ROOT") {
        Ok(v) => v,
        Err(_) => return,
    };
    let script_path = format!("{}\\scripts\\14-stop-companion.ps1", root);
    let mut cmd = std::process::Command::new("powershell.exe");
    cmd.args([
        "-ExecutionPolicy",
        "Bypass",
        "-NoProfile",
        "-WindowStyle",
        "Hidden",
        "-File",
        &script_path,
    ]);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let _ = cmd.spawn();
}

#[tauri::command]
fn show_overlay(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("overlay") {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn toggle_overlay(app: tauri::AppHandle) -> Result<bool, String> {
    if let Some(window) = app.get_webview_window("overlay") {
        let visible = window.is_visible().map_err(|e| e.to_string())?;
        if visible {
            window.hide().map_err(|e| e.to_string())?;
            Ok(false)
        } else {
            window.show().map_err(|e| e.to_string())?;
            window.set_focus().map_err(|e| e.to_string())?;
            Ok(true)
        }
    } else {
        Err("Overlay window not found".to_string())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init());

    // Updates ship as signed installers, so the updater is desktop-only.
    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init());

    builder
        .invoke_handler(tauri::generate_handler![
            show_overlay,
            toggle_overlay,
            cursor_screen_pos,
            alice_yue_brain,
            alice_yue_brain_status
        ])
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                if let Some(overlay) = window.app_handle().get_webview_window("overlay") {
                    let _ = overlay.close();
                }
                stop_dpu_stack();
            }
        })
        .setup(|app| {
            let _ = APP_HANDLE.set(app.handle().clone());
            #[cfg(windows)]
            install_chrome_hotkey();
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
