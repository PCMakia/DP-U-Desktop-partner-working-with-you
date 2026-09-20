<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { initializeHotkeys, onHotkeyEvent, isTauri, restoreOverlayDesktop } from '$lib/services/platform';
	import { overlayStore } from '$lib/stores/overlay.svelte';
	import { sttStore } from '$lib/stores/stt.svelte';
	import { settingsStore } from '$lib/stores/settings.svelte';

	interface Props {
		onSendMessage?: (text: string) => void;
	}

	let { onSendMessage }: Props = $props();

	onMount(() => {
		if (!browser || !isTauri()) return;

		// Initialize hotkeys with user's configured shortcuts
		initializeHotkeys(settingsStore.hotkeys);

		function restoreShortcuts() {
			void initializeHotkeys(settingsStore.hotkeys);
			void restoreOverlayDesktop();
		}

		let beenHidden = false;
		function onVisChange() {
			if (document.visibilityState === 'hidden') {
				beenHidden = true;
				return;
			}
			if (!beenHidden) return;
			beenHidden = false;
			restoreShortcuts();
		}

		document.addEventListener('visibilitychange', onVisChange);

		// Handle push-to-talk
		const unsubPTTStart = onHotkeyEvent('ptt:start', () => {
			if (sttStore.isSupported()) {
				sttStore.startListening((text) => {
					onSendMessage?.(text);
				});
			}
		});

		const unsubPTTStop = onHotkeyEvent('ptt:stop', () => {
			// STT will automatically send on stop if there's a transcript
			sttStore.stopListening();
		});

		// Handle overlay toggle
		const unsubToggle = onHotkeyEvent('overlay:toggle', async () => {
			// Call Tauri command to toggle window visibility
			try {
				const { invoke } = await import('@tauri-apps/api/core');
				await invoke('toggle_overlay');
			} catch (e) {
				console.error('Failed to toggle overlay:', e);
			}
		});

		// Handle focus chat
		const unsubFocus = onHotkeyEvent('chat:focus', () => {
			overlayStore.setChatExpanded(true);
			overlayStore.activate();
		});

		const unsubChrome = onHotkeyEvent('overlay:chrome', () => {
			overlayStore.toggleChromeHidden();
		});

		let cancelled = false;
		let unlistenTauri: (() => void) | undefined;
		(async () => {
			try {
				const { listen } = await import('@tauri-apps/api/event');
				const unlisten = await listen('overlay-chrome-toggle', () => {
					overlayStore.toggleChromeHidden();
				});
				if (cancelled) unlisten();
				else unlistenTauri = unlisten;
			} catch (e) {
				console.error('Failed to listen for overlay chrome hotkey:', e);
			}
		})();

		let unlistenRestore: (() => void) | undefined;
		(async () => {
			try {
				const { listen } = await import('@tauri-apps/api/event');
				const unlisten = await listen('overlay-restore-desktop', () => {
					restoreShortcuts();
				});
				if (cancelled) unlisten();
				else unlistenRestore = unlisten;
			} catch {
				// Native restore event is optional; visibility/focus still recover.
			}
		})();

		return () => {
			cancelled = true;
			unsubPTTStart();
			unsubPTTStop();
			unsubToggle();
			unsubFocus();
			unsubChrome();
			unlistenTauri?.();
			unlistenRestore?.();
			document.removeEventListener('visibilitychange', onVisChange);
		};
	});
</script>
