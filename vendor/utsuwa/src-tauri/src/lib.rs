use tauri::{Emitter, Manager};
use serde::Serialize;
use std::sync::OnceLock;
use std::sync::atomic::{AtomicIsize, AtomicU32, AtomicU64, Ordering};

static APP_HANDLE: OnceLock<tauri::AppHandle> = OnceLock::new();
static LAST_CHROME_TOGGLE_MS: AtomicU64 = AtomicU64::new(0);
static CHROME_HOOK: AtomicIsize = AtomicIsize::new(0);
static CHROME_HOOK_THREAD: AtomicU32 = AtomicU32::new(0);

const WM_REINSTALL_CHROME_HOOK: u32 = 0x8000 + 41;

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
/// their own shortcuts. Sleep/lock silently drops that hook; the thread
/// reinstalls it on power-resume and when JS asks.
#[cfg(windows)]
fn attach_chrome_hook() {
	use std::ptr::null_mut;

	const WH_KEYBOARD_LL: i32 = 13;

	extern "system" {
		fn GetModuleHandleW(name: *const u16) -> *mut core::ffi::c_void;
		fn SetWindowsHookExW(
			id: i32,
			fn_: unsafe extern "system" fn(i32, usize, isize) -> isize,
			mod_: *mut core::ffi::c_void,
			thread: u32,
		) -> isize;
		fn UnhookWindowsHookEx(hhk: isize) -> i32;
	}

	unsafe {
		let old = CHROME_HOOK.swap(0, Ordering::SeqCst);
		if old != 0 {
			let _ = UnhookWindowsHookEx(old);
		}
		let instance = GetModuleHandleW(null_mut());
		let hook = SetWindowsHookExW(WH_KEYBOARD_LL, chrome_hook_proc, instance, 0);
		if hook == 0 {
			eprintln!("Failed to install overlay chrome global hotkey");
			return;
		}
		CHROME_HOOK.store(hook, Ordering::SeqCst);
	}
}

#[cfg(windows)]
unsafe extern "system" fn chrome_hook_proc(code: i32, wparam: usize, lparam: isize) -> isize {
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

#[cfg(windows)]
fn request_chrome_hotkey_reinstall() {
	extern "system" {
		fn PostThreadMessageW(thread: u32, msg: u32, wparam: usize, lparam: isize) -> i32;
	}
	let tid = CHROME_HOOK_THREAD.load(Ordering::SeqCst);
	if tid != 0 {
		unsafe {
			let _ = PostThreadMessageW(tid, WM_REINSTALL_CHROME_HOOK, 0, 0);
		}
	}
}

#[cfg(windows)]
fn install_chrome_hotkey() {
	if CHROME_HOOK_THREAD.load(Ordering::SeqCst) != 0 {
		request_chrome_hotkey_reinstall();
		return;
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

	let _ = std::thread::Builder::new()
		.name("alice-yue-chrome-hotkey".into())
		.spawn(|| unsafe {
			extern "system" {
				fn GetCurrentThreadId() -> u32;
				fn GetMessageW(msg: *mut Msg, hwnd: isize, min: u32, max: u32) -> i32;
				fn TranslateMessage(msg: *const Msg) -> i32;
				fn DispatchMessageW(msg: *const Msg) -> isize;
				fn RegisterClassW(cls: *const WndClass) -> u16;
				fn CreateWindowExW(
					ex: u32,
					class: *const u16,
					name: *const u16,
					style: u32,
					x: i32,
					y: i32,
					w: i32,
					h: i32,
					parent: isize,
					menu: isize,
					instance: *mut core::ffi::c_void,
					param: *mut core::ffi::c_void,
				) -> isize;
				fn DefWindowProcW(hwnd: isize, msg: u32, wparam: usize, lparam: isize) -> isize;
				fn GetModuleHandleW(name: *const u16) -> *mut core::ffi::c_void;
			}

			#[repr(C)]
			struct WndClass {
				style: u32,
				wnd_proc: unsafe extern "system" fn(isize, u32, usize, isize) -> isize,
				cls_extra: i32,
				wnd_extra: i32,
				instance: *mut core::ffi::c_void,
				icon: isize,
				cursor: isize,
				background: isize,
				menu_name: *const u16,
				class_name: *const u16,
			}

			const HWND_MESSAGE: isize = -3;
			const WM_POWERBROADCAST: u32 = 0x0218;
			const PBT_APMRESUMECRITICAL: usize = 6;
			const PBT_APMRESUMESUSPEND: usize = 7;
			const PBT_APMRESUMEAUTOMATIC: usize = 18;

			unsafe extern "system" fn wnd_proc(
				hwnd: isize,
				msg: u32,
				wparam: usize,
				lparam: isize,
			) -> isize {
				extern "system" {
					fn DefWindowProcW(hwnd: isize, msg: u32, wparam: usize, lparam: isize) -> isize;
				}
				if msg == WM_POWERBROADCAST
					&& (wparam == PBT_APMRESUMEAUTOMATIC
						|| wparam == PBT_APMRESUMESUSPEND
						|| wparam == PBT_APMRESUMECRITICAL)
				{
					attach_chrome_hook();
					if let Some(app) = APP_HANDLE.get() {
						let _ = app.emit("overlay-restore-desktop", ());
					}
					return 0;
				}
				unsafe { DefWindowProcW(hwnd, msg, wparam, lparam) }
			}

			let class_name: Vec<u16> = "AliceYueChromeHotkey\0".encode_utf16().collect();
			let instance = GetModuleHandleW(std::ptr::null_mut());
			let class = WndClass {
				style: 0,
				wnd_proc,
				cls_extra: 0,
				wnd_extra: 0,
				instance,
				icon: 0,
				cursor: 0,
				background: 0,
				menu_name: std::ptr::null(),
				class_name: class_name.as_ptr(),
			};
			let _ = RegisterClassW(&class);
			let _ = CreateWindowExW(
				0,
				class_name.as_ptr(),
				std::ptr::null(),
				0,
				0,
				0,
				0,
				0,
				HWND_MESSAGE,
				0,
				instance,
				std::ptr::null_mut(),
			);

			CHROME_HOOK_THREAD.store(GetCurrentThreadId(), Ordering::SeqCst);
			attach_chrome_hook();

			let mut msg = Msg {
				hwnd: 0,
				message: 0,
				wparam: 0,
				lparam: 0,
				time: 0,
				pt_x: 0,
				pt_y: 0,
			};
			while GetMessageW(&mut msg, 0, 0, 0) > 0 {
				if msg.message == WM_REINSTALL_CHROME_HOOK {
					attach_chrome_hook();
					continue;
				}
				TranslateMessage(&msg);
				DispatchMessageW(&msg);
			}
		});
}

#[cfg(windows)]
fn pin_overlay_topmost(window: &tauri::WebviewWindow) {
	extern "system" {
		fn SetWindowPos(
			hwnd: isize,
			insert_after: isize,
			x: i32,
			y: i32,
			cx: i32,
			cy: i32,
			flags: u32,
		) -> i32;
	}
	const HWND_TOPMOST: isize = -1;
	const SWP_NOSIZE: u32 = 0x0001;
	const SWP_NOMOVE: u32 = 0x0002;
	const SWP_NOACTIVATE: u32 = 0x0010;
	// Re-assert TOPMOST only. Toggling always-on-top off/on recreates the
	// WebView2 swapchain and the VRM snaps to bind pose.
	if let Ok(hwnd) = window.hwnd() {
		unsafe {
			let _ = SetWindowPos(
				hwnd.0 as isize,
				HWND_TOPMOST,
				0,
				0,
				0,
				0,
				SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE,
			);
		}
	}
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
    let root = std::env::var("ALICE_YUE_ROOT").map_err(|_| {
        "ALICE_YUE_ROOT is not set. Start Utsuwa with scripts/07-utsuwa-ui.ps1".to_string()
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

fn stop_yue_stack() {
    let root = match std::env::var("ALICE_YUE_ROOT") {
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
        #[cfg(windows)]
        pin_overlay_topmost(&window);
        #[cfg(not(windows))]
        {
            let _ = window.set_always_on_top(true);
        }
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
            #[cfg(windows)]
            pin_overlay_topmost(&window);
            #[cfg(not(windows))]
            {
                let _ = window.set_always_on_top(true);
            }
            window.set_focus().map_err(|e| e.to_string())?;
            Ok(true)
        }
    } else {
        Err("Overlay window not found".to_string())
    }
}

#[tauri::command]
fn restore_overlay_desktop(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("overlay") {
        #[cfg(windows)]
        pin_overlay_topmost(&window);
        #[cfg(not(windows))]
        {
            let _ = window.set_always_on_top(true);
        }
    }
    #[cfg(windows)]
    request_chrome_hotkey_reinstall();
    Ok(())
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
            restore_overlay_desktop,
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
                stop_yue_stack();
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
