import { browser } from '$app/environment';
import {
	parseWorkshopSettings,
	lookTargetForBeat,
	nextPresenceDelayMs,
	type PresenceBeat,
	type Vec3,
	type WorkshopLookAt,
	type WorkshopPoseId,
	type BodyYawMark
} from './workshop-logic';

const STORAGE_KEY = 'utsuwa-workshop';

function createWorkshopStore() {
	const saved = browser ? parseWorkshopSettings(localStorage.getItem(STORAGE_KEY)) : parseWorkshopSettings(null);

	let enabled = $state(saved.enabled);
	let lookAt = $state<WorkshopLookAt>(saved.lookAt);
	let companionAttached = $state(false);
	let beat = $state<PresenceBeat>('work');
	let poseId = $state<WorkshopPoseId>('sit');
	let lookWorld = $state<Vec3>({ ...lookTargetForBeat('work') });
	let yawMark = $state<BodyYawMark>(0);
	let bodyYaw = $state(0);
	let headYaw = $state(0);
	let headPitch = $state(0);
	let blinkNonce = $state(0);
	let lastHiddenAt: number | null = null;

	function save() {
		if (!browser) return;
		localStorage.setItem(STORAGE_KEY, JSON.stringify({ enabled, lookAt }));
	}

	function setEnabled(value: boolean) {
		enabled = value;
		save();
	}

	function setLookAt(mode: WorkshopLookAt) {
		lookAt = mode;
		save();
	}

	function attachCompanion() {
		companionAttached = true;
	}

	function detachCompanion() {
		companionAttached = false;
	}

	function setBeat(next: PresenceBeat) {
		beat = next;
	}

	function setPoseId(next: WorkshopPoseId) {
		poseId = next;
	}

	function setLookWorld(next: Vec3) {
		lookWorld = next;
	}

	function setYawMark(next: BodyYawMark) {
		yawMark = next;
	}

	function setBodyYaw(next: number) {
		bodyYaw = next;
	}

	function setHeadYaw(next: number) {
		headYaw = next;
	}

	function setHeadPitch(next: number) {
		headPitch = next;
	}

	function nudgeBlink() {
		blinkNonce += 1;
	}

	function markHidden(at = Date.now()) {
		lastHiddenAt = at;
	}

	function takeHiddenAt(): number | null {
		const at = lastHiddenAt;
		lastHiddenAt = null;
		return at;
	}

	return {
		get enabled() {
			return enabled;
		},
		get lookAt() {
			return lookAt;
		},
		get onOverlay() {
			return companionAttached;
		},
		get active() {
			return enabled && companionAttached;
		},
		get beat() {
			return beat;
		},
		get poseId() {
			return poseId;
		},
		get lookWorld() {
			return lookWorld;
		},
		get yawMark() {
			return yawMark;
		},
		get bodyYaw() {
			return bodyYaw;
		},
		get headYaw() {
			return headYaw;
		},
		get headPitch() {
			return headPitch;
		},
		get blinkNonce() {
			return blinkNonce;
		},
		setEnabled,
		setLookAt,
		attachCompanion,
		detachCompanion,
		attachOverlay: attachCompanion,
		detachOverlay: detachCompanion,
		setBeat,
		setPoseId,
		setLookWorld,
		setYawMark,
		setBodyYaw,
		setHeadYaw,
		setHeadPitch,
		nudgeBlink,
		markHidden,
		takeHiddenAt,
		nextPresenceDelayMs
	};
}

export const workshopStore = createWorkshopStore();
