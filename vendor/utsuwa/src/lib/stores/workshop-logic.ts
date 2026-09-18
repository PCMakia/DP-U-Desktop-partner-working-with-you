export const WORKSHOP_AWAY_MS = 12 * 60 * 1000;
export const WORKSHOP_IDLE_URLS = ['/animations/idle.vrma'];
export const WORKSHOP_SIT_URL = '/animations/sit.vrma';

export type WorkshopLookAt = 'editor' | 'cursor';
export type PresenceBeat = 'work' | 'hands' | 'camera';

export interface Vec3 {
	x: number;
	y: number;
	z: number;
}

export interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

/** Off-camera workbench / Hajime's hands on the forge, at seated eyeline. */
export const WORK_LOOK: Vec3 = { x: -1.55, y: 1.36, z: 0.72 };
/** Rare glance toward her own lap. */
export const HANDS_LOOK: Vec3 = { x: 0.08, y: 0.72, z: 0.28 };
/** Short look toward the overlay camera (return beat). */
export const CAMERA_LOOK: Vec3 = { x: 0.42, y: 1.38, z: 1.55 };
/** Cursor past her body — look toward the right of the overlay. */
export const RIGHT_LOOK: Vec3 = { x: 1.48, y: 1.36, z: 0.82 };

export type BodyYawMark = 0 | 40;

export const BODY_YAW_RAD: Record<BodyYawMark, number> = {
	0: 0,
	40: (40 * Math.PI) / 180
};

/** Extra torso yaw: 0° at the forge, at most 40° toward the cursor. */
export const BODY_YAW_MIN = 0;
export const BODY_YAW_MAX = BODY_YAW_RAD[40];
/** Natural neck yaw from facing-forward to one side (~30°). */
export const NECK_YAW_LIMIT = (30 * Math.PI) / 180;
/** Cursor X vs scene/bone yaw. */
export const CURSOR_YAW_SIGN = 1;
/** Cursor Y vs neck/head pitch. */
export const CURSOR_PITCH_SIGN = -1;

export const WORKSHOP_CAMERA_DEFAULTS = { fov: 32, zoom: 1.18, height: 0.06 };

export interface WorkshopSettings {
	enabled: boolean;
	lookAt: WorkshopLookAt;
}

export function parseWorkshopSettings(raw: unknown): WorkshopSettings {
	let parsed: Record<string, unknown> | null = null;
	if (typeof raw === 'string') {
		try {
			const value = JSON.parse(raw);
			parsed = value && typeof value === 'object' && !Array.isArray(value) ? value : null;
		} catch {
			parsed = null;
		}
	} else if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
		parsed = raw as Record<string, unknown>;
	}

	return {
		enabled: parsed?.enabled !== false,
		lookAt: parsed?.lookAt === 'cursor' ? 'cursor' : 'editor'
	};
}

export function pointInRect(x: number, y: number, rect: Rect): boolean {
	return x >= rect.x && y >= rect.y && x < rect.x + rect.w && y < rect.y + rect.h;
}

/**
 * Interactive overlay regions. Clicks elsewhere pass through the window.
 * Coordinates are logical CSS pixels from the overlay origin.
 */
export function overlayHitRegions(opts: {
	winW: number;
	winH: number;
	chromeVisible: boolean;
	chatExpanded: boolean;
	cameraOpen: boolean;
	resizing: boolean;
	chromeHidden?: boolean;
	moving?: boolean;
}): Rect[] {
	if (opts.chromeHidden) return [];
	if (
		opts.chromeVisible ||
		opts.chatExpanded ||
		opts.cameraOpen ||
		opts.resizing ||
		opts.moving
	) {
		return [{ x: 0, y: 0, w: opts.winW, h: opts.winH }];
	}

	const railW = 56;
	const railH = 260;
	const pad = 6;
	const resize = 72;
	return [
		{ x: Math.max(0, opts.winW - railW - pad), y: pad, w: railW, h: railH },
		{ x: pad, y: pad, w: resize, h: resize }
	];
}

/** Ctrl + Alt + Right Shift — hide/show overlay chrome. */
export function isChromeToggleHotkey(e: {
	ctrlKey: boolean;
	metaKey: boolean;
	altKey: boolean;
	code: string;
	repeat?: boolean;
}): boolean {
	if (e.repeat) return false;
	const ctrl = e.ctrlKey || e.metaKey;
	return ctrl && e.altKey && e.code === 'ShiftRight';
}

export function shouldIgnoreCursor(overHit: boolean): boolean {
	return !overHit;
}

export function shouldPlayReturnBeat(
	hiddenAt: number | null,
	now: number,
	thresholdMs = WORKSHOP_AWAY_MS
): boolean {
	if (hiddenAt === null) return false;
	return now - hiddenAt >= thresholdMs;
}

export function nextPresenceDelayMs(random = Math.random): number {
	return (8 + random() * 10) * 60 * 1000;
}

export function workshopBlinkInterval(random = Math.random): number {
	return 4.5 + random() * 4.5;
}

export function smoothVec(current: Vec3, target: Vec3, dt: number, speed = 4.2): Vec3 {
	const t = 1 - Math.exp(-speed * Math.max(0, dt));
	return {
		x: current.x + (target.x - current.x) * t,
		y: current.y + (target.y - current.y) * t,
		z: current.z + (target.z - current.z) * t
	};
}

export function lookTargetForBeat(beat: PresenceBeat): Vec3 {
	if (beat === 'hands') return HANDS_LOOK;
	if (beat === 'camera') return CAMERA_LOOK;
	return WORK_LOOK;
}

export function cursorNx(localX: number, winW: number): number {
	return winW > 0 ? (localX / winW) * 2 - 1 : 0;
}

/**
 * Map overlay-local cursor to a look point. Horizontal spans forge-left through
 * her body to the right of the overlay so yaw is not stuck on the work stop.
 */
export function cursorToLookTarget(localX: number, localY: number, winW: number, winH: number): Vec3 {
	const nx = cursorNx(localX, winW);
	const ny = winH > 0 ? (localY / winH) * 2 - 1 : 0;
	const raw = Math.max(0, Math.min(1, (nx + 0.95) / 1.9));
	const t = raw * raw * (3 - 2 * raw);
	const pitch = Math.max(-0.42, Math.min(0.34, -ny * 0.28));
	return {
		x: WORK_LOOK.x + (RIGHT_LOOK.x - WORK_LOOK.x) * t,
		y: WORK_LOOK.y + pitch,
		z: WORK_LOOK.z + (RIGHT_LOOK.z - WORK_LOOK.z) * t
	};
}

export function yawMarkFromNx(nx: number, current: BodyYawMark): BodyYawMark {
	return nextYawMark(desiredYawFromNx(nx), current);
}

/** Cursor left = forge (0°), right = body cap + neck. */
export function desiredYawFromNx(nx: number): number {
	const t = Math.max(0, Math.min(1, (nx + 1) / 2));
	const s = t * t * (3 - 2 * t);
	return s * (BODY_YAW_MAX + NECK_YAW_LIMIT);
}

/**
 * Head takes ±30° first. Body only eases 0° → 40° after the neck is past that.
 */
export function nextYawMark(desired: number, current: BodyYawMark): BodyYawMark {
	const body = BODY_YAW_RAD[current];
	const rel = desired - body;
	const commit = NECK_YAW_LIMIT + 0.06;
	if (current === 0 && rel > commit) return 40;
	if (current === 40 && rel < -commit) return 0;
	return current;
}

export function headYawFromDesired(desired: number, bodyYaw: number): number {
	return Math.max(-NECK_YAW_LIMIT, Math.min(NECK_YAW_LIMIT, desired - bodyYaw));
}

/** Screen Y is down-positive. Returned pitch is look-up-positive (cursor up → look up). */
export function headPitchFromNy(ny: number): number {
	return Math.max(-0.28, Math.min(0.22, -ny * 0.22));
}

export function bodyYawForMark(mark: BodyYawMark): number {
	return BODY_YAW_RAD[mark];
}

export function clampBodyYaw(yaw: number): number {
	return Math.max(BODY_YAW_MIN, Math.min(BODY_YAW_MAX, yaw));
}

export function smoothAngle(current: number, target: number, dt: number, speed = 1.05): number {
	const t = 1 - Math.exp(-speed * Math.max(0, dt));
	return current + (target - current) * t;
}

/** Slower on X/Z so a horizontal glance eases instead of snapping. */
export function smoothLookVec(current: Vec3, target: Vec3, dt: number): Vec3 {
	return {
		x: smoothAngle(current.x, target.x, dt, 1.05),
		y: smoothAngle(current.y, target.y, dt, 1.9),
		z: smoothAngle(current.z, target.z, dt, 1.05)
	};
}

export function beatDurationMs(beat: PresenceBeat): number {
	if (beat === 'hands') return 2200;
	if (beat === 'camera') return 1400;
	return 0;
}
