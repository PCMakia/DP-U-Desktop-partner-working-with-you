import { isTauri } from '$lib/services/platform';
import { looksLikeAliceYueLlama } from './brain-logic';

export { looksLikeAliceYueLlama };

export interface BrainStatus {
	llama: boolean;
}

export async function getAliceYueBrainStatus(): Promise<BrainStatus> {
	if (isTauri()) {
		try {
			const { invoke } = await import('@tauri-apps/api/core');
			const llama = await invoke<boolean>('alice_yue_brain_status');
			return { llama };
		} catch {
			// Fall through to the Vite/SvelteKit helper used by pnpm dev
		}
	}

	const res = await fetch('/api/alice-yue/brain');
	if (!res.ok) {
		throw new Error(await res.text());
	}
	return await res.json();
}

export async function controlAliceYueBrain(
	action: 'wake' | 'park',
	opts: { discord?: boolean } = {}
): Promise<void> {
	if (isTauri()) {
		try {
			const { invoke } = await import('@tauri-apps/api/core');
			await invoke('alice_yue_brain', { action, discord: opts.discord === true });
			return;
		} catch {
			// Fall through
		}
	}

	const res = await fetch('/api/alice-yue/brain', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ action, discord: opts.discord === true })
	});
	if (!res.ok) {
		const body = await res.json().catch(() => null);
		throw new Error(body?.message || body?.error || `Brain ${action} failed`);
	}
}

export async function ensureAliceYueLlamaReady(opts: {
	baseUrl?: string;
	onWaiting?: () => void;
	timeoutMs?: number;
}): Promise<void> {
	if (!looksLikeAliceYueLlama(opts.baseUrl)) return;

	const timeoutMs = opts.timeoutMs ?? 180_000;
	let status = await getAliceYueBrainStatus().catch(() => ({ llama: false }));
	if (status.llama) return;

	opts.onWaiting?.();
	await controlAliceYueBrain('wake');

	const started = Date.now();
	while (Date.now() - started < timeoutMs) {
		await new Promise((r) => setTimeout(r, 2000));
		status = await getAliceYueBrainStatus().catch(() => ({ llama: false }));
		if (status.llama) return;
	}

	throw new Error(
		'Eclipse did not come up in time. Start it with scripts\\12-wake-brain.ps1, then send again.'
	);
}
