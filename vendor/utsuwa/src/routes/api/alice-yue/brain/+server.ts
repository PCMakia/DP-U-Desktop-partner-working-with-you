import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isLoopbackAddress, parseBrainAction } from '$lib/alice-yue/brain-logic';
import { probeLlama, spawnBrainScript } from '$lib/alice-yue/brain-server';

function assertLocal(addr: string) {
	if (!isLoopbackAddress(addr)) {
		error(403, 'Brain control is local-only');
	}
}

export const GET: RequestHandler = async ({ getClientAddress }) => {
	assertLocal(getClientAddress());
	return json({ llama: await probeLlama() });
};

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	assertLocal(getClientAddress());
	const body = await request.json().catch(() => ({}));
	const action = parseBrainAction(body?.action);
	if (!action) {
		error(400, 'action must be wake or park');
	}
	try {
		spawnBrainScript(action, body?.discord === true);
	} catch (e) {
		error(500, e instanceof Error ? e.message : 'Failed to start brain script');
	}
	return json({ ok: true, action, discord: body?.discord === true });
};
