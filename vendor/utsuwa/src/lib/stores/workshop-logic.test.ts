import test from 'node:test';
import assert from 'node:assert/strict';

import {
	parseWorkshopSettings,
	overlayHitRegions,
	shouldIgnoreCursor,
	shouldPlayReturnBeat,
	WORKSHOP_AWAY_MS,
	smoothVec,
	cursorToLookTarget,
	WORK_LOOK,
	RIGHT_LOOK,
	pointInRect,
	isChromeToggleHotkey,
	yawMarkFromNx,
	nextYawMark,
	desiredYawFromNx,
	headYawFromDesired,
	NECK_YAW_LIMIT,
	bodyYawForMark,
	BODY_YAW_MAX,
	clampBodyYaw,
	nextWorkshopPose,
	workshopPoseHoldMs,
	WORKSHOP_POSE_FIRST_MS,
	poseLocksBody,
	yawUpdateForPose
} from './workshop-logic.ts';

test('workshop defaults to enabled editor look-at', () => {
	assert.deepEqual(parseWorkshopSettings(null), { enabled: true, lookAt: 'editor' });
	assert.deepEqual(parseWorkshopSettings('not-json'), { enabled: true, lookAt: 'editor' });
});

test('parses workshop settings', () => {
	assert.equal(parseWorkshopSettings({ enabled: false, lookAt: 'cursor' }).enabled, false);
	assert.equal(parseWorkshopSettings({ lookAt: 'cursor' }).lookAt, 'cursor');
	assert.equal(parseWorkshopSettings({ lookAt: 'nope' }).lookAt, 'editor');
});

test('quiet overlay only hits the rail and resize strip', () => {
	const regions = overlayHitRegions({
		winW: 400,
		winH: 600,
		chromeVisible: false,
		chatExpanded: false,
		cameraOpen: false,
		resizing: false
	});
	assert.equal(regions.length, 2);
	assert.equal(shouldIgnoreCursor(false), true);
	assert.equal(shouldIgnoreCursor(true), false);
	assert.equal(pointInRect(380, 20, regions[0]), true);
	assert.equal(pointInRect(20, 20, regions[1]), true);
	assert.equal(pointInRect(200, 300, regions[0]), false);
});

test('hidden chrome has no hit regions', () => {
	const regions = overlayHitRegions({
		winW: 400,
		winH: 600,
		chromeVisible: false,
		chatExpanded: false,
		cameraOpen: false,
		resizing: false,
		chromeHidden: true
	});
	assert.deepEqual(regions, []);
});

test('chrome toggle hotkey is ctrl+alt+right shift', () => {
	assert.equal(
		isChromeToggleHotkey({ ctrlKey: true, metaKey: false, altKey: true, code: 'ShiftRight' }),
		true
	);
	assert.equal(
		isChromeToggleHotkey({ ctrlKey: true, metaKey: false, altKey: true, code: 'ShiftLeft' }),
		false
	);
	assert.equal(
		isChromeToggleHotkey({
			ctrlKey: true,
			metaKey: false,
			altKey: true,
			code: 'ShiftRight',
			repeat: true
		}),
		false
	);
});

test('expanded chrome captures the full window', () => {
	const regions = overlayHitRegions({
		winW: 400,
		winH: 600,
		chromeVisible: false,
		chatExpanded: true,
		cameraOpen: false,
		resizing: false
	});
	assert.deepEqual(regions, [{ x: 0, y: 0, w: 400, h: 600 }]);
});

test('return beat only after a long absence', () => {
	assert.equal(shouldPlayReturnBeat(null, 1_000_000), false);
	assert.equal(shouldPlayReturnBeat(1_000_000 - WORKSHOP_AWAY_MS + 1, 1_000_000), false);
	assert.equal(shouldPlayReturnBeat(1_000_000 - WORKSHOP_AWAY_MS, 1_000_000), true);
});

test('look-at smoothing does not jump', () => {
	const next = smoothVec({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }, 0.016);
	assert.ok(next.x > 0 && next.x < 0.2);
});

test('cursor look stays near the editor point', () => {
	const left = cursorToLookTarget(20, 300, 400, 600);
	assert.ok(Math.abs(left.x - WORK_LOOK.x) < 0.5);
	assert.ok(Math.abs(left.y - WORK_LOOK.y) < 0.3);
});

test('cursor over the body shifts look horizontally', () => {
	const left = cursorToLookTarget(40, 300, 400, 600);
	const mid = cursorToLookTarget(200, 300, 400, 600);
	const right = cursorToLookTarget(380, 300, 400, 600);
	assert.ok(mid.x > left.x + 0.4);
	assert.ok(right.x > mid.x + 0.4);
	assert.ok(Math.abs(right.x - RIGHT_LOOK.x) < 0.6);
});

test('body yaw snaps to 0 / 40 with hysteresis', () => {
	assert.equal(yawMarkFromNx(-1, 0), 0);
	assert.equal(nextYawMark(NECK_YAW_LIMIT * 0.5, 0), 0);
	assert.equal(nextYawMark(NECK_YAW_LIMIT + 0.2, 0), 40);
	assert.equal(nextYawMark(0, 40), 0);
	assert.equal(bodyYawForMark(0), 0);
	assert.ok(Math.abs(bodyYawForMark(40) - BODY_YAW_MAX) < 1e-9);
	assert.ok(BODY_YAW_MAX < 0.8);
	assert.equal(clampBodyYaw(4), BODY_YAW_MAX);
	assert.equal(clampBodyYaw(-1), 0);
});

test('head takes ±30° before the body turns', () => {
	const half = NECK_YAW_LIMIT * 0.5;
	assert.ok(Math.abs(headYawFromDesired(half, 0) - half) < 1e-9);
	assert.equal(headYawFromDesired(1.2, 0), NECK_YAW_LIMIT);
	assert.equal(headYawFromDesired(-1.2, 0), -NECK_YAW_LIMIT);
	assert.ok(desiredYawFromNx(-1) < 0.2);
	assert.ok(desiredYawFromNx(1) <= BODY_YAW_MAX + NECK_YAW_LIMIT + 1e-9);
});

test('workshop pose cycle never repeats the current id', () => {
	assert.notEqual(nextWorkshopPose('sit', () => 0), 'sit');
	assert.notEqual(nextWorkshopPose('leanCheek', () => 0), 'leanCheek');
	assert.ok(workshopPoseHoldMs(() => 0) >= 90_000);
	assert.ok(workshopPoseHoldMs(() => 1) <= 241_000);
	assert.equal(WORKSHOP_POSE_FIRST_MS, 45_000);
});

test('lean-on-table pose locks body yaw and only turns the head', () => {
	assert.equal(poseLocksBody('leanCheek'), true);
	assert.equal(poseLocksBody('sit'), false);
	assert.equal(poseLocksBody('rest'), true);
	const locked = yawUpdateForPose(true, NECK_YAW_LIMIT + 0.4, 40, BODY_YAW_MAX);
	assert.equal(locked.mark, 0);
	assert.equal(locked.bodyTarget, 0);
	assert.equal(locked.head, NECK_YAW_LIMIT);
	const free = yawUpdateForPose(false, NECK_YAW_LIMIT + 0.2, 0, 0);
	assert.equal(free.mark, 40);
	assert.ok(free.bodyTarget > 0);
});

test('cursor outside the overlay still shifts gaze', () => {
	const left = cursorToLookTarget(-400, 300, 400, 600);
	assert.ok(Math.abs(left.x - WORK_LOOK.x) < 0.2);
	const farRight = cursorToLookTarget(800, 300, 400, 600);
	assert.ok(farRight.x > WORK_LOOK.x + 1);
});
