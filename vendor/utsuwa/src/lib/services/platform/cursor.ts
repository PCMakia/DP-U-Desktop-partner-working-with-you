import { isTauri } from './platform';

export interface ScreenPoint {
	x: number;
	y: number;
}

/** Sleep/resume can leave Tauri IPC hanging; fail the tick instead of stalling. */
const CURSOR_INVOKE_MS = 280;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error('cursor invoke timed out')), ms);
		promise.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			(err) => {
				clearTimeout(timer);
				reject(err);
			}
		);
	});
}

/**
 * Global cursor in physical screen pixels. Overlay click-through means the
 * webview never sees mousemove over the desktop, so this must be native.
 */
export async function getScreenCursor(): Promise<ScreenPoint | null> {
	if (!isTauri()) return null;

	try {
		const { invoke } = await import('@tauri-apps/api/core');
		return await withTimeout(invoke<ScreenPoint>('cursor_screen_pos'), CURSOR_INVOKE_MS);
	} catch {
		try {
			const { cursorPosition } = await import('@tauri-apps/api/window');
			const pos = await withTimeout(cursorPosition(), CURSOR_INVOKE_MS);
			return { x: pos.x, y: pos.y };
		} catch {
			return null;
		}
	}
}
