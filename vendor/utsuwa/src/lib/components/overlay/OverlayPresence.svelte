<script lang="ts">
	import { onMount } from 'svelte';
	import { isTauri, getScreenCursor } from '$lib/services/platform';
	import { workshopStore } from '$lib/stores/workshop.svelte';
	import {
		WORKSHOP_AWAY_MS,
		lookTargetForBeat,
		nextPresenceDelayMs,
		beatDurationMs,
		cursorToLookTarget,
		cursorNx,
		desiredYawFromNx,
		yawUpdateForPose,
		poseLocksBody,
		headPitchFromNy,
		clampBodyYaw,
		smoothLookVec,
		smoothAngle,
		shouldPlayReturnBeat,
		nextWorkshopPose,
		workshopPoseHoldMs,
		WORKSHOP_POSE_FIRST_MS,
		type Vec3
	} from '$lib/stores/workshop-logic';

	onMount(() => {
		let cancelled = false;
		let presenceTimer: ReturnType<typeof setTimeout> | null = null;
		let poseTimer: ReturnType<typeof setTimeout> | null = null;
		let beatTimer: ReturnType<typeof setTimeout> | null = null;
		let lookRaf = 0;
		let cursorPoll: ReturnType<typeof setTimeout> | null = null;

		function playBeat(beat: 'hands' | 'camera') {
			workshopStore.setBeat(beat);
			if (beat === 'camera') workshopStore.nudgeBlink();
			const duration = beatDurationMs(beat);
			if (beatTimer) clearTimeout(beatTimer);
			beatTimer = setTimeout(() => {
				workshopStore.setBeat('work');
			}, duration);
		}

		function schedulePresence() {
			if (presenceTimer) clearTimeout(presenceTimer);
			presenceTimer = setTimeout(() => {
				if (!cancelled && workshopStore.active && document.visibilityState === 'visible') {
					playBeat('hands');
				}
				schedulePresence();
			}, nextPresenceDelayMs());
		}

		function schedulePose(delayMs?: number) {
			if (poseTimer) clearTimeout(poseTimer);
			poseTimer = setTimeout(() => {
				if (
					!cancelled &&
					workshopStore.active &&
					document.visibilityState === 'visible' &&
					workshopStore.beat === 'work'
				) {
					workshopStore.setPoseId(nextWorkshopPose(workshopStore.poseId));
				}
				schedulePose();
			}, delayMs ?? workshopPoseHoldMs());
		}

		function onHidden() {
			workshopStore.markHidden();
		}

		function onShown() {
			const hiddenAt = workshopStore.takeHiddenAt();
			if (shouldPlayReturnBeat(hiddenAt, Date.now(), WORKSHOP_AWAY_MS)) {
				playBeat('camera');
			}
		}

		function onVisibility() {
			if (document.visibilityState === 'hidden') onHidden();
			else onShown();
		}

		document.addEventListener('visibilitychange', onVisibility);

		schedulePresence();
		schedulePose(WORKSHOP_POSE_FIRST_MS);

		let pointerX = window.innerWidth * 0.65;
		let pointerY = window.innerHeight * 0.4;
		function onPointerMove(e: MouseEvent) {
			pointerX = e.clientX;
			pointerY = e.clientY;
		}
		window.addEventListener('mousemove', onPointerMove);

		let screenLocal = { x: pointerX, y: pointerY, w: window.innerWidth, h: window.innerHeight };
		let haveScreenCursor = false;

		async function pollScreenCursor() {
			if (cancelled || !isTauri()) return;
			try {
				const cursor = await getScreenCursor();
				if (!cursor || cancelled) return;
				const { getCurrentWindow } = await import('@tauri-apps/api/window');
				const win = getCurrentWindow();
				const [origin, size, scale] = await Promise.all([
					win.outerPosition(),
					win.outerSize(),
					win.scaleFactor()
				]);
				screenLocal = {
					x: (cursor.x - origin.x) / scale,
					y: (cursor.y - origin.y) / scale,
					w: size.width / scale,
					h: size.height / scale
				};
				haveScreenCursor = true;
			} catch {
				// Keep last sample; window mousemove still works when the overlay is focused.
			}
			if (!cancelled) cursorPoll = window.setTimeout(pollScreenCursor, 32);
		}

		if (isTauri()) void pollScreenCursor();

		let current: Vec3 = { ...lookTargetForBeat('work') };
		let last = performance.now();

		function lookTick() {
			if (cancelled) return;
			const now = performance.now();
			const dt = Math.min(0.05, (now - last) / 1000);
			last = now;

			let target = lookTargetForBeat(workshopStore.beat);
			if (workshopStore.active && workshopStore.lookAt === 'cursor' && workshopStore.beat === 'work') {
				let nx = 0;
				let ny = 0;
				if (haveScreenCursor) {
					target = cursorToLookTarget(screenLocal.x, screenLocal.y, screenLocal.w, screenLocal.h);
					nx = cursorNx(screenLocal.x, screenLocal.w);
					ny = screenLocal.h > 0 ? (screenLocal.y / screenLocal.h) * 2 - 1 : 0;
				} else {
					target = cursorToLookTarget(pointerX, pointerY, window.innerWidth, window.innerHeight);
					nx = cursorNx(pointerX, window.innerWidth);
					ny = window.innerHeight > 0 ? (pointerY / window.innerHeight) * 2 - 1 : 0;
				}
				const desired = desiredYawFromNx(nx);
				const locked = poseLocksBody(workshopStore.poseId);
				const yaw = yawUpdateForPose(
					locked,
					desired,
					workshopStore.yawMark,
					workshopStore.bodyYaw
				);
				workshopStore.setYawMark(yaw.mark);
				workshopStore.setBodyYaw(
					clampBodyYaw(smoothAngle(workshopStore.bodyYaw, yaw.bodyTarget, dt, 1.15))
				);
				workshopStore.setHeadYaw(smoothAngle(workshopStore.headYaw, yaw.head, dt, 2.6));
				workshopStore.setHeadPitch(
					smoothAngle(workshopStore.headPitch, headPitchFromNy(ny), dt, 2.4)
				);
			} else if (workshopStore.active) {
				workshopStore.setYawMark(0);
				workshopStore.setBodyYaw(
					clampBodyYaw(smoothAngle(workshopStore.bodyYaw, 0, dt, 1.15))
				);
				workshopStore.setHeadYaw(smoothAngle(workshopStore.headYaw, 0, dt, 2.2));
				workshopStore.setHeadPitch(smoothAngle(workshopStore.headPitch, 0, dt, 2.2));
			}

			current = smoothLookVec(current, target, dt);
			workshopStore.setLookWorld(current);
			lookRaf = requestAnimationFrame(lookTick);
		}

		lookTick();

		return () => {
			cancelled = true;
			if (presenceTimer) clearTimeout(presenceTimer);
			if (poseTimer) clearTimeout(poseTimer);
			if (beatTimer) clearTimeout(beatTimer);
			if (cursorPoll) clearTimeout(cursorPoll);
			cancelAnimationFrame(lookRaf);
			window.removeEventListener('mousemove', onPointerMove);
			document.removeEventListener('visibilitychange', onVisibility);
		};
	});
</script>
