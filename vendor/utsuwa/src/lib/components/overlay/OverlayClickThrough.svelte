<script lang="ts">
	import { onMount } from 'svelte';
	import { isTauri, setIgnoreCursorEvents, getScreenCursor } from '$lib/services/platform';
	import { overlayStore } from '$lib/stores/overlay.svelte';
	import { workshopStore } from '$lib/stores/workshop.svelte';
	import { overlayHitRegions, pointInRect, shouldIgnoreCursor } from '$lib/stores/workshop-logic';

	interface Props {
		cameraOpen: boolean;
		resizing: boolean;
	}

	let { cameraOpen, resizing }: Props = $props();

	onMount(() => {
		if (!isTauri()) return;

		let cancelled = false;
		let lastIgnore: boolean | null = null;

		async function tick() {
			if (cancelled) return;
			try {
				const chromeHidden = overlayStore.chromeHidden;
				if (chromeHidden && workshopStore.active) {
					if (lastIgnore !== true) {
						lastIgnore = true;
						await setIgnoreCursorEvents(true);
					}
					if (!cancelled) window.setTimeout(tick, 50);
					return;
				}

				const { getCurrentWindow } = await import('@tauri-apps/api/window');
				const win = getCurrentWindow();
				const [cursor, origin, size, scale] = await Promise.all([
					getScreenCursor(),
					win.outerPosition(),
					win.outerSize(),
					win.scaleFactor()
				]);

				const winW = size.width / scale;
				const winH = size.height / scale;
				const regions = overlayHitRegions({
					winW,
					winH,
					chromeVisible: overlayStore.chatExpanded,
					chatExpanded: overlayStore.chatExpanded,
					cameraOpen,
					resizing,
					chromeHidden: false
				});

				let overHit = workshopStore.active === false;
				if (!cursor) {
					// Native cursor query failed — keep the rail/resize clickable.
					overHit = true;
				} else {
					const localX = (cursor.x - origin.x) / scale;
					const localY = (cursor.y - origin.y) / scale;
					overHit = regions.some((rect) => pointInRect(localX, localY, rect));
				}

				const ignore = workshopStore.active ? shouldIgnoreCursor(overHit) : false;
				if (ignore !== lastIgnore) {
					lastIgnore = ignore;
					await setIgnoreCursorEvents(ignore);
				}
			} catch (e) {
				console.error('Overlay click-through tick failed:', e);
			}

			if (!cancelled) {
				window.setTimeout(tick, 50);
			}
		}

		tick();
		return () => {
			cancelled = true;
			setIgnoreCursorEvents(false).catch(() => {});
		};
	});
</script>
