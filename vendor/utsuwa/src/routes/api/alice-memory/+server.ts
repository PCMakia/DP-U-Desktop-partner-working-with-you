import type { RequestHandler } from './$types';
import { OWNER_PERSON_KEY, parseMemoryKey } from '$lib/alice-yue/memory/keys';
import { buildMentionLinks } from '$lib/alice-yue/memory/overview';
import {
	appendFact,
	appendTurn,
	listFactsForMonitor,
	listPersons,
	loadIdentity,
	personCorpus
} from '$lib/alice-yue/memory/store';

export const GET: RequestHandler = async ({ url }) => {
	try {
		const identity = loadIdentity();
		const memoryKey = url.searchParams.get('memoryKey');
		if (memoryKey) {
			parseMemoryKey(memoryKey);
			const facts = listFactsForMonitor(memoryKey, { identity });
			return Response.json({
				ok: true,
				memoryKey,
				facts: facts.map((fact) => ({
					id: fact.id,
					memoryKey: fact.memoryKey,
					content: fact.content,
					createdAt: fact.createdAt
				}))
			});
		}

		const persons = listPersons({ identity });
		const links = buildMentionLinks(
			persons.map((person) => ({
				memoryKey: person.memoryKey,
				displayName: person.displayName,
				corpus: personCorpus(person.memoryKey, { identity })
			}))
		);
		return Response.json({ ok: true, persons, links });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'memory read failed';
		return Response.json({ ok: false, error: message }, { status: 400 });
	}
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const actorPersonKey = String(body.actorPersonKey || OWNER_PERSON_KEY);
		if (body.userMessage) {
			appendTurn({ actorPersonKey, role: 'user', content: String(body.userMessage) });
		}
		if (body.assistantMessage) {
			appendTurn({ actorPersonKey, role: 'assistant', content: String(body.assistantMessage) });
		}
		if (body.fact) {
			appendFact({ actorPersonKey, content: String(body.fact) });
		}
		return Response.json({ ok: true });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'memory write failed';
		return Response.json({ ok: false, error: message }, { status: 400 });
	}
};
