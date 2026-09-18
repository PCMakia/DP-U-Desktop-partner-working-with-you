import { browser } from '$app/environment';

export interface OverlayPosition {
	x: number;
	y: number;
}

function createOverlayStore() {
	// Overlay UI state
	let isActive = $state(false);
	let chatExpanded = $state(false);
	let chromeHidden = $state(false);
	let lastChromeToggle = 0;
	let position = $state<OverlayPosition>({ x: 100, y: 100 });

	// Load persisted position on init
	if (browser) {
		const saved = localStorage.getItem('utsuwa-overlay-position');
		if (saved) {
			try {
				position = JSON.parse(saved);
			} catch {
				// Use default
			}
		}
	}

	function setActive(active: boolean) {
		isActive = active;
		if (!active) {
			chatExpanded = false;
		}
	}

	function toggleActive() {
		setActive(!isActive);
	}

	function setChatExpanded(expanded: boolean) {
		chatExpanded = expanded;
	}

	function toggleChat() {
		chatExpanded = !chatExpanded;
	}

	function setPosition(newPosition: OverlayPosition) {
		position = newPosition;
		if (browser) {
			localStorage.setItem('utsuwa-overlay-position', JSON.stringify(position));
		}
	}

	function setChromeHidden(hidden: boolean) {
		chromeHidden = hidden;
		if (hidden) {
			chatExpanded = false;
		}
	}

	function toggleChromeHidden() {
		const now = Date.now();
		if (now - lastChromeToggle < 400) return;
		lastChromeToggle = now;
		setChromeHidden(!chromeHidden);
	}

	function activate() {
		isActive = true;
	}

	function deactivate() {
		isActive = false;
		chatExpanded = false;
	}

	return {
		get isActive() {
			return isActive;
		},
		get chatExpanded() {
			return chatExpanded;
		},
		get chromeHidden() {
			return chromeHidden;
		},
		get position() {
			return position;
		},
		setActive,
		toggleActive,
		setChatExpanded,
		toggleChat,
		setChromeHidden,
		toggleChromeHidden,
		setPosition,
		activate,
		deactivate
	};
}

export const overlayStore = createOverlayStore();
