/**
 * First-run wiring for this DP&U checkout.
 * Seeds llama.cpp as the OpenAI-compatible provider and enables chat.
 * Does not overwrite settings the user already saved.
 */
import { LLAMA_BASE_URL, LLAMA_MODEL_ID } from './persona';

const SEED_KEY = 'dpu-wired-v1';
const VOICE_KEY = 'dpu-voice-lock-v1';

export function seedAliceYueLocalStack(): void {
	if (typeof localStorage === 'undefined') return;

	if (!localStorage.getItem(SEED_KEY)) {
		if (!localStorage.getItem('utsuwa-settings')) {
			localStorage.setItem(
				'utsuwa-settings',
				JSON.stringify({
					providerConfigs: {
						'openai-compatible': {
							baseUrl: LLAMA_BASE_URL,
							cachedModels: [{ id: LLAMA_MODEL_ID, name: 'Eclipse 12B (local llama.cpp)' }],
							modelsFetchedAt: Date.now()
						}
					},
					addedProviders: { 'openai-compatible': true },
					hotkeys: {}
				})
			);
		}

		const consciousnessKey = 'utsuwa-module-consciousness';
		if (!localStorage.getItem(consciousnessKey)) {
			localStorage.setItem(
				consciousnessKey,
				JSON.stringify({
					enabled: true,
					configured: true,
					settings: {
						activeProvider: 'openai-compatible',
						activeModel: LLAMA_MODEL_ID,
						temperature: 0.9,
						topP: 0.95,
						maxTokens: 256,
						contextSize: 8192,
						presencePenalty: 0,
						frequencyPenalty: 0
					}
				})
			);
		}

		localStorage.setItem(SEED_KEY, '1');
	}

	if (!localStorage.getItem(VOICE_KEY)) {
		const consciousnessKey = 'utsuwa-module-consciousness';
		const raw = localStorage.getItem(consciousnessKey);
		if (raw) {
			try {
				const parsed = JSON.parse(raw);
				if (parsed?.settings) {
					parsed.settings.maxTokens = 256;
					localStorage.setItem(consciousnessKey, JSON.stringify(parsed));
				}
			} catch {
				// ignore malformed consciousness settings
			}
		}
		localStorage.setItem(VOICE_KEY, '1');
	}
}
