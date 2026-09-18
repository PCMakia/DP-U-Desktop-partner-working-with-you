export type BrainAction = 'wake' | 'park';

export function parseBrainAction(raw: unknown): BrainAction | null {
	return raw === 'wake' || raw === 'park' ? raw : null;
}

export function isLoopbackAddress(addr: string): boolean {
	const host = addr.replace(/^::ffff:/, '').split('%')[0];
	return host === '127.0.0.1' || host === '::1' || host === 'localhost' || host === '::ffff:127.0.0.1';
}

export function looksLikeAliceYueLlama(baseUrl: string | undefined): boolean {
	if (!baseUrl) return false;
	try {
		const url = new URL(baseUrl);
		const local = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
		return local && url.port === '8081';
	} catch {
		return /127\.0\.0\.1:8081|localhost:8081/.test(baseUrl);
	}
}

export function llamaHealthUrls(baseUrl = 'http://127.0.0.1:8081/v1'): string[] {
	const trimmed = baseUrl.replace(/\/+$/, '').replace(/\/v1$/i, '');
	return [`${trimmed}/health`, `${trimmed}/v1/models`];
}
