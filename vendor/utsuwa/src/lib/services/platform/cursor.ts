import { isTauri } from './platform';

export interface ScreenPoint {
	x: number;
	y: number;
}

/**
 * Global cursor in physical screen pixels. Overlay click-through means the
 * webview never sees mousemove over the desktop, so this must be native.
 */
export async function getScreenCursor(): Promise<ScreenPoint | null> {
	if (!isTauri()) return null;

	try {
		const { invoke } = await import('@tauri-apps/api/core');
		return await invoke<ScreenPoint>('cursor_screen_pos');
	} catch {
		try {
			const { cursorPosition } = await import('@tauri-apps/api/window');
			const pos = await cursorPosition();
			return { x: pos.x, y: pos.y };
		} catch {
			return null;
		}
	}
}
